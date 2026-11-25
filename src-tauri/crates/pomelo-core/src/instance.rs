//! 实例存储（每个实例独立 .minecraft，实现版本隔离）。

use crate::error::{PomeloError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

fn default_memory() -> u32 {
    4096
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    /// vanilla | fabric | forge | neoforge | quilt
    #[serde(default = "default_loader")]
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    pub created_at: String,
    #[serde(default = "default_memory")]
    pub memory_mb: u32,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub last_played: Option<String>,
}

fn default_loader() -> String {
    "vanilla".into()
}

pub struct InstanceStore {
    pub root: PathBuf,
}

impl InstanceStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        InstanceStore { root: root.into() }
    }

    /// 默认数据目录：POMELO_ROOT 环境变量 > portable.flag > 系统数据目录。
    pub fn default_root() -> PathBuf {
        if let Ok(root) = std::env::var("POMELO_ROOT") {
            if !root.trim().is_empty() {
                return PathBuf::from(root);
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                if dir.join("portable.flag").exists() {
                    return dir.join("data");
                }
            }
        }
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("PomeloLauncher")
    }

    pub fn instances_dir(&self) -> PathBuf {
        self.root.join("instances")
    }
    pub fn instance_dir(&self, id: &str) -> PathBuf {
        self.instances_dir().join(id)
    }
    pub fn game_dir(&self, id: &str) -> PathBuf {
        self.instance_dir(id).join(".minecraft")
    }
    pub fn versions_dir(&self, id: &str) -> PathBuf {
        self.game_dir(id).join("versions")
    }
    pub fn libraries_dir(&self, id: &str) -> PathBuf {
        self.game_dir(id).join("libraries")
    }
    pub fn assets_dir(&self, id: &str) -> PathBuf {
        self.game_dir(id).join("assets")
    }
    pub fn natives_dir(&self, id: &str, version: &str) -> PathBuf {
        self.versions_dir(id).join(version).join("natives")
    }
    pub fn log_path(&self, id: &str) -> PathBuf {
        self.game_dir(id).join("logs").join("latest.log")
    }

    pub fn load(&self, id: &str) -> Result<Instance> {
        let path = self.instance_dir(id).join("instance.json");
        if !path.exists() {
            return Err(PomeloError::NotFound(format!("实例 {} 不存在", id)));
        }
        Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
    }

    pub fn save(&self, inst: &Instance) -> Result<()> {
        let dir = self.instance_dir(&inst.id);
        std::fs::create_dir_all(&dir)?;
        std::fs::write(dir.join("instance.json"), serde_json::to_vec_pretty(inst)?)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<Instance> {
        let mut out = Vec::new();
        let Ok(entries) = std::fs::read_dir(self.instances_dir()) else {
            return out;
        };
        for entry in entries.flatten() {
            let path = entry.path().join("instance.json");
            if let Ok(text) = std::fs::read_to_string(path) {
                if let Ok(inst) = serde_json::from_str::<Instance>(&text) {
                    out.push(inst);
                }
            }
        }
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        out
    }

    pub fn create(&self, name: &str, mc_version: &str, loader: &str) -> Result<Instance> {
        let slug: String = name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect();
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let id = format!("{}-{}", if slug.is_empty() { "instance" } else { &slug }, stamp);
        let inst = Instance {
            id,
            name: name.to_string(),
            mc_version: mc_version.to_string(),
            loader: loader.to_string(),
            loader_version: None,
            created_at: chrono_like_now(),
            memory_mb: default_memory(),
            java_path: None,
            installed: false,
            last_played: None,
        };
        std::fs::create_dir_all(self.game_dir(&inst.id))?;
        self.save(&inst)?;
        Ok(inst)
    }
}

fn chrono_like_now() -> String {
    // 无 chrono 依赖：RFC3339 近似时间
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days as i64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60)
}

/// Howard Hinnant's civil_from_days
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// 校验实例目录结构是否完整（供 UI 显示“已安装”）
pub fn is_installed(store: &InstanceStore, inst: &Instance) -> bool {
    let jar = store
        .versions_dir(&inst.id)
        .join(&inst.mc_version)
        .join(format!("{}.jar", inst.mc_version));
    let json = store
        .versions_dir(&inst.id)
        .join(&inst.mc_version)
        .join(format!("{}.json", inst.mc_version));
    jar.exists() && json.exists()
}

pub fn ensure_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    Ok(())
}
