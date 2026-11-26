//! Fabric 加载器安装：meta.fabricmc.net 公开 API，生成 inheritsFrom profile。

use crate::error::Result;
use crate::loaders::{self, FABRIC_META};
use crate::meta::VersionJson;

/// 返回 (profile id, profile JSON)。`loader_version` 为空时选最新稳定版。
pub async fn fabric_profile(game_version: &str, loader_version: Option<&str>) -> Result<(String, VersionJson)> {
    loaders::meta_profile(FABRIC_META, game_version, loader_version).await
}
