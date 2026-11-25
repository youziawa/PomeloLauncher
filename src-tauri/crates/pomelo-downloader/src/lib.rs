//! 下载引擎：官方源/BMCLAPI 镜像重写、并发下载、SHA1 校验、natives 解压。

use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use thiserror::Error;

pub const BMCLAPI: &str = "https://bmclapi2.bangbang93.com";
pub const ASSET_BASE: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Error)]
pub enum DlError {
    #[error("IO：{0}")]
    Io(#[from] std::io::Error),
    #[error("网络：{0}")]
    Http(#[from] reqwest::Error),
    #[error("校验失败：{0}")]
    Verify(String),
    #[error("解压失败：{0}")]
    Zip(String),
}

pub type DlResult<T> = std::result::Result<T, DlError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub url: String,
    pub target: PathBuf,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct DownloadSummary {
    pub total: usize,
    pub downloaded: usize,
    pub skipped: usize,
    pub failed: usize,
}

/// 官方 URL → BMCLAPI 镜像 URL（未知主机保持原样）
pub fn mirror_url(url: &str) -> String {
    const RULES: &[(&str, &str)] = &[
        ("https://piston-meta.mojang.com/", ""),
        ("https://launchermeta.mojang.com/", ""),
        ("https://piston-data.mojang.com/", ""),
        ("https://launcher.mojang.com/", ""),
    ];
    for (prefix, suffix) in RULES {
        if let Some(rest) = url.strip_prefix(prefix) {
            return format!("{}/{}{}", BMCLAPI, suffix, rest);
        }
    }
    if let Some(rest) = url.strip_prefix("https://resources.download.minecraft.net/") {
        return format!("{}/assets/{}", BMCLAPI, rest);
    }
    if let Some(rest) = url.strip_prefix("https://libraries.minecraft.net/") {
        return format!("{}/maven/{}", BMCLAPI, rest);
    }
    url.to_string()
}

pub fn sha1_hex(data: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(data);
    hex::encode(h.finalize())
}

pub fn sha1_file(path: &Path) -> DlResult<String> {
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha1::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

pub struct Downloader {
    client: reqwest::Client,
    pub prefer_mirror: bool,
    pub concurrency: usize,
}

impl Downloader {
    pub fn new(prefer_mirror: bool, concurrency: usize) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("PomeloLauncher/0.1")
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("http client");
        Downloader { client, prefer_mirror, concurrency: concurrency.clamp(1, 32) }
    }

    /// 下载单个文件（含校验与镜像回退），已存在且校验通过时跳过。
    pub async fn download(&self, item: &DownloadItem) -> DlResult<bool> {
        if item.target.exists() {
            let ok = match &item.sha1 {
                Some(expected) => sha1_file(&item.target).map(|h| h == *expected).unwrap_or(false),
                None => true,
            };
            if ok {
                return Ok(false);
            }
        }
        if let Some(dir) = item.target.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let primary = item.url.clone();
        let mirror = mirror_url(&item.url);
        let urls: Vec<String> = if self.prefer_mirror && mirror != primary {
            vec![mirror, primary]
        } else {
            vec![primary, mirror.clone()]
        };

        let mut last_err: Option<DlError> = None;
        for (i, url) in urls.iter().enumerate() {
            if i > 0 && url == &urls[0] {
                continue;
            }
            match self.fetch_one(url, item).await {
                Ok(()) => return Ok(true),
                Err(e) => last_err = Some(e),
            }
        }
        Err(last_err.unwrap_or_else(|| DlError::Verify("无可用下载源".into())))
    }

    async fn fetch_one(&self, url: &str, item: &DownloadItem) -> DlResult<()> {
        let resp = self.client.get(url).send().await?.error_for_status()?;
        let bytes = resp.bytes().await?;
        if let Some(expected) = &item.sha1 {
            let actual = sha1_hex(&bytes);
            if actual != *expected {
                return Err(DlError::Verify(format!(
                    "{} 校验失败：期望 {}，实际 {}",
                    item.target.display(),
                    expected,
                    actual
                )));
            }
        }
        let tmp = item.target.with_extension("part");
        std::fs::write(&tmp, &bytes)?;
        std::fs::rename(&tmp, &item.target)?;
        Ok(())
    }

    /// 批量下载（带并发），返回汇总
    pub async fn download_all(&self, items: Vec<DownloadItem>) -> DlResult<DownloadSummary> {
        self.download_all_with_progress(items, |_, _| {}).await
    }

    /// 批量下载 + 进度回调（cur/total，按完成文件数）
    pub async fn download_all_with_progress<F>(
        &self,
        items: Vec<DownloadItem>,
        on_progress: F,
    ) -> DlResult<DownloadSummary>
    where
        F: Fn(usize, usize) + Send + Sync + 'static,
    {
        let total = items.len();
        let done = Arc::new(AtomicUsize::new(0));
        let cb = Arc::new(on_progress);
        let results: Vec<DlResult<bool>> = stream::iter(items)
            .map(|item| {
                let done = done.clone();
                let cb = cb.clone();
                async move {
                    let result = self.download(&item).await;
                    let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                    cb(n, total);
                    result
                }
            })
            .buffer_unordered(self.concurrency)
            .collect()
            .await;
        let mut summary = DownloadSummary { total, ..Default::default() };
        for r in results {
            match r {
                Ok(true) => summary.downloaded += 1,
                Ok(false) => summary.skipped += 1,
                Err(e) => {
                    summary.failed += 1;
                    tracing::warn!("下载失败：{e}");
                }
            }
        }
        Ok(summary)
    }
}

/// 解压 natives（跳过 META-INF、排除规则命中项），拒绝路径穿越。
pub fn extract_natives(jar: &Path, out_dir: &Path, excludes: &[String]) -> DlResult<()> {
    std::fs::create_dir_all(out_dir)?;
    let file = std::fs::File::open(jar)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| DlError::Zip(e.to_string()))?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| DlError::Zip(e.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if name.starts_with("META-INF/") {
            continue;
        }
        if excludes.iter().any(|ex| name.starts_with(ex)) {
            continue;
        }
        // macOS 元数据
        if name.starts_with("__MACOSX") || name.contains("/.") {
            continue;
        }
        let Some(enclosed) = entry.enclosed_name() else { continue };
        let dest = out_dir.join(enclosed);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha1_of_hello() {
        assert_eq!(sha1_hex(b"hello"), "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
    }

    #[test]
    fn mirror_rewrite() {
        assert_eq!(
            mirror_url("https://piston-data.mojang.com/v1/objects/abc/client.jar"),
            "https://bmclapi2.bangbang93.com/v1/objects/abc/client.jar"
        );
        assert_eq!(
            mirror_url("https://resources.download.minecraft.net/ab/abcdef"),
            "https://bmclapi2.bangbang93.com/assets/ab/abcdef"
        );
        assert_eq!(
            mirror_url("https://libraries.minecraft.net/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar"),
            "https://bmclapi2.bangbang93.com/maven/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar"
        );
        assert_eq!(mirror_url("https://example.com/x"), "https://example.com/x");
    }
}
