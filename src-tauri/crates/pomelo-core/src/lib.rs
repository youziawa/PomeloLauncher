//! PomeloLauncher 核心库（M0）
//!
//! 当前覆盖：版本清单/版本 JSON 解析与合并（inheritsFrom）、规则求值、
//! 实例存储、Java 扫描与匹配、离线账户、启动参数构建与进程拉起。
//! 下载与解压 natives 见 `pomelo-downloader`。

pub mod auth;
pub mod error;
pub mod instance;
pub mod java;
pub mod launch;
pub mod meta;

pub use error::{PomeloError, Result};
