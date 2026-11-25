//! PomeloLauncher M0 CLI：`pomelo java|versions|install|launch|info`

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use pomelo_core::auth::OfflineAccount;
use pomelo_core::instance::{is_installed, Instance, InstanceStore};
use pomelo_core::launch::{self, LaunchPaths};
use pomelo_core::meta::{self, AssetIndex, Env};
use pomelo_downloader::{extract_natives, DownloadItem, Downloader};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "pomelo", version, about = "PomeloLauncher 命令行（M0 技术验证）")]
struct Cli {
    /// 数据根目录（默认：便携模式或系统数据目录）
    #[arg(long, global = true)]
    root: Option<PathBuf>,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// 列出本机探测到的 Java 运行时
    Java,
    /// 列出可下载的游戏版本
    Versions {
        /// release / snapshot / old / all
        #[arg(long, default_value = "release")]
        kind: String,
        #[arg(long)]
        limit: Option<usize>,
        /// 使用 BMCLAPI 镜像清单
        #[arg(long)]
        mirror: bool,
    },
    /// 下载并安装一个版本（创建新实例，由用户显式执行，不自动下载）
    Install {
        version: String,
        #[arg(long)]
        name: Option<String>,
        /// 使用 BMCLAPI 镜像
        #[arg(long)]
        mirror: bool,
        #[arg(long, default_value = "8")]
        concurrency: usize,
    },
    /// 启动实例（离线账户）
    Launch {
        /// 实例 id 或名称
        instance: String,
        #[arg(long, default_value = "Player")]
        name: String,
        #[arg(long)]
        java: Option<PathBuf>,
        #[arg(long, default_value = "4096")]
        memory: u32,
        /// 只打印启动命令，不真正启动
        #[arg(long)]
        dry_run: bool,
    },
    /// 查看实例信息
    Info { instance: String },
}

fn store(root: Option<PathBuf>) -> InstanceStore {
    InstanceStore::new(root.unwrap_or_else(InstanceStore::default_root))
}

fn find_instance(store: &InstanceStore, key: &str) -> Result<Instance> {
    if let Ok(inst) = store.load(key) {
        return Ok(inst);
    }
    store
        .list()
        .into_iter()
        .find(|i| i.name == key)
        .with_context(|| format!("找不到实例：{}", key))
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Java => {
            let runtimes = pomelo_core::java::scan_java();
            if runtimes.is_empty() {
                println!("未找到 Java。请安装 Java 21（或任意 ≥8 的 JDK）。");
                return Ok(());
            }
            for rt in runtimes {
                println!("Java {}  {}  {}", rt.major, rt.full_version, rt.path.display());
            }
        }
        Cmd::Versions { kind, limit, mirror } => {
            let url = if mirror { meta::BMCLAPI_MANIFEST } else { meta::OFFICIAL_MANIFEST };
            let manifest = meta::fetch_manifest(url).await?;
            println!("最新正式版：{}  最新快照：{}", manifest.latest.release, manifest.latest.snapshot);
            let mut n = 0;
            for v in &manifest.versions {
                if kind != "all" && v.kind != kind {
                    continue;
                }
                println!("{:<12} {:<10} {}", v.id, v.kind, v.release_time.clone().unwrap_or_default());
                n += 1;
                if let Some(l) = limit {
                    if n >= l {
                        break;
                    }
                }
            }
        }
        Cmd::Install { version, name, mirror, concurrency } => {
            install(&store(cli.root), &version, name.as_deref(), mirror, concurrency).await?;
        }
        Cmd::Launch { instance, name, java, memory, dry_run } => {
            launch_instance(&store(cli.root), &instance, &name, java, memory, dry_run).await?;
        }
        Cmd::Info { instance } => {
            let s = store(cli.root);
            let inst = find_instance(&s, &instance)?;
            println!("{}", serde_json::to_string_pretty(&inst)?);
            println!("目录：{}", s.game_dir(&inst.id).display());
            println!("已安装：{}", is_installed(&s, &inst));
        }
    }
    Ok(())
}

async fn install(store: &InstanceStore, version: &str, name: Option<&str>, mirror: bool, concurrency: usize) -> Result<()> {
    let inst = store.create(name.unwrap_or(version), version, "vanilla")?;
    println!("创建实例：{}（{}）", inst.name, inst.id);
    let manifest_url = if mirror { meta::BMCLAPI_MANIFEST } else { meta::OFFICIAL_MANIFEST };
    let chain = meta::load_version_chain(&store.versions_dir(&inst.id), version, manifest_url).await?;
    let resolved = meta::resolve_chain(&chain)?;
    println!("版本链：{} 层；mainClass={}", chain.len(), resolved.main_class);

    let env = Env::current();
    let mut items: Vec<DownloadItem> = Vec::new();

    // 客户端 jar
    let jar_id = &resolved.jar_id;
    let jar_path = store.versions_dir(&inst.id).join(jar_id).join(format!("{}.jar", jar_id));
    if let Some(art) = resolved.downloads.as_ref().and_then(|d| d.client.as_ref()) {
        items.push(DownloadItem { url: art.url.clone(), target: jar_path, sha1: art.sha1.clone(), size: art.size });
    } else {
        bail!("版本 {} 缺少客户端 jar 信息", version);
    }

    // 库
    for lib in meta::classpath_libraries(&resolved, &env) {
        let Some(art) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) else { continue };
        let rel = art.path.clone().or_else(|| meta::library_path(&lib.name)).context("无法推导库路径")?;
        items.push(DownloadItem {
            url: art.url.clone(),
            target: store.libraries_dir(&inst.id).join(&rel),
            sha1: art.sha1.clone(),
            size: art.size,
        });
    }

    // 资产索引 + 对象
    if let Some(index) = &resolved.asset_index {
        if let Some(url) = &index.url {
            items.push(DownloadItem {
                url: url.clone(),
                target: store.assets_dir(&inst.id).join("indexes").join(format!("{}.json", index.id)),
                sha1: index.sha1.clone(),
                size: index.size,
            });
            let index_urls: Vec<String> = {
                let m = pomelo_downloader::mirror_url(url);
                if mirror && m != *url { vec![m, url.clone()] } else { vec![url.clone()] }
            };
            let index_json: AssetIndex = dl_fetch_json_fallback(&index_urls).await?;
            println!("资产对象：{} 个", index_json.objects.len());
            for obj in index_json.objects.values() {
                let prefix = &obj.hash[0..2];
                items.push(DownloadItem {
                    url: format!("{}/{}/{}", meta::ASSET_BASE, prefix, obj.hash),
                    target: store.assets_dir(&inst.id).join("objects").join(prefix).join(&obj.hash),
                    sha1: Some(obj.hash.clone()),
                    size: Some(obj.size),
                });
            }
        }
    }

    println!("待下载 {} 个文件（并发 {}，镜像 {}）…", items.len(), concurrency, if mirror { "开" } else { "关" });
    let dl = Downloader::new(mirror, concurrency);
    let summary = dl.download_all(items).await?;
    println!(
        "下载完成：新增 {}，跳过 {}，失败 {}，共 {}",
        summary.downloaded, summary.skipped, summary.failed, summary.total
    );
    if summary.failed > 0 {
        bail!("有 {} 个文件下载失败，可重试（已完成的会自动跳过）", summary.failed);
    }
    let mut done = store.load(&inst.id)?;
    done.installed = is_installed(store, &done);
    store.save(&done)?;
    println!("安装完成。启动：pomelo launch {}", inst.id);
    Ok(())
}

async fn dl_fetch_json<T: serde::de::DeserializeOwned>(url: &str) -> Result<T> {
    let client = reqwest::Client::builder().user_agent("PomeloLauncher/0.1").build()?;
    let resp = client.get(url).send().await?.error_for_status()?;
    Ok(resp.json::<T>().await?)
}

async fn dl_fetch_json_fallback<T: serde::de::DeserializeOwned>(urls: &[String]) -> Result<T> {
    let mut last: Option<anyhow::Error> = None;
    for url in urls {
        match dl_fetch_json::<T>(url).await {
            Ok(v) => return Ok(v),
            Err(e) => {
                eprintln!("来源不可用：{}（{}）", url, e);
                last = Some(e);
            }
        }
    }
    Err(last.unwrap_or_else(|| anyhow::anyhow!("没有可用来源")))
}

async fn launch_instance(store: &InstanceStore, key: &str, name: &str, java: Option<PathBuf>, memory: u32, dry_run: bool) -> Result<()> {
    let inst = find_instance(store, key)?;
    let manifest_url = meta::OFFICIAL_MANIFEST;
    let chain = meta::load_version_chain(&store.versions_dir(&inst.id), &inst.mc_version, manifest_url).await?;
    let resolved = meta::resolve_chain(&chain)?;
    let env = Env::current();

    let java_path = match java {
        Some(p) => p,
        None => {
            let runtimes = pomelo_core::java::scan_java();
            pomelo_core::java::select_java(&runtimes, &inst.mc_version)?.path.clone()
        }
    };

    let paths = LaunchPaths {
        game_dir: store.game_dir(&inst.id),
        libraries_dir: store.libraries_dir(&inst.id),
        assets_dir: store.assets_dir(&inst.id),
        natives_dir: store.natives_dir(&inst.id, &resolved.id),
        client_jar: store
            .versions_dir(&inst.id)
            .join(&resolved.jar_id)
            .join(format!("{}.jar", resolved.jar_id)),
    };
    if !paths.client_jar.exists() {
        bail!("客户端 jar 不存在，请先执行 pomelo install {}", inst.mc_version);
    }

    // natives 解压
    for (_, art) in meta::native_artifacts(&resolved, &env) {
        let rel = art.path.clone().context("natives 缺少路径")?;
        extract_natives(&store.libraries_dir(&inst.id).join(rel), &paths.natives_dir, &[])?;
    }

    let account = OfflineAccount::new(name);
    let args = launch::build_arguments(&resolved, &paths, &inst, &account, memory, false, &env)?;
    println!("Java：{}", java_path.display());
    println!("命令：{} {}", java_path.display(), args.join(" "));
    if dry_run {
        return Ok(());
    }
    let mut child = launch::spawn(&java_path, &args, &paths.game_dir)?;
    println!("游戏进程已启动（PID {}），日志：{}", child.id(), store.log_path(&inst.id).display());
    launch::pipe_to_log(&mut child, &store.log_path(&inst.id))?;
    let status = child.wait()?;
    println!("游戏退出：{:?}", status.code());
    Ok(())
}
