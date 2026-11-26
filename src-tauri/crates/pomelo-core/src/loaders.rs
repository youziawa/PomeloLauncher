//! 加载器版本查询与 Fabric/Quilt profile。
//! 只调用各项目公开的元数据接口（Fabric Meta、Quilt Meta、BMCLAPI），不包含其他启动器的安装代码。

use crate::error::{PomeloError, Result};
use crate::meta::VersionJson;
use serde::Deserialize;

pub const FABRIC_META: &str = "https://meta.fabricmc.net/v2";
pub const QUILT_META: &str = "https://meta.quiltmc.org/v3";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoaderBuild {
    pub version: String,
    pub stable: bool,
}

#[derive(Debug, Deserialize)]
struct MetaEntry {
    loader: MetaLoader,
}

#[derive(Debug, Deserialize)]
struct MetaLoader {
    version: String,
    #[serde(default)]
    stable: bool,
}

#[derive(Debug, Deserialize)]
struct BmclRow {
    version: String,
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("PomeloLauncher/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(PomeloError::Http)
}

/// 数字段优先比较，用于把 Forge / NeoForge 版本从新到旧排。
pub fn cmp_loader_version(a: &str, b: &str) -> std::cmp::Ordering {
    let ka = ver_key(a);
    let kb = ver_key(b);
    kb.cmp(&ka)
}

fn ver_key(s: &str) -> Vec<(u64, String)> {
    s.split(|c: char| c == '.' || c == '-' || c == '+' || c == '_')
        .filter(|p| !p.is_empty())
        .map(|part| {
            let digits: String = part.chars().take_while(|c| c.is_ascii_digit()).collect();
            let n = digits.parse::<u64>().unwrap_or(0);
            (n, part.to_ascii_lowercase())
        })
        .collect()
}

pub fn choose_loader(list: &[LoaderBuild], want: Option<&str>) -> Result<String> {
    if let Some(w) = want.map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(w.to_string());
    }
    list.iter()
        .find(|b| b.stable)
        .or_else(|| list.first())
        .map(|b| b.version.clone())
        .ok_or_else(|| PomeloError::NotFound("该游戏版本没有可用的加载器".into()))
}

pub async fn list_meta_loaders(base: &str, game_version: &str) -> Result<Vec<LoaderBuild>> {
    let c = client()?;
    let url = format!("{}/versions/loader/{}", base.trim_end_matches('/'), game_version);
    let resp = c.get(url).send().await?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Vec::new());
    }
    let resp = resp.error_for_status()?;
    let entries: Vec<MetaEntry> = resp.json().await?;
    Ok(entries
        .into_iter()
        .map(|e| LoaderBuild { version: e.loader.version, stable: e.loader.stable })
        .collect())
}

pub async fn meta_profile(base: &str, game_version: &str, want: Option<&str>) -> Result<(String, VersionJson)> {
    let listed = list_meta_loaders(base, game_version).await?;
    let loader_version = choose_loader(&listed, want)?;
    let c = client()?;
    let url = format!(
        "{}/versions/loader/{}/{}/profile/json",
        base.trim_end_matches('/'),
        game_version,
        loader_version
    );
    let profile: VersionJson = c.get(url).send().await?.error_for_status()?.json().await?;
    let id = profile.id.clone();
    Ok((id, profile))
}

pub async fn list_bmcl_forge(game_version: &str) -> Result<Vec<LoaderBuild>> {
    list_bmcl(&format!(
        "https://bmclapi2.bangbang93.com/forge/minecraft/{}",
        game_version
    ))
    .await
}

pub async fn list_bmcl_neoforge(game_version: &str) -> Result<Vec<LoaderBuild>> {
    list_bmcl(&format!(
        "https://bmclapi2.bangbang93.com/neoforge/list/{}",
        game_version
    ))
    .await
}

async fn list_bmcl(url: &str) -> Result<Vec<LoaderBuild>> {
    let c = client()?;
    let resp = c.get(url).send().await?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Vec::new());
    }
    let resp = resp.error_for_status()?;
    let rows: Vec<BmclRow> = resp.json().await?;
    let mut versions: Vec<String> = rows.into_iter().map(|r| r.version).filter(|v| !v.is_empty()).collect();
    versions.sort_by(|a, b| cmp_loader_version(a, b));
    versions.dedup();
    Ok(versions
        .into_iter()
        .enumerate()
        .map(|(i, version)| LoaderBuild { version, stable: i == 0 })
        .collect())
}

pub async fn list_for(loader: &str, game_version: &str) -> Result<Vec<LoaderBuild>> {
    match loader {
        "fabric" => list_meta_loaders(FABRIC_META, game_version).await,
        "quilt" => list_meta_loaders(QUILT_META, game_version).await,
        "forge" => list_bmcl_forge(game_version).await,
        "neoforge" => list_bmcl_neoforge(game_version).await,
        _ => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_loader_sorts_first() {
        assert_eq!(cmp_loader_version("47.3.0", "47.2.20"), std::cmp::Ordering::Less);
        assert_eq!(cmp_loader_version("21.1.9", "21.1.10"), std::cmp::Ordering::Greater);
        assert_eq!(cmp_loader_version("0.16.9", "0.16.10"), std::cmp::Ordering::Greater);
    }

    #[test]
    fn choose_prefers_requested_then_stable() {
        let list = vec![
            LoaderBuild { version: "0.16.14".into(), stable: false },
            LoaderBuild { version: "0.16.9".into(), stable: true },
        ];
        assert_eq!(choose_loader(&list, Some("0.15.0")).unwrap(), "0.15.0");
        assert_eq!(choose_loader(&list, None).unwrap(), "0.16.9");
        assert_eq!(choose_loader(&list, Some("  ")).unwrap(), "0.16.9");
    }
}
