//! M0 核心逻辑测试：规则求值 / 版本合并 / 类路径 / 参数替换 / Java 匹配 / 离线 UUID / 实例存储。

use pomelo_core::auth::offline_uuid;
use pomelo_core::instance::{is_installed, InstanceStore};
use pomelo_core::java::{parse_java_version, required_java_major};
use pomelo_core::launch::{build_arguments, build_classpath, LaunchPaths};
use pomelo_core::meta::{
    classpath_libraries, library_key, library_path, resolve_chain, rules_allow, Arguments, Artifact, Env, Library,
    OsRule, ResolvedVersion, Rule, VersionJson,
};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;

fn env_win() -> Env {
    Env { os: "windows".into(), arch: "x86_64".into(), os_version: "10.0".into() }
}

fn allow_windows() -> Rule {
    Rule {
        action: "allow".into(),
        os: Some(OsRule { name: Some("windows".into()), version: None, arch: None }),
        features: None,
    }
}

fn lib(name: &str) -> Library {
    Library {
        name: name.into(),
        downloads: Some(pomelo_core::meta::LibraryDownloads {
            artifact: Some(Artifact {
                path: Some(library_path(name).unwrap()),
                sha1: None,
                size: None,
                url: format!("https://libraries.minecraft.net/{}", library_path(name).unwrap()),
            }),
            classifiers: HashMap::new(),
        }),
        url: None,
        sha1: None,
        size: None,
        rules: vec![],
        natives: None,
        extract: None,
    }
}

#[test]
fn rules_default_and_order() {
    let env = env_win();
    assert!(rules_allow(&[], &env), "无规则应允许");
    assert!(rules_allow(&[allow_windows()], &env), "windows 允许规则应命中");
    let linux_only = Rule {
        action: "allow".into(),
        os: Some(OsRule { name: Some("linux".into()), version: None, arch: None }),
        features: None,
    };
    assert!(!rules_allow(&[linux_only], &env), "不匹配的 allow 规则应拒绝");
    let disallow_osx = Rule {
        action: "disallow".into(),
        os: Some(OsRule { name: Some("osx".into()), version: None, arch: None }),
        features: None,
    };
    assert!(rules_allow(&[allow_windows(), disallow_osx], &env), "末次匹配 allow 应允许");
}

#[test]
fn inherits_chain_merges_libraries_and_arguments() {
    let root = VersionJson {
        id: "1.21.4".into(),
        main_class: Some("net.minecraft.client.main.Main".into()),
        assets: Some("17".into()),
        asset_index: None,
        downloads: None,
        libraries: vec![lib("org.ow2.asm:asm:9.5"), lib("org.lwjgl:lwjgl:3.3.3")],
        arguments: Some(Arguments {
            game: vec![json!("--username"), json!("${auth_player_name}")],
            jvm: vec![json!("-Djava.library.path=${natives_directory}"), json!("-cp"), json!("${classpath}")],
        }),
        minecraft_arguments: None,
        java_version: Some(pomelo_core::meta::JavaVersion { component: Some("java-runtime-delta".into()), major_version: 21 }),
        logging: None,
        kind: Some("release".into()),
        release_time: None,
        inherits_from: None,
    };
    let child = VersionJson {
        id: "fabric-loader-0.16.9-1.21.4".into(),
        inherits_from: Some("1.21.4".into()),
        main_class: Some("net.fabricmc.loader.impl.launch.knot.KnotClient".into()),
        assets: None,
        asset_index: None,
        downloads: None,
        libraries: vec![lib("org.ow2.asm:asm:9.6")],
        arguments: Some(Arguments { game: vec![json!("--fabric")], jvm: vec![] }),
        minecraft_arguments: None,
        java_version: None,
        logging: None,
        kind: None,
        release_time: None,
    };

    let resolved = resolve_chain(&[child, root]).unwrap();
    assert_eq!(resolved.main_class, "net.fabricmc.loader.impl.launch.knot.KnotClient");
    assert_eq!(resolved.jar_id, "1.21.4");
    assert_eq!(resolved.assets, "17");
    assert_eq!(resolved.libraries.len(), 2, "同 group:artifact 应去重");
    assert!(resolved.libraries[0].name.contains("9.6"), "子版本应覆盖父版本库");
    // 参数：根在前，子版本追加
    assert_eq!(resolved.arguments.game.len(), 3);
    assert_eq!(resolved.arguments.game[2], json!("--fabric"));
    assert_eq!(resolved.arguments.jvm.len(), 3);
    assert_eq!(resolved.java_version.unwrap().major_version, 21);
}

#[test]
fn library_paths() {
    assert_eq!(library_path("org.lwjgl:lwjgl:3.3.3").unwrap(), "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar");
    assert_eq!(
        library_path("org.lwjgl:lwjgl:3.3.3:natives-windows").unwrap(),
        "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar"
    );
    assert!(library_path("bad").is_none());
}

fn fixture_resolved() -> ResolvedVersion {
    ResolvedVersion {
        id: "1.21.4".into(),
        jar_id: "1.21.4".into(),
        main_class: "net.minecraft.client.main.Main".into(),
        assets: "17".into(),
        asset_index: None,
        downloads: None,
        libraries: vec![lib("org.lwjgl:lwjgl:3.3.3")],
        arguments: Arguments {
            game: vec![
                json!("--username"), json!("${auth_player_name}"),
                json!("--uuid"), json!("${auth_uuid}"),
                json!("--accessToken"), json!("${auth_access_token}"),
                json!("--gameDir"), json!("${game_directory}"),
                json!("--assetsDir"), json!("${assets_root}"),
                json!("--assetIndex"), json!("${assets_index_name}"),
                json!("--version"), json!("${version_name}"),
            ],
            jvm: vec![json!("-Djava.library.path=${natives_directory}"), json!("-cp"), json!("${classpath}")],
        },
        minecraft_arguments: None,
        java_version: None,
        logging: None,
        kind: None,
    }
}

#[test]
fn launch_arguments_substitution() {
    let env = env_win();
    let resolved = fixture_resolved();
    let paths = LaunchPaths {
        game_dir: PathBuf::from("D:/data/instances/i1/.minecraft"),
        libraries_dir: PathBuf::from("D:/data/instances/i1/.minecraft/libraries"),
        assets_dir: PathBuf::from("D:/data/instances/i1/.minecraft/assets"),
        natives_dir: PathBuf::from("D:/data/instances/i1/.minecraft/versions/1.21.4/natives"),
        client_jar: PathBuf::from("D:/data/instances/i1/.minecraft/versions/1.21.4/1.21.4.jar"),
    };
    let inst = pomelo_core::instance::Instance {
        id: "i1".into(), name: "测试".into(), mc_version: "1.21.4".into(), loader: "vanilla".into(),
        loader_version: None, created_at: "2026-01-01T00:00:00Z".into(), memory_mb: 2048,
        java_path: None, installed: true, last_played: None, launch_version: None,
    };
    let account = pomelo_core::auth::OfflineAccount::new("Steve");
    let args = build_arguments(&resolved, &paths, &inst, &account, 2048, false, &env).unwrap();
    let joined = args.join(" ");
    assert!(args[0] == "-Xmx2048M");
    assert!(joined.contains("net.minecraft.client.main.Main"));
    assert!(joined.contains("--username Steve"));
    assert!(joined.contains("--assetsDir"));
    assert!(joined.contains("--assetIndex 17"));
    assert!(joined.contains("--version 1.21.4"));
    assert!(!joined.contains("${"), "不应残留占位符");
    assert!(paths.game_dir.exists() || true);
    // classpath 含客户端 jar
    assert!(joined.contains("1.21.4.jar"));
}

#[test]
fn classpath_contains_libraries_and_jar() {
    let env = env_win();
    let resolved = fixture_resolved();
    let paths = LaunchPaths {
        game_dir: PathBuf::from("g"),
        libraries_dir: PathBuf::from("L"),
        assets_dir: PathBuf::from("a"),
        natives_dir: PathBuf::from("n"),
        client_jar: PathBuf::from("C/client.jar"),
    };
    let cp = build_classpath(&resolved, &env, &paths);
    assert_eq!(classpath_libraries(&resolved, &env).len(), 1);
    assert!(cp.contains("lwjgl-3.3.3.jar"));
    assert!(cp.ends_with("client.jar"));
}

#[test]
fn java_version_parsing() {
    assert_eq!(
        parse_java_version("openjdk version \"21.0.5\" 2024-10-15\nOpenJDK Runtime Environment"),
        Some((21, "21.0.5".into()))
    );
    assert_eq!(
        parse_java_version("java version \"1.8.0_411\"\nJava(TM) SE Runtime"),
        Some((8, "1.8.0_411".into()))
    );
    assert_eq!(parse_java_version("not a version"), None);
}

#[test]
fn required_java_mapping() {
    assert_eq!(required_java_major("1.16.5"), 8);
    assert_eq!(required_java_major("1.17"), 16);
    assert_eq!(required_java_major("1.18.2"), 17);
    assert_eq!(required_java_major("1.20.4"), 17);
    assert_eq!(required_java_major("1.20.5"), 21);
    assert_eq!(required_java_major("1.21.4"), 21);
    assert_eq!(required_java_major("b1.7.3"), 8);
}

#[test]
fn offline_uuid_is_stable_and_valid() {
    let a = offline_uuid("Steve");
    let b = offline_uuid("Steve");
    assert_eq!(a, b);
    assert_eq!(a.len(), 36);
    let parts: Vec<&str> = a.split('-').collect();
    assert_eq!(parts.iter().map(|p| p.len()).collect::<Vec<_>>(), vec![8, 4, 4, 4, 12]);
    assert_eq!(&a[14..15], "3", "UUID version 应为 3");
    assert!(["8", "9", "a", "b"].contains(&&a[19..20]), "UUID variant 应为 RFC4122");
}

#[test]
fn classifier_variants_are_distinct_and_arch_filtered() {
    let env = env_win();
    assert_eq!(library_key("org.lwjgl:lwjgl:3.3.3"), "org.lwjgl:lwjgl");
    assert_eq!(library_key("org.lwjgl:lwjgl:3.3.3:natives-windows"), "org.lwjgl:lwjgl:natives-windows");

    let mut plain = lib("org.lwjgl:lwjgl:3.3.3");
    plain.rules = vec![];
    let mut win64 = lib("org.lwjgl:lwjgl:3.3.3:natives-windows");
    win64.rules = vec![allow_windows()];
    let mut arm64 = lib("org.lwjgl:lwjgl:3.3.3:natives-windows-arm64");
    arm64.rules = vec![allow_windows()];
    let mut x86 = lib("org.lwjgl:lwjgl:3.3.3:natives-windows-x86");
    x86.rules = vec![allow_windows()];

    let mut rv = fixture_resolved();
    rv.libraries = vec![plain, win64, arm64, x86];
    let libs = classpath_libraries(&rv, &env);
    assert_eq!(libs.len(), 2, "x64 应保留普通库与 natives-windows，排除 arm64/x86");
    let keys: Vec<String> = libs.iter().map(|l| library_key(&l.name)).collect();
    assert!(keys.contains(&"org.lwjgl:lwjgl".to_string()));
    assert!(keys.contains(&"org.lwjgl:lwjgl:natives-windows".to_string()));
}

#[test]
fn instance_store_roundtrip() {
    let root = std::env::temp_dir().join(format!("pomelo-test-{}", std::process::id()));
    let store = InstanceStore::new(&root);
    let inst = store.create("测试实例", "1.21.4", "vanilla").unwrap();
    assert!(store.game_dir(&inst.id).exists());
    let loaded = store.load(&inst.id).unwrap();
    assert_eq!(loaded.name, "测试实例");
    assert_eq!(store.list().len(), 1);
    assert!(!is_installed(&store, &inst));
    let _ = std::fs::remove_dir_all(&root);
}
