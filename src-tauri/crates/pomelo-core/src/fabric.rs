//! Fabric 加载器安装：meta.fabricmc.net 公开 API，生成 inheritsFrom profile。

use crate::error::{PomeloError, Result};
use crate::meta::VersionJson;
use serde::Deserialize;

pub const FABRIC_META: &str = "https://meta.fabricmc.net/v2";

#[derive(Debug, Deserialize)]
struct LoaderEntry {
    loader: LoaderInfo,
}

#[derive(Debug, Deserialize)]
struct LoaderInfo {
    version: String,
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("PomeloLauncher/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(PomeloError::Http)
}

/// 返回 (profile id, profile JSON)。profile 的 inheritsFrom 指向原版版本。
pub async fn fabric_profile(game_version: &str) -> Result<(String, VersionJson)> {
    let c = client()?;
    let entries: Vec<LoaderEntry> = c
        .get(format!("{}/versions/loader/{}", FABRIC_META, game_version))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let loader_version = entries
        .first()
        .map(|e| e.loader.version.clone())
        .ok_or_else(|| PomeloError::NotFound(format!("Fabric 不支持 MC {}", game_version)))?;
    let profile: VersionJson = c
        .get(format!(
            "{}/versions/loader/{}/{}/profile/json",
            FABRIC_META, game_version, loader_version
        ))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let id = profile.id.clone();
    Ok((id, profile))
}
