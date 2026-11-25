//! PomeloLauncher 桌面外壳（Tauri 2）
//!
//! 业务逻辑全部在 `pomelo-core` / `pomelo-downloader`，本层只做薄封装与事件桥接：
//! - 实例：列表 / 创建 / 更新 / 删除
//! - 安装：显式触发，下载进度通过 `install-progress` 事件推送
//! - 启动：离线账户启动原版实例，`game-exit` 事件回传退出码
//! - 账户：离线账户的增删查（Microsoft 登录在 M1 后续接入）

use pomelo_core::auth::{load_accounts, save_accounts, OfflineAccount, StoredAccount};
use pomelo_core::instance::{is_installed, Instance, InstanceStore};
use pomelo_core::java::{scan_java, JavaRuntime};
use pomelo_downloader::{extract_natives, DownloadItem, Downloader};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Child;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, State};

struct AppState {
    store: InstanceStore,
    game: Arc<Mutex<Option<Child>>>,
}

#[derive(Serialize, Clone)]
struct SystemInfo {
    app_version: String,
    data_root: String,
    platform: String,
    desktop_core: bool,
}

#[derive(Serialize, Clone)]
struct InstallProgress {
    phase: String,
    current: usize,
    total: usize,
    message: String,
}

#[derive(Serialize, Clone)]
struct VersionInfo {
    id: String,
    kind: String,
    release_time: Option<String>,
}

fn store_of(state: &AppState) -> InstanceStore {
    InstanceStore::new(state.store.root.clone())
}

#[tauri::command]
fn system_info(state: State<AppState>) -> SystemInfo {
    SystemInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        data_root: state.store.root.display().to_string(),
        platform: std::env::consts::OS.to_string(),
        desktop_core: true,
    }
}

#[tauri::command]
fn list_java() -> Vec<JavaRuntime> {
    scan_java()
}

#[tauri::command]
fn list_instances(state: State<AppState>) -> Vec<Instance> {
    state.store.list()
}

#[tauri::command]
fn game_running(state: State<AppState>) -> Option<u32> {
    let mut guard = state.game.lock().ok()?;
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
                None
            }
            _ => Some(child.id()),
        }
    } else {
        None
    }
}

#[tauri::command]
fn stop_game(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.game.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        child.kill().map_err(|e| e.to_string())?;
        let _ = child.wait();
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
fn create_instance(state: State<AppState>, name: String, version: String, loader: String) -> Result<Instance, String> {
    state.store.create(&name, &version, &loader).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_instance(
    state: State<AppState>,
    id: String,
    memory_mb: Option<u32>,
    java_path: Option<String>,
) -> Result<Instance, String> {
    let store = store_of(&state);
    let mut inst = store.load(&id).map_err(|e| e.to_string())?;
    if let Some(m) = memory_mb {
        inst.memory_mb = m.clamp(512, 32768);
    }
    if let Some(j) = java_path {
        inst.java_path = if j.trim().is_empty() { None } else { Some(j) };
    }
    store.save(&inst).map_err(|e| e.to_string())?;
    Ok(inst)
}

#[tauri::command]
fn delete_instance(state: State<AppState>, id: String) -> Result<(), String> {
    let store = store_of(&state);
    let dir = store.instance_dir(&id);
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_data_dir(state: State<AppState>) -> Result<(), String> {
    let root = state.store.root.clone();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer").arg(&root).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&root).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(&root).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn list_versions(limit: usize) -> Result<Vec<VersionInfo>, String> {
    let manifest = pomelo_core::meta::fetch_manifest_fallback(&[
        pomelo_core::meta::OFFICIAL_MANIFEST,
        pomelo_core::meta::BMCLAPI_MANIFEST,
    ])
    .await
    .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for v in manifest.versions.into_iter().filter(|v| v.kind == "release") {
        out.push(VersionInfo { id: v.id, kind: v.kind, release_time: v.release_time });
        if out.len() >= limit.clamp(1, 100) {
            break;
        }
    }
    Ok(out)
}

/* ---------------- 安装 ---------------- */

#[tauri::command]
async fn install_instance(app: tauri::AppHandle, state: State<'_, AppState>, id: String, mirror: bool) -> Result<(), String> {
    let store = store_of(&state);
    let inst = store.load(&id).map_err(|e| e.to_string())?;
    let manifest_url = if mirror {
        pomelo_core::meta::BMCLAPI_MANIFEST
    } else {
        pomelo_core::meta::OFFICIAL_MANIFEST
    };
    let _ = app.emit(
        "install-progress",
        InstallProgress { phase: "resolve".into(), current: 0, total: 0, message: format!("解析版本 {}", inst.mc_version) },
    );
    let chain = pomelo_core::meta::load_version_chain(&store.versions_dir(&inst.id), &inst.mc_version, manifest_url)
        .await
        .map_err(|e| e.to_string())?;
    let resolved = pomelo_core::meta::resolve_chain(&chain).map_err(|e| e.to_string())?;
    let env = pomelo_core::meta::Env::current();

    let mut items: Vec<DownloadItem> = Vec::new();
    if let Some(art) = resolved.downloads.as_ref().and_then(|d| d.client.as_ref()) {
        items.push(DownloadItem {
            url: art.url.clone(),
            target: store.versions_dir(&inst.id).join(&resolved.jar_id).join(format!("{}.jar", resolved.jar_id)),
            sha1: art.sha1.clone(),
            size: art.size,
        });
    }
    for lib in pomelo_core::meta::classpath_libraries(&resolved, &env) {
        let Some(art) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) else { continue };
        let Some(rel) = art.path.clone().or_else(|| pomelo_core::meta::library_path(&lib.name)) else { continue };
        items.push(DownloadItem {
            url: art.url.clone(),
            target: store.libraries_dir(&inst.id).join(rel),
            sha1: art.sha1.clone(),
            size: art.size,
        });
    }
    if let Some(index) = &resolved.asset_index {
        if let Some(url) = &index.url {
            items.push(DownloadItem {
                url: url.clone(),
                target: store.assets_dir(&inst.id).join("indexes").join(format!("{}.json", index.id)),
                sha1: index.sha1.clone(),
                size: index.size,
            });
            let client = reqwest::Client::builder().user_agent("PomeloLauncher/0.1").build().map_err(|e| e.to_string())?;
            let urls: Vec<String> = if mirror {
                vec![pomelo_downloader::mirror_url(url), url.clone()]
            } else {
                vec![url.clone()]
            };
            let mut index_json: Option<pomelo_core::meta::AssetIndex> = None;
            let mut last_err = String::new();
            for u in urls {
                match client.get(&u).send().await {
                    Ok(resp) => match resp.json::<pomelo_core::meta::AssetIndex>().await {
                        Ok(v) => {
                            index_json = Some(v);
                            break;
                        }
                        Err(e) => last_err = e.to_string(),
                    },
                    Err(e) => last_err = e.to_string(),
                }
            }
            let index_json = index_json.ok_or(last_err)?;
            for obj in index_json.objects.values() {
                let prefix = &obj.hash[0..2];
                items.push(DownloadItem {
                    url: format!("{}/{}/{}", pomelo_core::meta::ASSET_BASE, prefix, obj.hash),
                    target: store.assets_dir(&inst.id).join("objects").join(prefix).join(&obj.hash),
                    sha1: Some(obj.hash.clone()),
                    size: Some(obj.size),
                });
            }
        }
    }

    let total = items.len();
    let _ = app.emit(
        "install-progress",
        InstallProgress { phase: "download".into(), current: 0, total, message: format!("下载 {} 个文件", total) },
    );
    let ah = app.clone();
    let ticks = Arc::new(AtomicUsize::new(0));
    let summary = Downloader::new(mirror, 8)
        .download_all_with_progress(items, move |cur, total| {
            let n = ticks.fetch_add(1, Ordering::SeqCst);
            if n % 20 == 0 || cur == total {
                let _ = ah.emit(
                    "install-progress",
                    InstallProgress {
                        phase: "download".into(),
                        current: cur,
                        total,
                        message: format!("下载中 {}/{}", cur, total),
                    },
                );
            }
        })
        .await
        .map_err(|e| e.to_string())?;

    // 旧版 natives（带 natives 映射的库）解压
    for (_, art) in pomelo_core::meta::native_artifacts(&resolved, &env) {
        if let Some(rel) = art.path.clone() {
            let jar = store.libraries_dir(&inst.id).join(rel);
            let _ = extract_natives(&jar, &store.natives_dir(&inst.id, &resolved.id), &[]);
        }
    }

    let mut done = store.load(&inst.id).map_err(|e| e.to_string())?;
    done.installed = is_installed(&store, &done);
    store.save(&done).map_err(|e| e.to_string())?;
    let _ = app.emit(
        "install-progress",
        InstallProgress {
            phase: "done".into(),
            current: summary.downloaded + summary.skipped,
            total: summary.total,
            message: format!("完成：新增 {}，跳过 {}，失败 {}", summary.downloaded, summary.skipped, summary.failed),
        },
    );
    if summary.failed > 0 {
        return Err(format!("{} 个文件下载失败，可重试", summary.failed));
    }
    Ok(())
}

/* ---------------- 启动 ---------------- */

#[tauri::command]
async fn launch_instance(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    offline_name: String,
    memory: u32,
) -> Result<u32, String> {
    let store = store_of(&state);
    let inst = store.load(&id).map_err(|e| e.to_string())?;
    let chain = pomelo_core::meta::load_version_chain(
        &store.versions_dir(&inst.id),
        &inst.mc_version,
        pomelo_core::meta::OFFICIAL_MANIFEST,
    )
    .await
    .map_err(|e| e.to_string())?;
    let resolved = pomelo_core::meta::resolve_chain(&chain).map_err(|e| e.to_string())?;
    let env = pomelo_core::meta::Env::current();

    let java_path = match &inst.java_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            let runtimes = scan_java();
            pomelo_core::java::select_java(&runtimes, &inst.mc_version)
                .map_err(|e| e.to_string())?
                .path
                .clone()
        }
    };

    let paths = pomelo_core::launch::LaunchPaths {
        game_dir: store.game_dir(&inst.id),
        libraries_dir: store.libraries_dir(&inst.id),
        assets_dir: store.assets_dir(&inst.id),
        natives_dir: store.natives_dir(&inst.id, &resolved.id),
        client_jar: store.versions_dir(&inst.id).join(&resolved.jar_id).join(format!("{}.jar", resolved.jar_id)),
    };
    if !paths.client_jar.exists() {
        return Err(format!("客户端文件不存在，请先安装 {}", inst.mc_version));
    }
    for (_, art) in pomelo_core::meta::native_artifacts(&resolved, &env) {
        if let Some(rel) = art.path.clone() {
            let _ = extract_natives(&store.libraries_dir(&inst.id).join(rel), &paths.natives_dir, &[]);
        }
    }

    let account = OfflineAccount::new(&offline_name);
    let args = pomelo_core::launch::build_arguments(&resolved, &paths, &inst, &account, memory, false, &env)
        .map_err(|e| e.to_string())?;
    let child = pomelo_core::launch::spawn(&java_path, &args, &paths.game_dir).map_err(|e| e.to_string())?;
    let pid = child.id();

    let slot = state.game.clone();
    if let Ok(mut guard) = slot.lock() {
        if let Some(mut old) = guard.take() {
            let _ = old.kill();
        }
        *guard = Some(child);
    }
    let ah = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(700));
        let mut guard = match slot.lock() {
            Ok(g) => g,
            Err(_) => break,
        };
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(status)) => {
                    *guard = None;
                    drop(guard);
                    let _ = ah.emit("game-exit", status.code());
                    break;
                }
                Ok(None) => {}
                Err(e) => {
                    *guard = None;
                    drop(guard);
                    let _ = ah.emit("game-exit", serde_json::json!({ "error": e.to_string() }));
                    break;
                }
            },
            None => break,
        }
    });
    Ok(pid)
}

/* ---------------- 账户 ---------------- */

#[tauri::command]
fn list_accounts(state: State<AppState>) -> Result<Vec<StoredAccount>, String> {
    load_accounts(&state.store.root).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_offline_account(state: State<AppState>, name: String) -> Result<Vec<StoredAccount>, String> {
    let name = name.trim().to_string();
    if name.chars().count() < 3 {
        return Err("昵称至少 3 个字符".into());
    }
    let mut accounts = load_accounts(&state.store.root).map_err(|e| e.to_string())?;
    if accounts.iter().any(|a| a.name == name) {
        return Err("该昵称已存在".into());
    }
    let acc = OfflineAccount::new(&name);
    accounts.push(StoredAccount {
        name,
        uuid: acc.uuid,
        kind: "offline".into(),
        access_token: acc.access_token,
        refresh_token: None,
    });
    save_accounts(&state.store.root, &accounts).map_err(|e| e.to_string())?;
    Ok(accounts)
}

#[tauri::command]
fn remove_account(state: State<AppState>, uuid: String) -> Result<Vec<StoredAccount>, String> {
    let mut accounts = load_accounts(&state.store.root).map_err(|e| e.to_string())?;
    accounts.retain(|a| a.uuid != uuid);
    save_accounts(&state.store.root, &accounts).map_err(|e| e.to_string())?;
    Ok(accounts)
}

/* ---------------- 日志 ---------------- */

#[tauri::command]
fn read_log(state: State<AppState>, id: String, max_lines: usize) -> Result<String, String> {
    let path = state.store.log_path(&id);
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines.clamp(10, 5000));
    Ok(lines[start..].join("\n"))
}

fn main() {
    let store = InstanceStore::new(InstanceStore::default_root());
    std::fs::create_dir_all(&store.root).ok();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { store, game: Arc::new(Mutex::new(None)) })
        .invoke_handler(tauri::generate_handler![
            system_info,
            list_java,
            list_versions,
            list_instances,
            game_running,
            stop_game,
            create_instance,
            update_instance,
            delete_instance,
            open_data_dir,
            install_instance,
            launch_instance,
            list_accounts,
            add_offline_account,
            remove_account,
            read_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running PomeloLauncher");
}
