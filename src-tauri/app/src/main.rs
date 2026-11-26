#![windows_subsystem = "windows"]

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
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

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
    latest: bool,
}

#[derive(Serialize, Clone)]
struct LoaderBuildInfo {
    version: String,
    stable: bool,
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
async fn create_instance(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    name: String,
    version: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<Instance, String> {
    let store = store_of(&state);
    let mut inst = store.create(&name, &version, &loader).map_err(|e| e.to_string())?;
    let want = loader_version.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if loader == "forge" || loader == "neoforge" {
        inst.loader_version = want.map(|s| s.to_string());
        store.save(&inst).map_err(|e| e.to_string())?;
        install_with_loader(&app, &store, &inst.id, true).await?;
        inst = store.load(&inst.id).map_err(|e| e.to_string())?;
        return Ok(inst);
    }
    if loader == "fabric" || loader == "quilt" {
        let base = if loader == "quilt" {
            pomelo_core::loaders::QUILT_META
        } else {
            pomelo_core::loaders::FABRIC_META
        };
        let (profile_id, profile) = pomelo_core::loaders::meta_profile(base, &version, want)
            .await
            .map_err(|e| e.to_string())?;
        let dir = store.versions_dir(&inst.id).join(&profile_id);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(
            dir.join(format!("{}.json", profile_id)),
            serde_json::to_vec_pretty(&profile).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        inst.launch_version = Some(profile_id);
        let marker = if loader == "quilt" {
            "org.quiltmc:quilt-loader:"
        } else {
            "net.fabricmc:fabric-loader:"
        };
        inst.loader_version = profile.libraries.iter().find_map(|l| {
            if l.name.starts_with(marker) {
                Some(l.name.rsplit(':').next().unwrap_or("").to_string())
            } else {
                None
            }
        }).or_else(|| want.map(|s| s.to_string()));
        store.save(&inst).map_err(|e| e.to_string())?;
        install_chain(&app, &store, &inst, true).await?;
        inst = store.load(&inst.id).map_err(|e| e.to_string())?;
    }
    Ok(inst)
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
async fn list_versions(kind: Option<String>, limit: Option<usize>) -> Result<Vec<VersionInfo>, String> {
    let manifest = pomelo_core::meta::fetch_manifest_fallback(&[
        pomelo_core::meta::OFFICIAL_MANIFEST,
        pomelo_core::meta::BMCLAPI_MANIFEST,
    ])
    .await
    .map_err(|e| e.to_string())?;
    let filter = kind.unwrap_or_else(|| "release".into());
    let cap = limit.unwrap_or(40);
    let latest_release = manifest.latest.release.clone();
    let latest_snapshot = manifest.latest.snapshot.clone();
    let mut out = Vec::new();
    for v in manifest.versions {
        let ok = match filter.as_str() {
            "all" => true,
            "old" => v.kind == "old_alpha" || v.kind == "old_beta",
            other => v.kind == other,
        };
        if !ok {
            continue;
        }
        let latest = v.id == latest_release || v.id == latest_snapshot;
        out.push(VersionInfo { id: v.id, kind: v.kind, release_time: v.release_time, latest });
        if cap > 0 && out.len() >= cap {
            break;
        }
    }
    Ok(out)
}

#[tauri::command]
async fn list_loader_versions(game_version: String, loader: String) -> Result<Vec<LoaderBuildInfo>, String> {
    let builds = pomelo_core::loaders::list_for(loader.trim(), game_version.trim())
        .await
        .map_err(|e| e.to_string())?;
    Ok(builds
        .into_iter()
        .map(|b| LoaderBuildInfo { version: b.version, stable: b.stable })
        .collect())
}

/* ---------------- 安装 ---------------- */

/// 共享安装流水线：解析版本链 → 下载（进度事件）→ natives → 标记已安装
async fn install_chain(app: &tauri::AppHandle, store: &InstanceStore, inst: &Instance, mirror: bool) -> Result<(), String> {
    let manifest_url = if mirror {
        pomelo_core::meta::BMCLAPI_MANIFEST
    } else {
        pomelo_core::meta::OFFICIAL_MANIFEST
    };
    let launch_id = pomelo_core::instance::launch_id(inst);
    let _ = app.emit(
        "install-progress",
        InstallProgress { phase: "resolve".into(), current: 0, total: 0, message: format!("解析版本 {}", launch_id) },
    );
    let chain = pomelo_core::meta::load_version_chain(&store.versions_dir(&inst.id), &launch_id, manifest_url)
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
        let Some(art) = pomelo_core::meta::artifact_of(lib) else { continue };
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

    for (_, art) in pomelo_core::meta::native_artifacts(&resolved, &env) {
        if let Some(rel) = art.path.clone() {
            let jar = store.libraries_dir(&inst.id).join(rel);
            let _ = extract_natives(&jar, &store.natives_dir(&inst.id, &resolved.id), &[]);
        }
    }

    let mut done = store.load(&inst.id).map_err(|e| e.to_string())?;
    done.installed = is_installed(store, &done);
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

#[tauri::command]
async fn install_instance(app: tauri::AppHandle, state: State<'_, AppState>, id: String, mirror: bool) -> Result<(), String> {
    let store = store_of(&state);
    install_with_loader(&app, &store, &id, mirror).await
}

/// 原版走下载链。Forge/NeoForge 先运行其官方安装器，再补齐版本链里缺的文件。
async fn install_with_loader(app: &tauri::AppHandle, store: &InstanceStore, id: &str, mirror: bool) -> Result<(), String> {
    let inst = store.load(id).map_err(|e| e.to_string())?;
    if (inst.loader == "forge" || inst.loader == "neoforge") && inst.launch_version.is_none() {
        run_official_installer(app, store, &inst).await?;
    }
    let inst = store.load(id).map_err(|e| e.to_string())?;
    install_chain(app, store, &inst, mirror).await
}

async fn run_official_installer(app: &tauri::AppHandle, store: &InstanceStore, inst: &Instance) -> Result<(), String> {
    let loader_version = inst.loader_version.clone().filter(|s| !s.is_empty())
        .ok_or_else(|| "没有选择加载器版本".to_string())?;
    let urls = pomelo_core::loaders::installer_urls(&inst.loader, &inst.mc_version, &loader_version);
    if urls.is_empty() {
        return Err("这个加载器没有官方安装器".into());
    }
    let jar_path = store.instance_dir(&inst.id).join(format!("{}-{}-installer.jar", inst.loader, loader_version));
    let _ = app.emit("install-progress", InstallProgress {
        phase: "download".into(), current: 0, total: 1,
        message: format!("下载 {} {} 安装器", inst.loader, loader_version),
    });
    let mut last_err = String::from("安装器下载失败");
    let mut ok = false;
    for url in &urls {
        let item = DownloadItem { url: url.clone(), target: jar_path.clone(), sha1: None, size: None };
        match Downloader::new(false, 1).download(&item).await {
            Ok(_) => { ok = true; break; }
            Err(e) => last_err = e.to_string(),
        }
    }
    if !ok {
        return Err(last_err);
    }
    let runtimes = scan_java();
    let required = pomelo_core::java::required_java_major(&inst.mc_version).max(17);
    let java = pomelo_core::java::select_java_major(&runtimes, required)
        .or_else(|_| pomelo_core::java::select_java(&runtimes, &inst.mc_version))
        .map_err(|e| e.to_string())?;
    let game_dir = store.game_dir(&inst.id);
    std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;
    let _ = app.emit("install-progress", InstallProgress {
        phase: "resolve".into(), current: 0, total: 1,
        message: format!("运行 {} 官方安装器（Java {}）", inst.loader, java.major),
    });
    let jar_path2 = jar_path.clone();
    let game_dir2 = game_dir.clone();
    let java_path = java.path.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(java_path);
        cmd.arg("-jar")
            .arg(&jar_path2)
            .arg("--installClient")
            .arg(&game_dir2)
            .current_dir(&game_dir2)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("无法启动安装器：{e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        let tail = if err.trim().is_empty() { out } else { err };
        let tail: String = tail.chars().rev().take(500).collect::<String>().chars().rev().collect();
        return Err(format!("官方安装器退出失败：{tail}"));
    }
    let versions = store.versions_dir(&inst.id);
    let mut found = pomelo_core::loaders::installed_version_ids(&inst.loader, &inst.mc_version, &loader_version)
        .into_iter()
        .find(|id| versions.join(id).join(format!("{id}.json")).is_file());
    if found.is_none() {
        if let Ok(entries) = std::fs::read_dir(&versions) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains(&loader_version) && entry.path().join(format!("{name}.json")).is_file() {
                    found = Some(name);
                    break;
                }
            }
        }
    }
    let version_id = found.ok_or_else(|| "安装器已结束，但没有找到版本 JSON".to_string())?;
    let mut saved = store.load(&inst.id).map_err(|e| e.to_string())?;
    saved.launch_version = Some(version_id);
    store.save(&saved).map_err(|e| e.to_string())?;
    Ok(())
}

/// 从 Modrinth 安装模组/资源包/光影到指定实例（真实下载）
#[tauri::command]
async fn install_mod(state: State<'_, AppState>, instance_id: String, slug: String, category: String) -> Result<String, String> {
    let store = store_of(&state);
    let inst = store.load(&instance_id).map_err(|e| e.to_string())?;
    let loader_filter = if category == "mod" && inst.loader != "vanilla" {
        Some(inst.loader.as_str())
    } else {
        None
    };
    let version = pomelo_core::modrinth::latest_version(&slug, Some(&inst.mc_version), loader_filter)
        .await
        .map_err(|e| e.to_string())?;
    let file = version.primary_file().ok_or_else(|| "该版本没有可下载文件".to_string())?;
    let subdir = match category.as_str() {
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        _ => "mods",
    };
    let target = store.game_dir(&inst.id).join(subdir).join(&file.filename);
    let item = DownloadItem {
        url: file.url.clone(),
        target,
        sha1: file.hashes.get("sha1").cloned(),
        size: Some(file.size),
    };
    Downloader::new(true, 4).download(&item).await.map_err(|e| e.to_string())?;
    Ok(file.filename.clone())
}

/* ---------------- 启动 ---------------- */

#[tauri::command]
async fn launch_instance(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    account_uuid: String,
    memory: u32,
) -> Result<u32, String> {
    let store = store_of(&state);
    let inst = store.load(&id).map_err(|e| e.to_string())?;
    let chain = pomelo_core::meta::load_version_chain(
        &store.versions_dir(&inst.id),
        &pomelo_core::instance::launch_id(&inst),
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
            // 优先采用版本 JSON 声明的 javaVersion（如 26.x 需要 Java 25）
            let required = resolved
                .java_version
                .as_ref()
                .map(|j| j.major_version)
                .unwrap_or_else(|| pomelo_core::java::required_java_major(&inst.mc_version));
            pomelo_core::java::select_java_major(&runtimes, required)
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

    let accounts = load_accounts(&store.root).map_err(|e| e.to_string())?;
    let stored = accounts.iter().find(|a| a.uuid == account_uuid);
    let (name, uuid, token, is_ms) = match stored {
        Some(a) => (a.name.clone(), a.uuid.clone(), a.access_token.clone(), a.kind == "microsoft"),
        None => {
            let o = OfflineAccount::new("Player");
            (o.name, o.uuid, o.access_token, false)
        }
    };
    let account = OfflineAccount { name, uuid, access_token: token };
    let args = pomelo_core::launch::build_arguments(&resolved, &paths, &inst, &account, memory, is_ms, &env)
        .map_err(|e| e.to_string())?;
    let child = pomelo_core::launch::spawn(&java_path, &args, &paths.game_dir).map_err(|e| e.to_string())?;
    let pid = child.id();
    let mut child = child;
    pomelo_core::launch::pipe_to_log(
        &mut child,
        &store.game_dir(&inst.id).join("logs").join("launcher.log"),
    )
    .map_err(|e| e.to_string())?;

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

/// 保存（新增或按 uuid 覆盖）账户：微软登录成功后由前端调用
#[tauri::command]
fn save_account(state: State<AppState>, account: StoredAccount) -> Result<Vec<StoredAccount>, String> {
    let mut accounts = load_accounts(&state.store.root).map_err(|e| e.to_string())?;
    match accounts.iter_mut().find(|a| a.uuid == account.uuid) {
        Some(existing) => *existing = account,
        None => accounts.push(account),
    }
    save_accounts(&state.store.root, &accounts).map_err(|e| e.to_string())?;
    Ok(accounts)
}

#[tauri::command]
fn get_ms_client_id(state: State<AppState>) -> String {
    let path = state.store.root.join("launcher_config.json");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("ms_client_id").and_then(|x| x.as_str()).map(String::from))
        .unwrap_or_default()
}

#[tauri::command]
fn set_ms_client_id(state: State<AppState>, client_id: String) -> Result<(), String> {
    let path = state.store.root.join("launcher_config.json");
    let mut v: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    v["ms_client_id"] = serde_json::Value::String(client_id);
    std::fs::write(&path, serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ms_device_code(client_id: String) -> Result<pomelo_core::auth::DeviceCode, String> {
    if client_id.trim().is_empty() {
        return Err("未配置 Azure 客户端 ID".into());
    }
    pomelo_core::auth::start_device_code(client_id.trim()).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn ms_poll(client_id: String, device_code: String) -> Result<pomelo_core::auth::DevicePoll, String> {
    Ok(pomelo_core::auth::poll_device(client_id.trim(), &device_code).await)
}

/// 弹出登录窗口。用微软公开的 Minecraft 客户端完成授权，用户不用填任何代码。
#[tauri::command]
async fn ms_browser_login(app: tauri::AppHandle) -> Result<pomelo_core::auth::BrowserSession, String> {
    if let Some(old) = app.get_webview_window("ms-login") {
        let _ = old.close();
    }
    let (tx, rx) = mpsc::sync_channel::<String>(1);
    let done = Arc::new(AtomicBool::new(false));
    let auth_url = pomelo_core::auth::msa_authorize_url();
    let parsed = auth_url.parse().map_err(|e| format!("登录地址无效：{e}"))?;
    let app_nav = app.clone();
    let tx_nav = tx.clone();
    let done_nav = done.clone();
    let window = WebviewWindowBuilder::new(&app, "ms-login", WebviewUrl::External(parsed))
        .title("登录 Microsoft 账户")
        .inner_size(480.0, 720.0)
        .min_inner_size(420.0, 560.0)
        .center()
        .on_navigation(move |nav| {
            if let Some(callback) = pomelo_core::auth::msa_callback_url(nav.as_str()) {
                if !done_nav.swap(true, Ordering::SeqCst) {
                    let _ = tx_nav.send(callback);
                }
                if let Some(w) = app_nav.get_webview_window("ms-login") {
                    let _ = w.close();
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("无法打开登录窗口：{e}"))?;
    let done_close = done.clone();
    let tx_close = tx.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if !done_close.swap(true, Ordering::SeqCst) {
                let _ = tx_close.send(String::new());
            }
        }
    });
    let redirected = tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(180))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "登录超时，请重试".to_string())?;
    if redirected.is_empty() {
        return Err("已取消登录".into());
    }
    let code = pomelo_core::auth::msa_code_from_redirect(&redirected).map_err(|e| e.to_string())?;
    pomelo_core::auth::finish_msa_code(&code).await.map_err(|e| e.to_string())
}

/// 导出求助包：日志 + 实例元数据 + 模组清单（脱敏：不含令牌）
#[tauri::command]
fn export_help_pack(state: State<AppState>, id: String) -> Result<String, String> {
    let store = store_of(&state);
    let inst = store.load(&id).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dir = state.store.root.join("help").join(format!("{}-{}", id, stamp));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let log = store.log_path(&id);
    if log.exists() {
        let text = std::fs::read_to_string(&log).unwrap_or_default();
        // 脱敏：accessToken / uuid 之外的敏感串打码
        let redacted = text
            .replace(&inst.name, "<player>")
            .lines()
            .map(|l| {
                if l.contains("accessToken") || l.contains("access_token") {
                    "<redacted token line>".to_string()
                } else {
                    l.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(dir.join("latest.log"), redacted).map_err(|e| e.to_string())?;
    }
    let capture = store.game_dir(&id).join("logs").join("launcher.log");
    if capture.exists() {
        let _ = std::fs::copy(&capture, dir.join("launcher.log"));
    }
    let mut meta = serde_json::to_value(&inst).map_err(|e| e.to_string())?;
    if let Some(obj) = meta.as_object_mut() {
        obj.remove("java_path");
    }
    std::fs::write(dir.join("instance.json"), serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let mods_dir = store.game_dir(&id).join("mods");
    let mut listing = String::new();
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for e in entries.flatten() {
            listing.push_str(&e.file_name().to_string_lossy());
            listing.push('\n');
        }
    }
    std::fs::write(dir.join("mods.txt"), listing).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}

#[tauri::command]
fn add_offline_account(state: State<AppState>, name: String, skin: Option<String>) -> Result<Vec<StoredAccount>, String> {
    let name = name.trim().to_string();
    if name.chars().count() < 3 {
        return Err("昵称至少 3 个字符".into());
    }
    if name.chars().any(|c| ('\u{3400}'..='\u{9fff}').contains(&c)) {
        return Err("Minecraft 通常不能使用中文作为游戏名，请改用英文字母、数字或下划线".into());
    }
    let mut accounts = load_accounts(&state.store.root).map_err(|e| e.to_string())?;
    if accounts.iter().any(|a| a.name == name) {
        return Err("该昵称已存在".into());
    }
    let acc = OfflineAccount::new(&name);
    let skin = match skin.as_deref() {
        Some("alex") => Some("alex".to_string()),
        _ => Some("steve".to_string()),
    };
    accounts.push(StoredAccount {
        name,
        uuid: acc.uuid,
        kind: "offline".into(),
        access_token: acc.access_token,
        refresh_token: None,
        skin,
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
    // 优先启动器捕获（含 JVM 早期 stderr），否则 MC 自身 latest.log
    let capture = state.store.game_dir(&id).join("logs").join("launcher.log");
    let mut path = capture;
    if std::fs::metadata(&path).map(|m| m.len() == 0).unwrap_or(true) {
        path = state.store.log_path(&id);
    }
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
            list_loader_versions,
            list_instances,
            game_running,
            stop_game,
            create_instance,
            update_instance,
            delete_instance,
            open_data_dir,
            install_instance,
            install_mod,
            launch_instance,
            list_accounts,
            add_offline_account,
            remove_account,
            save_account,
            get_ms_client_id,
            set_ms_client_id,
            ms_device_code,
            ms_browser_login,
            ms_poll,
            export_help_pack,
            read_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running PomeloLauncher");
}
