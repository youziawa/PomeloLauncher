//! Java 运行时扫描与按 MC 版本匹配。

use crate::error::{PomeloError, Result};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct JavaRuntime {
    pub path: PathBuf,
    pub major: u32,
    pub full_version: String,
}

/// 解析 `java -version` 输出（stderr）中的版本号：`1.8.0_411` / `21.0.5` / `17.0.9`
pub fn parse_java_version(output: &str) -> Option<(u32, String)> {
    for line in output.lines() {
        let l = line.trim();
        let rest = if let Some(r) = l.strip_prefix("java version \"") {
            r
        } else if let Some(r) = l.strip_prefix("openjdk version \"") {
            r
        } else {
            continue;
        };
        let end = rest.find('"')?;
        let full = &rest[..end];
        let major = if let Some(v) = full.strip_prefix("1.") {
            v.split('.').next()?.parse::<u32>().ok()?
        } else {
            full.split('.').next()?.parse::<u32>().ok()?
        };
        return Some((major, full.to_string()));
    }
    None
}

/// 探测单个 java 可执行文件
pub fn probe_java(path: &Path) -> Option<JavaRuntime> {
    if !path.exists() {
        return None;
    }
    let out = Command::new(path)
        .arg("-XshowSettings:properties")
        .arg("-version")
        .output()
        .ok()?;
    let mut text = String::from_utf8_lossy(&out.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    let (major, full) = parse_java_version(&text)?;
    Some(JavaRuntime { path: path.to_path_buf(), major, full_version: full })
}

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

fn push_if_java(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    let p = if path.is_dir() { path.join(exe_name()) } else { path };
    if p.is_file() {
        candidates.push(p);
    }
}

fn scan_common_dirs(candidates: &mut Vec<PathBuf>) {
    if cfg!(windows) {
        for base in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
            if let Ok(dir) = std::env::var(base) {
                let roots = [
                    format!("{}/Java", dir),
                    format!("{}/Eclipse Adoptium", dir),
                    format!("{}/Microsoft", dir),
                    format!("{}/Zulu", dir),
                    format!("{}/BellSoft", dir),
                    format!("{}/Amazon Corretto", dir),
                ];
                for r in roots {
                    let Ok(entries) = std::fs::read_dir(&r) else { continue };
                    for entry in entries.flatten() {
                        push_if_java(candidates, entry.path().join("bin").join(exe_name()));
                    }
                }
            }
        }
    } else {
        for root in ["/usr/lib/jvm", "/usr/local/opt/openjdk", "/Library/Java/JavaVirtualMachines"] {
            let Ok(entries) = std::fs::read_dir(root) else { continue };
            for entry in entries.flatten() {
                let p = entry.path();
                push_if_java(candidates, p.join("bin").join(exe_name()));
                push_if_java(candidates, p.join("Contents/Home/bin").join(exe_name()));
            }
        }
    }
}

/// 扫描本机 Java（PATH、JAVA_HOME、常见安装目录），去重后探测版本。
pub fn scan_java() -> Vec<JavaRuntime> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        push_if_java(&mut candidates, PathBuf::from(java_home).join("bin").join(exe_name()));
    }
    if let Ok(path) = std::env::var("PATH") {
        let sep = if cfg!(windows) { ';' } else { ':' };
        for dir in path.split(sep) {
            let p = PathBuf::from(dir).join(exe_name());
            if p.is_file() {
                candidates.push(p);
            }
        }
    }
    scan_common_dirs(&mut candidates);

    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for cand in candidates {
        let key = std::fs::canonicalize(&cand).unwrap_or_else(|_| cand.clone());
        if !seen.insert(key) {
            continue;
        }
        if let Some(rt) = probe_java(&cand) {
            out.push(rt);
        }
    }
    out.sort_by(|a, b| b.major.cmp(&a.major));
    out
}

/// MC 版本 → 所需 Java 大版本（按 Mojang 官方要求）
pub fn required_java_major(mc_version: &str) -> u32 {
    let v = mc_version.trim();
    // 远古版（b1.7.3 / a1.2.6）需要 Java 8
    if v.starts_with('b') || v.starts_with('a') {
        return 8;
    }
    let nums: Vec<u32> = v
        .split('.')
        .filter_map(|p| p.split('-').next()?.parse::<u32>().ok())
        .collect();
    let (major, minor, patch) = (nums.first().copied().unwrap_or(1), nums.get(1).copied().unwrap_or(0), nums.get(2).copied().unwrap_or(0));
    if major > 1 {
        return 21;
    }
    match minor {
        0..=16 => 8,
        17 => 16,
        18..=20 => {
            if minor == 20 && patch >= 5 {
                21
            } else {
                17
            }
        }
        _ => 21,
    }
}

/// 选择 Java：优先精确匹配所需大版本，否则取“最低的满足要求版本”，最后回退最高版本。
pub fn select_java<'a>(runtimes: &'a [JavaRuntime], mc_version: &str) -> Result<&'a JavaRuntime> {
    let required = required_java_major(mc_version);
    if let Some(exact) = runtimes.iter().find(|r| r.major == required) {
        return Ok(exact);
    }
    if let Some(at_least) = runtimes
        .iter()
        .filter(|r| r.major >= required)
        .min_by_key(|r| r.major)
    {
        return Ok(at_least);
    }
    runtimes
        .iter()
        .max_by_key(|r| r.major)
        .ok_or_else(|| PomeloError::NotFound("未找到 Java 运行时，请安装 Java 21 或在其设置中指定路径".into()))
}
