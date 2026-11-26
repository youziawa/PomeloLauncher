//! 版本元数据：清单、版本 JSON 模型、inheritsFrom 合并、规则求值、下载清单生成。

use crate::error::{PomeloError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub const OFFICIAL_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const BMCLAPI_MANIFEST: &str = "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json";
pub const ASSET_BASE: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Deserialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionSummary>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VersionSummary {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    #[serde(rename = "releaseTime", default)]
    pub release_time: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct VersionJson {
    pub id: String,
    #[serde(rename = "inheritsFrom", default)]
    pub inherits_from: Option<String>,
    #[serde(rename = "mainClass", default)]
    pub main_class: Option<String>,
    #[serde(default)]
    pub assets: Option<String>,
    #[serde(rename = "assetIndex", default)]
    pub asset_index: Option<AssetIndexRef>,
    #[serde(default)]
    pub downloads: Option<VersionDownloads>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub arguments: Option<Arguments>,
    #[serde(rename = "minecraftArguments", default)]
    pub minecraft_arguments: Option<String>,
    #[serde(rename = "javaVersion", default)]
    pub java_version: Option<JavaVersion>,
    #[serde(default)]
    pub logging: Option<Logging>,
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
    #[serde(rename = "releaseTime", default)]
    pub release_time: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct AssetIndexRef {
    pub id: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(rename = "totalSize", default)]
    pub total_size: Option<u64>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct VersionDownloads {
    #[serde(default)]
    pub client: Option<Artifact>,
    #[serde(default)]
    pub server: Option<Artifact>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Artifact {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    /// Fabric 等安装器profile使用 name+url(maven 基址)+sha1+size 形式
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub rules: Vec<Rule>,
    #[serde(default)]
    pub natives: Option<HashMap<String, String>>,
    #[serde(default)]
    pub extract: Option<Extract>,
}

/// 统一取库的下载信息：优先 downloads.artifact，否则由 name+url 合成（Fabric profile 形式）
pub fn artifact_of(lib: &Library) -> Option<Artifact> {
    if let Some(a) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
        return Some(a.clone());
    }
    let base = lib.url.as_ref()?;
    let path = library_path(&lib.name)?;
    Some(Artifact {
        path: Some(path.clone()),
        sha1: lib.sha1.clone(),
        size: lib.size,
        url: format!("{}{}", base.trim_end_matches('/'), format!("/{}", path)),
    })
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct LibraryDownloads {
    #[serde(default)]
    pub artifact: Option<Artifact>,
    #[serde(default)]
    pub classifiers: HashMap<String, Artifact>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Extract {
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Rule {
    pub action: String,
    #[serde(default)]
    pub os: Option<OsRule>,
    #[serde(default)]
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct OsRule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Arguments {
    #[serde(default)]
    pub game: Vec<Value>,
    #[serde(default)]
    pub jvm: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct JavaVersion {
    #[serde(default)]
    pub component: Option<String>,
    #[serde(rename = "majorVersion", default)]
    pub major_version: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Logging {
    #[serde(default)]
    pub client: Option<LoggingClient>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct LoggingClient {
    pub argument: String,
    pub file: Artifact,
}

/// 运行环境（规则求值用）
#[derive(Debug, Clone)]
pub struct Env {
    pub os: String,
    pub arch: String,
    pub os_version: String,
}

impl Env {
    pub fn current() -> Self {
        let os = if cfg!(windows) {
            "windows"
        } else if cfg!(target_os = "macos") {
            "osx"
        } else {
            "linux"
        }
        .to_string();
        let arch = match std::env::consts::ARCH {
            "x86_64" => "x86_64",
            "aarch64" => "arm64",
            "x86" => "x86",
            other => other,
        }
        .to_string();
        Env { os, arch, os_version: String::new() }
    }
}

/// 规则求值：无规则=允许；有规则时按顺序最后匹配项生效（默认拒绝）。
pub fn rules_allow(rules: &[Rule], env: &Env) -> bool {
    if rules.is_empty() {
        return true;
    }
    let mut allowed = false;
    for r in rules {
        if !rule_matches(r, env) {
            continue;
        }
        allowed = r.action == "allow";
    }
    allowed
}

fn rule_matches(r: &Rule, env: &Env) -> bool {
    if let Some(features) = &r.features {
        // M0 不启用任何特性开关（demo 用户 / 快速试玩等），要求特性的规则一律不匹配
        if features.values().any(|v| *v) {
            return false;
        }
    }
    if let Some(os) = &r.os {
        if let Some(name) = &os.name {
            if name != &env.os {
                return false;
            }
        }
        if let Some(arch) = &os.arch {
            if arch != &env.arch {
                return false;
            }
        }
        if let Some(ver) = &os.version {
            if !ver.is_empty() && !env.os_version.is_empty() && !env.os_version.contains(ver) {
                return false;
            }
        }
    }
    true
}

#[derive(Debug, Clone)]
pub struct ResolvedVersion {
    pub id: String,
    /// 客户端 jar 所在版本（inheritsFrom 链的根）
    pub jar_id: String,
    pub main_class: String,
    pub assets: String,
    pub asset_index: Option<AssetIndexRef>,
    pub downloads: Option<VersionDownloads>,
    pub libraries: Vec<Library>,
    pub arguments: Arguments,
    pub minecraft_arguments: Option<String>,
    pub java_version: Option<JavaVersion>,
    pub logging: Option<Logging>,
    pub kind: Option<String>,
}

/// 合并 inheritsFrom 链（chain[0] 为最子版本，末尾为根）。
pub fn resolve_chain(chain: &[VersionJson]) -> Result<ResolvedVersion> {
    let first = chain.first().ok_or_else(|| PomeloError::NotFound("版本链为空".into()))?;
    let root = chain.last().unwrap();
    let main_class = chain
        .iter()
        .find_map(|v| v.main_class.clone())
        .ok_or_else(|| PomeloError::Launch(format!("版本 {} 缺少 mainClass", first.id)))?;
    let assets = chain.iter().find_map(|v| v.assets.clone()).unwrap_or_else(|| "legacy".into());
    let asset_index = chain.iter().find_map(|v| v.asset_index.clone());
    let downloads = chain.iter().find_map(|v| v.downloads.clone());
    let java_version = chain.iter().find_map(|v| v.java_version.clone());
    let logging = chain.iter().find_map(|v| v.logging.clone());
    let minecraft_arguments = chain.iter().find_map(|v| v.minecraft_arguments.clone());

    // 库：根版本在前，子版本覆盖同 group:artifact 的条目
    let mut libs: Vec<Library> = Vec::new();
    for v in chain.iter().rev() {
        for lib in &v.libraries {
            let key = library_key(&lib.name);
            match libs.iter().position(|l| library_key(&l.name) == key) {
                Some(pos) => libs[pos] = lib.clone(),
                None => libs.push(lib.clone()),
            }
        }
    }

    // 参数：根在前，子版本追加
    let mut arguments = Arguments::default();
    for v in chain.iter().rev() {
        if let Some(a) = &v.arguments {
            arguments.game.extend(a.game.iter().cloned());
            arguments.jvm.extend(a.jvm.iter().cloned());
        }
    }

    Ok(ResolvedVersion {
        id: first.id.clone(),
        jar_id: root.id.clone(),
        main_class,
        assets,
        asset_index,
        downloads,
        libraries: libs,
        arguments,
        minecraft_arguments,
        java_version,
        logging,
        kind: first.kind.clone().or_else(|| root.kind.clone()),
    })
}

/// maven 坐标 key：group:artifact[:classifier]（用于去重；不同 classifier 是不同文件）
pub fn library_key(name: &str) -> String {
    let parts: Vec<&str> = name.split(':').collect();
    match parts.len() {
        n if n >= 4 => format!("{}:{}:{}", parts[0], parts[1], parts[3]),
        n if n >= 2 => format!("{}:{}", parts[0], parts[1]),
        _ => name.to_string(),
    }
}

/// 取 maven 坐标的 classifier（第 4 段）
pub fn classifier_of(name: &str) -> Option<&str> {
    name.split(':').nth(3)
}

/// 现代版本 JSON 的 natives 变体按架构后缀区分：natives-windows / -arm64 / -x86
fn arch_matches_classifier(classifier: &str, env: &Env) -> bool {
    let Some(rest) = classifier.strip_prefix("natives-") else {
        return true;
    };
    if rest.ends_with("-arm64") {
        env.arch == "arm64"
    } else if rest.ends_with("-x86") {
        env.arch == "x86"
    } else {
        // 无后缀的 natives-{os} 为 x86_64 版本
        env.arch == "x86_64"
    }
}

/// 库在当前平台是否可用（规则 + 架构变体）
pub fn library_usable(lib: &Library, env: &Env) -> bool {
    if !rules_allow(&lib.rules, env) {
        return false;
    }
    match classifier_of(&lib.name) {
        Some(c) if c.starts_with("natives-") => arch_matches_classifier(c, env),
        _ => true,
    }
}

/// 从 maven 坐标推导 jar 相对路径
pub fn library_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0];
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).map(|s| format!("-{}", s)).unwrap_or_default();
    Some(format!(
        "{}/{}/{}/{}-{}{}.jar",
        group.replace('.', "/"),
        artifact,
        version,
        artifact,
        version,
        classifier
    ))
}

/// 生效库（规则允许且存在 artifact），用于 classpath
pub fn classpath_libraries<'a>(resolved: &'a ResolvedVersion, env: &Env) -> Vec<&'a Library> {
    resolved
        .libraries
        .iter()
        .filter(|l| library_usable(l, env))
        .filter(|l| l.natives.is_none())
        .collect()
}

/// 当前平台需要解压的 natives：(classifier, artifact)
pub fn native_artifacts<'a>(resolved: &'a ResolvedVersion, env: &Env) -> Vec<(String, &'a Artifact)> {
    let mut out = Vec::new();
    for lib in &resolved.libraries {
        if !library_usable(lib, env) {
            continue;
        }
        let Some(natives) = &lib.natives else { continue };
        let Some(classifier) = natives.get(&env.os) else { continue };
        let art = lib
            .downloads
            .as_ref()
            .and_then(|d| {
                d.classifiers
                    .get(classifier)
                    .or_else(|| d.classifiers.get(&format!("{}-{}", classifier, env.arch)))
            });
        if let Some(a) = art {
            out.push((classifier.clone(), a));
        }
    }
    out
}

/* ---------------- 网络 ---------------- */

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("PomeloLauncher/0.1 (+https://github.com/pomelo-launcher)")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(PomeloError::Http)
}

pub async fn fetch_manifest(url: &str) -> Result<VersionManifest> {
    let resp = client()?.get(url).send().await?.error_for_status()?;
    Ok(resp.json::<VersionManifest>().await?)
}

/// 清单获取：按顺序尝试多个源（如 BMCLAPI → 官方），任一成功即返回。
pub async fn fetch_manifest_fallback(urls: &[&str]) -> Result<VersionManifest> {
    let mut last: Option<PomeloError> = None;
    for url in urls {
        match fetch_manifest(url).await {
            Ok(m) => return Ok(m),
            Err(e) => {
                tracing::warn!("清单源 {url} 不可用：{e}");
                last = Some(e);
            }
        }
    }
    Err(last.unwrap_or_else(|| PomeloError::NotFound("没有可用的版本清单源".into())))
}

pub async fn fetch_version_json(url: &str) -> Result<VersionJson> {
    let resp = client()?.get(url).send().await?.error_for_status()?;
    Ok(resp.json::<VersionJson>().await?)
}

/// 拉取（或读取缓存）版本完整链：versions/<id>/<id>.json + inheritsFrom 父级。
pub async fn load_version_chain(
    versions_dir: &Path,
    version_id: &str,
    manifest_url: &str,
) -> Result<Vec<VersionJson>> {
    let mut chain = Vec::new();
    let mut current = version_id.to_string();
    let manifest = fetch_manifest_fallback(&[manifest_url, OFFICIAL_MANIFEST]).await?;
    loop {
        let dir = versions_dir.join(&current);
        let path = dir.join(format!("{}.json", current));
        let json: VersionJson = if path.exists() {
            serde_json::from_str(&std::fs::read_to_string(&path)?)?
        } else {
            let summary = manifest
                .versions
                .iter()
                .find(|v| v.id == current)
                .ok_or_else(|| PomeloError::NotFound(format!("版本 {} 不在清单中", current)))?;
            let json = fetch_version_json(&summary.url).await?;
            std::fs::create_dir_all(&dir)?;
            std::fs::write(&path, serde_json::to_vec_pretty(&json)?)?;
            json
        };
        let parent = json.inherits_from.clone();
        chain.push(json);
        match parent {
            Some(p) => current = p,
            None => break,
        }
        if chain.len() > 8 {
            return Err(PomeloError::Launch("版本继承链过深".into()));
        }
    }
    Ok(chain)
}

/// 生成下载清单需要的资产索引对象
#[derive(Debug, Clone, Deserialize)]
pub struct AssetIndex {
    pub objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

pub async fn fetch_asset_index(url: &str) -> Result<AssetIndex> {
    let resp = client()?.get(url).send().await?.error_for_status()?;
    Ok(resp.json::<AssetIndex>().await?)
}
