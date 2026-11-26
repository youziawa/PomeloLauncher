//! Modrinth 开放 API：项目版本查询与文件下载信息（无需 API key）。

use crate::error::{PomeloError, Result};
use serde::Deserialize;
use std::collections::HashMap;

pub const MODRINTH_API: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Clone, Deserialize)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    #[serde(default)]
    pub primary: bool,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub hashes: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModrinthVersion {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub version_number: String,
    pub files: Vec<ModrinthFile>,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
}

impl ModrinthVersion {
    pub fn primary_file(&self) -> Option<&ModrinthFile> {
        self.files.iter().find(|f| f.primary).or_else(|| self.files.first())
    }
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("PomeloLauncher/0.1 (+https://github.com/youziawa/PomeloLauncher)")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(PomeloError::Http)
}

/// 查询项目兼容指定 MC 版本/加载器的最新版本列表（返回第一个）
pub async fn latest_version(
    slug: &str,
    game_version: Option<&str>,
    loader: Option<&str>,
) -> Result<ModrinthVersion> {
    let mut url = format!("{}/project/{}/version", MODRINTH_API, slug);
    let mut params: Vec<String> = Vec::new();
    if let Some(gv) = game_version {
        params.push(format!("game_versions=[\"{}\"]", gv));
    }
    if let Some(l) = loader {
        params.push(format!("loaders=[\"{}\"]", l));
    }
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }
    let resp = client()?.get(&url).send().await?.error_for_status()?;
    let list: Vec<ModrinthVersion> = resp.json().await?;
    list.into_iter()
        .next()
        .ok_or_else(|| PomeloError::NotFound(format!("{} 没有兼容 {} 的版本", slug, game_version.unwrap_or("任意"))))
}
