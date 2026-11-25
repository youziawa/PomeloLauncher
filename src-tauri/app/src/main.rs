//! PomeloLauncher 桌面外壳（Tauri 2）
//!
//! 命令层只做薄封装：业务逻辑全部在 `pomelo-core` / `pomelo-downloader`，
//! 保证 CLI 与 GUI 共用同一套实现（企划书 §7 架构要求）。
//!
//! 注意：本 crate 使用 MSVC 工具链构建（Windows 官方支持路径）：
//!   cd src-tauri/app && cargo tauri dev
//! GNU 工具链仅用于 core/downloader/cli 的测试与验证。

use pomelo_core::auth::OfflineAccount;
use pomelo_core::instance::{is_installed, Instance, InstanceStore};
use pomelo_core::java::{scan_java, JavaRuntime};
use pomelo_downloader::{extract_natives, DownloadItem, Downloader};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{Emitter, State};

struct AppState {
    store: InstanceStore,
}

#[derive(Serialize, Clone)]
struct SystemInfo {
    app_version: String,
    data_root: String,
    platform: String,
    /// 桌面核心是否可用（前端据此切换 mock / 真实数据）
    desktop_core: bool,
}

#[derive(Serialize, Clone)]
struct InstallProgress {
    phase: String,
    current: usize,
    total: usize,
    message: String,
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
fn create_instance(state: State<AppState>, name: String, version: String, loader: String) -> Result<Instance, String> {
    state.store.create(&name, &version, &loader).map_err(|e| e.to_string())
}

#[tauri::command]
fn refresh_installed(state: State<AppState>) -> Vec<Instance> {
    for mut inst in state.store.list() {
        inst.installed = is_installed(&state.store, &inst);
        let _ = state.store.save(&inst);
    }
    state.store.list()
}

#[tauri::command]
fn open_data_dir(state: State<AppState>) -> Result<(), String> {
    let root = state.store.root.clone();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&root)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
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

/// 安装版本（由用户显式调用；前端必须先确认实例与版本）
#[tauri::command]
async fn install_instance(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    mirror: bool,
) -> Result<(), String> {
    let store = InstanceStore::new(state.store.root.clone());
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
            target: store
                .versions_dir(&inst.id)
                .join(&resolved.jar_id)
                .join(format!("{}.jar", resolved.jar_id)),
            sha1: art.sha1.clone(),
            size: art.size,
        });
    }
    for lib in pomelo_core::meta::classpath_libraries(&resolved, &env) {
        let Some(art) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) else { continue };
        let rel = art.path.clone().or_else(|| pomelo_core::meta::library_path(&lib.name));
        let Some(rel) = rel else { continue };
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
            let dl = Downloader::new(mirror, 8);
            let _ = dl;
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
    let summary = Downloader::new(mirror, 8).download_all(items).await.map_err(|e| e.to_string())?;
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
    Ok(())
}

/// 启动实例（离线账户；正式版在此接入微软账户与可见性策略）
#[tauri::command]
async fn launch_instance(state: State<'_, AppState>, id: String, offline_name: String, memory: u32) -> Result<u32, String> {
    let store = InstanceStore::new(state.store.root.clone());
    let inst = store.load(&id).map_err(|e| e.to_string())?;
    let chain = pomelo_core::meta::load_version_chain(&store.versions_dir(&inst.id), &inst.mc_version, pomelo_core::meta::OFFICIAL_MANIFEST)
        .await
        .map_err(|e| e.to_string())?;
    let resolved = pomelo_core::meta::resolve_chain(&chain).map_err(|e| e.to_string())?;
    let env = pomelo_core::meta::Env::current();

    let java_path = match &inst.java_path {
        Some(p) => PathBuf::from(p),
        None => {
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
        client_jar: store
            .versions_dir(&inst.id)
            .join(&resolved.jar_id)
            .join(format!("{}.jar", resolved.jar_id)),
    };
    for (_, art) in pomelo_core::meta::native_artifacts(&resolved, &env) {
        let Some(rel) = art.path.clone() else { continue };
        extract_natives(&store.libraries_dir(&inst.id).join(rel), &paths.natives_dir, &[]).map_err(|e| e.to_string())?;
    }
    let account = OfflineAccount::new(&offline_name);
    let args = pomelo_core::launch::build_arguments(&resolved, &paths, &inst, &account, memory, false, &env)
        .map_err(|e| e.to_string())?;
    let child = pomelo_core::launch::spawn(&java_path, &args, &paths.game_dir).map_err(|e| e.to_string())?;
    Ok(child.id())
}

#[tauri::command]
fn read_log(state: State<AppState>, id: String, max_lines: usize) -> Result<String, String> {
    let path = state.store.log_path(&id);
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].join("\n"))
}

fn main() {
    let store = InstanceStore::new(InstanceStore::default_root());
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { store })
        .invoke_handler(tauri::generate_handler![
            system_info,
            list_java,
            list_instances,
            create_instance,
            refresh_installed,
            open_data_dir,
            install_instance,
            launch_instance,
            read_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running PomeloLauncher");
}
