//! 启动流水线：classpath 组装、参数求值/替换、进程拉起。

use crate::auth::OfflineAccount;
use crate::error::{PomeloError, Result};
use crate::instance::Instance;
use crate::meta::{
    classpath_libraries, library_path, rules_allow, Env, ResolvedVersion, Rule,
};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

#[derive(Debug, Clone)]
pub struct LaunchPaths {
    pub game_dir: PathBuf,
    pub libraries_dir: PathBuf,
    pub assets_dir: PathBuf,
    pub natives_dir: PathBuf,
    pub client_jar: PathBuf,
}

pub fn classpath_separator() -> char {
    if cfg!(windows) {
        ';'
    } else {
        ':'
    }
}

/// 组装 classpath：规则允许的库 + 客户端 jar
pub fn build_classpath(version: &ResolvedVersion, env: &Env, paths: &LaunchPaths) -> String {
    let mut entries: Vec<String> = Vec::new();
    for lib in classpath_libraries(version, env) {
        let rel = lib
            .downloads
            .as_ref()
            .and_then(|d| d.artifact.as_ref())
            .and_then(|a| a.path.clone())
            .or_else(|| library_path(&lib.name));
        if let Some(rel) = rel {
            entries.push(
                paths
                    .libraries_dir
                    .join(rel)
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        }
    }
    entries.push(paths.client_jar.to_string_lossy().replace('\\', "/"));
    entries.join(&classpath_separator().to_string())
}

fn eval_argument(value: &Value, env: &Env) -> Vec<String> {
    match value {
        Value::String(s) => vec![s.clone()],
        Value::Array(items) => items
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        Value::Object(map) => {
            let rules: Vec<Rule> = map
                .get("rules")
                .and_then(|r| serde_json::from_value(r.clone()).ok())
                .unwrap_or_default();
            if !rules_allow(&rules, env) {
                return Vec::new();
            }
            match map.get("value") {
                Some(Value::String(s)) => vec![s.clone()],
                Some(Value::Array(items)) => items
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect(),
                _ => Vec::new(),
            }
        }
        _ => Vec::new(),
    }
}

fn substitute(template: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = template.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("${{{}}}", key), value);
    }
    out
}

/// 构建完整命令行参数（java 之后的部分），纯函数便于测试。
pub fn build_arguments(
    version: &ResolvedVersion,
    paths: &LaunchPaths,
    instance: &Instance,
    account: &OfflineAccount,
    memory_mb: u32,
    is_microsoft: bool,
    env: &Env,
) -> Result<Vec<String>> {
    let cp = build_classpath(version, env, paths);
    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("natives_directory", paths.natives_dir.to_string_lossy().replace('\\', "/"));
    vars.insert("launcher_name", "PomeloLauncher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("classpath", cp);
    vars.insert("library_directory", paths.libraries_dir.to_string_lossy().replace('\\', "/"));
    vars.insert("version_name", version.id.clone());
    vars.insert("game_directory", paths.game_dir.to_string_lossy().replace('\\', "/"));
    vars.insert("assets_root", paths.assets_dir.to_string_lossy().replace('\\', "/"));
    vars.insert("assets_index_name", version.assets.clone());
    vars.insert("auth_player_name", account.name.clone());
    vars.insert("auth_uuid", account.uuid.clone());
    vars.insert("auth_access_token", account.access_token.clone());
    vars.insert("clientid", String::new());
    vars.insert("auth_xuid", String::new());
    vars.insert("user_type", if is_microsoft { "msa".into() } else { "legacy".into() });
    vars.insert("version_type", "release".into());

    let mut args: Vec<String> = vec![
        format!("-Xmx{}M", memory_mb.max(512)),
        "-Dfile.encoding=UTF-8".to_string(),
    ];

    let mut jvm: Vec<String> = version
        .arguments
        .jvm
        .iter()
        .flat_map(|v| eval_argument(v, env))
        .collect();
    if jvm.is_empty() {
        jvm = vec![
            "-Djava.library.path=${natives_directory}".into(),
            "-cp".into(),
            "${classpath}".into(),
        ];
    }
    args.extend(jvm.iter().map(|s| substitute(s, &vars)));

    args.push(version.main_class.clone());

    let game_raw: Vec<String> = if version.arguments.game.is_empty() {
        version
            .minecraft_arguments
            .as_deref()
            .unwrap_or("")
            .split_whitespace()
            .map(String::from)
            .collect()
    } else {
        version
            .arguments
            .game
            .iter()
            .flat_map(|v| eval_argument(v, env))
            .collect()
    };
    args.extend(game_raw.iter().map(|s| substitute(s, &vars)));

    let _ = instance;
    Ok(args)
}

pub fn spawn(java: &Path, args: &[String], game_dir: &Path) -> Result<Child> {
    if !java.exists() {
        return Err(PomeloError::Launch(format!("Java 不存在：{}", java.display())));
    }
    std::fs::create_dir_all(game_dir)?;
    let child = Command::new(java)
        .args(args)
        .current_dir(game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| PomeloError::Launch(format!("无法启动游戏进程：{}", e)))?;
    Ok(child)
}

/// 把子进程输出追加到日志文件（供 CLI/桌面端复用）
pub fn pipe_to_log(child: &mut Child, log_path: &Path) -> Result<()> {
    use std::io::{BufRead, BufReader, Write};
    if let Some(dir) = log_path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(log_path)?;
    if let Some(stdout) = child.stdout.take() {
        let mut file2 = file.try_clone()?;
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(|l| l.ok()) {
                println!("{}", line);
                let _ = writeln!(file2, "{}", line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(|l| l.ok()) {
                eprintln!("{}", line);
                let _ = writeln!(file, "{}", line);
            }
        });
    }
    Ok(())
}
