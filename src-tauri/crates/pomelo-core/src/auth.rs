//! 账户：离线账户，以及 Microsoft 浏览器登录（授权码 + PKCE + 本机回跳）。

use crate::error::{PomeloError, Result};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineAccount {
    pub name: String,
    pub uuid: String,
    pub access_token: String,
}

impl OfflineAccount {
    pub fn new(name: &str) -> Self {
        OfflineAccount {
            name: name.to_string(),
            uuid: offline_uuid(name),
            access_token: "0".repeat(32),
        }
    }
}

/// 离线 UUID：MD5("OfflinePlayer:<name>")，设置 v3 版本位与 RFC4122 变体位。
pub fn offline_uuid(name: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{}", name).as_bytes());
    let mut bytes = hasher.finalize();
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let h = hex::encode(bytes);
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

/* ---------------- Microsoft 设备码登录（实验性） ---------------- */

const DEVICE_CODE_ENDPOINT: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_ENDPOINT: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MsToken {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct XboxToken {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: DisplayClaims,
}

#[derive(Debug, Clone, Deserialize)]
struct DisplayClaims {
    xui: Vec<Xui>,
}

#[derive(Debug, Clone, Deserialize)]
struct Xui {
    uhs: String,
}

#[derive(Debug, Clone, Deserialize)]
struct McLogin {
    access_token: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct McProfile {
    pub id: String,
    pub name: String,
}

fn http() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("PomeloLauncher/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(PomeloError::Http)
}

/// 发起设备码流程
pub async fn start_device_code(client_id: &str) -> Result<DeviceCode> {
    let resp = http()?
        .post(DEVICE_CODE_ENDPOINT)
        .form(&[("client_id", client_id), ("scope", SCOPE)])
        .send()
        .await?
        .error_for_status()?;
    Ok(resp.json::<DeviceCode>().await?)
}

/// 轮询授权结果（调用方按 interval 秒循环），返回 Microsoft 访问令牌
pub async fn poll_token(client_id: &str, device_code: &str) -> Result<MsToken> {
    let resp = http()?
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ])
        .send()
        .await?;
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(PomeloError::Auth(format!("授权未完成或失败：{}", body)));
    }
    Ok(resp.json::<MsToken>().await?)
}

/// 设备码轮询结果（供 UI 逐步展示）
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DevicePoll {
    Pending,
    SlowDown,
    Expired,
    Declined,
    Success {
        name: String,
        uuid: String,
        access_token: String,
        refresh_token: Option<String>,
    },
    Error { message: String },
}

/// 单次轮询：把 OAuth 错误码翻译为 UI 状态
pub async fn poll_device(client_id: &str, device_code: &str) -> DevicePoll {
    let resp = match http() {
        Ok(c) => c,
        Err(e) => return DevicePoll::Error { message: e.to_string() },
    };
    let resp = match resp
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ])
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return DevicePoll::Error { message: e.to_string() },
    };
    if resp.status().is_success() {
        let ms: MsToken = match resp.json().await {
            Ok(t) => t,
            Err(e) => return DevicePoll::Error { message: e.to_string() },
        };
        return match login_minecraft_with_token(&ms.access_token).await {
            Ok((profile, token)) => DevicePoll::Success {
                name: profile.name,
                uuid: profile.id,
                access_token: token,
                refresh_token: ms.refresh_token,
            },
            Err(e) => DevicePoll::Error { message: e.to_string() },
        };
    }
    let body = resp.text().await.unwrap_or_default();
    let err: String = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
        .unwrap_or_default();
    match err.as_str() {
        "authorization_pending" => DevicePoll::Pending,
        "slow_down" => DevicePoll::SlowDown,
        "expired_token" => DevicePoll::Expired,
        "authorization_declined" => DevicePoll::Declined,
        _ => DevicePoll::Error { message: if err.is_empty() { body } else { err } },
    }
}

/// 用已有 Microsoft 访问令牌走 XBL→XSTS→MC 链路。
/// `d_prefix`：Azure v2 令牌需要 `d=` 前缀；官方启动器的 MBI_SSL 令牌直接作为 RpsTicket。
pub async fn login_minecraft_with_token(ms_access_token: &str) -> Result<(McProfile, String)> {
    login_minecraft_rps(ms_access_token, true).await
}

async fn login_minecraft_rps(ms_access_token: &str, d_prefix: bool) -> Result<(McProfile, String)> {
    let ticket = if d_prefix {
        format!("d={ms_access_token}")
    } else {
        ms_access_token.to_string()
    };
    let client = http()?;
    let xbl: XboxToken = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": ticket
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let xsts: XboxToken = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&serde_json::json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl.token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let uhs = xbl.display_claims.xui.first().map(|x| x.uhs.clone()).unwrap_or_default();
    let mc: McLogin = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&serde_json::json!({ "identityToken": format!("XBL3.0 x={};{}", uhs, xsts.token) }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let profile: McProfile = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&mc.access_token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok((profile, mc.access_token))
}

/// 完整链路：MS 令牌 → Xbox Live → XSTS → Minecraft 令牌 → 档案
pub async fn login_minecraft(client_id: &str, device_code: &str) -> Result<(McProfile, String)> {
    let ms = poll_token(client_id, device_code).await?;
    login_minecraft_with_token(&ms.access_token).await
}

/* ---------------- 浏览器登录：授权码 + PKCE + localhost 回跳 ---------------- */

const AUTH_ENDPOINT: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";

/// 微软公开的 Minecraft 登录应用。用户不需要自己注册 Azure 应用，也不需要输入任何代码。
const MSA_CLIENT_ID: &str = "00000000402b5328";
const MSA_REDIRECT: &str = "https://login.live.com/oauth20_desktop.srf";
const MSA_SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";
const MSA_AUTHORIZE: &str = "https://login.live.com/oauth20_authorize.srf";
const MSA_TOKEN: &str = "https://login.live.com/oauth20_token.srf";

pub fn msa_authorize_url() -> String {
    format!(
        "{MSA_AUTHORIZE}?client_id={MSA_CLIENT_ID}&response_type=code&redirect_uri={}&scope={}",
        form_encode(MSA_REDIRECT),
        form_encode(MSA_SCOPE),
    )
}

/// 只有真正跳到 desktop.srf 且带上 code/error 才算登录结束。
/// 授权地址的 query 里也会出现这段路径，不能当成回跳。
pub fn msa_callback_url(url: &str) -> Option<String> {
    let without_hash = url.split('#').next().unwrap_or(url);
    let base = without_hash.split('?').next().unwrap_or(without_hash).trim_end_matches('/');
    let base_l = base.to_ascii_lowercase();
    if !(base_l == MSA_REDIRECT || base_l.ends_with("login.live.com/oauth20_desktop.srf")) {
        return None;
    }
    let query = without_hash.split_once('?').map(|(_, q)| q).unwrap_or("");
    let params = parse_query(query);
    if params.contains_key("code") || params.contains_key("error") {
        Some(without_hash.to_string())
    } else {
        None
    }
}

pub fn msa_code_from_redirect(url: &str) -> Result<String> {
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    let params = parse_query(query);
    if let Some(err) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        return Err(PomeloError::Auth(if desc.is_empty() {
            format!("微软登录被取消：{err}")
        } else {
            format!("微软登录失败：{desc}")
        }));
    }
    params
        .get("code")
        .cloned()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| PomeloError::Auth("登录页没有返回授权码".into()))
}

pub async fn finish_msa_code(code: &str) -> Result<BrowserSession> {
    let resp = http()?
        .post(MSA_TOKEN)
        .form(&[
            ("client_id", MSA_CLIENT_ID),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", MSA_REDIRECT),
            ("scope", MSA_SCOPE),
        ])
        .send()
        .await?;
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(PomeloError::Auth(format!("换取微软令牌失败：{body}")));
    }
    let ms: MsToken = resp.json().await?;
    let (profile, access_token) = login_minecraft_rps(&ms.access_token, false).await?;
    Ok(BrowserSession {
        name: profile.name,
        uuid: profile.id,
        access_token,
        refresh_token: ms.refresh_token,
    })
}

#[derive(Debug)]
pub struct PendingBrowserLogin {
    pub url: String,
    redirect_uri: String,
    verifier: String,
    state: String,
    listener: std::net::TcpListener,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrowserSession {
    pub name: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
}

pub fn start_browser_login(client_id: &str) -> Result<PendingBrowserLogin> {
    let verifier = random_token(32);
    let challenge = pkce_challenge(&verifier);
    let state = random_token(16);
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    // Azure 把「http://localhost」视为特殊重定向：端口任意，路径必须一致（这里用根路径）。
    let redirect_uri = format!("http://localhost:{port}");
    let url = format!(
        "{AUTH_ENDPOINT}?client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}&prompt=select_account",
        form_encode(client_id),
        form_encode(&redirect_uri),
        form_encode(SCOPE),
        form_encode(&challenge),
        form_encode(&state),
    );
    Ok(PendingBrowserLogin { url, redirect_uri, verifier, state, listener })
}

/// 等到浏览器把授权码跳回本机。超时或用户拒绝时返回错误。
pub fn wait_browser_code(login: PendingBrowserLogin, timeout: std::time::Duration) -> Result<(String, String, String)> {
    let started = std::time::Instant::now();
    let mut buf = [0u8; 8192];
    loop {
        if started.elapsed() > timeout {
            return Err(PomeloError::Auth("登录超时。请重新点击「在浏览器中登录」。".into()));
        }
        match login.listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                let n = match stream.read(&mut buf) {
                    Ok(n) => n,
                    Err(_) => continue,
                };
                let req = String::from_utf8_lossy(&buf[..n]);
                let Some(target) = req.lines().next().and_then(|l| l.split_whitespace().nth(1)) else {
                    let _ = write_page(&mut stream, false);
                    continue;
                };
                let is_callback = target.starts_with("/callback") || target.starts_with("/?");
                if !is_callback {
                    let _ = write_page(&mut stream, false);
                    continue;
                }
                let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
                let params = parse_query(query);
                let _ = write_page(&mut stream, true);
                if let Some(err) = params.get("error") {
                    let desc = params.get("error_description").map(|s| s.replace('+', " ")).unwrap_or_default();
                    return Err(PomeloError::Auth(if desc.is_empty() {
                        format!("微软登录被取消或拒绝：{err}")
                    } else {
                        format!("微软登录失败：{desc}")
                    }));
                }
                if params.get("state").map(String::as_str) != Some(login.state.as_str()) {
                    return Err(PomeloError::Auth("登录回跳的 state 不匹配，已中止。".into()));
                }
                let code = params.get("code").cloned().filter(|s| !s.is_empty())
                    .ok_or_else(|| PomeloError::Auth("浏览器回跳里没有授权码。".into()))?;
                return Ok((code, login.redirect_uri, login.verifier));
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
            Err(e) => return Err(e.into()),
        }
    }
}

pub async fn finish_browser_login(client_id: &str, code: &str, redirect_uri: &str, verifier: &str) -> Result<BrowserSession> {
    let resp = http()?
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("code_verifier", verifier),
        ])
        .send()
        .await?;
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        let hint = if body.contains("AADSTS50011") {
            "Azure 应用需要把重定向 URI 设为 http://localhost（移动和桌面应用，不带端口）。"
        } else if body.contains("AADSTS7000218") {
            "请在 Azure 应用里打开「允许公共客户端流」。"
        } else {
            ""
        };
        return Err(PomeloError::Auth(format!("换取令牌失败：{body} {hint}")));
    }
    let ms: MsToken = resp.json().await?;
    let (profile, access_token) = login_minecraft_with_token(&ms.access_token).await?;
    Ok(BrowserSession {
        name: profile.name,
        uuid: profile.id,
        access_token,
        refresh_token: ms.refresh_token,
    })
}

fn random_token(nbytes: usize) -> String {
    let mut buf = vec![0u8; nbytes];
    getrandom::getrandom(&mut buf).expect("系统随机数不可用");
    b64url(&buf)
}

fn pkce_challenge(verifier: &str) -> String {
    use sha2::Digest;
    let hash = sha2::Sha256::digest(verifier.as_bytes());
    b64url(&hash)
}

fn b64url(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | data[i + 2] as u32;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(T[((n >> 6) & 63) as usize] as char);
        out.push(T[(n & 63) as usize] as char);
        i += 3;
    }
    if i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        if i + 1 < data.len() {
            out.push(T[((n >> 6) & 63) as usize] as char);
        }
    }
    out
}

fn form_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn parse_query(q: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for pair in q.split('&') {
        if pair.is_empty() { continue; }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        map.insert(percent_decode(k), percent_decode(v));
    }
    map
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or(""), 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn write_page(stream: &mut std::net::TcpStream, ok: bool) -> std::io::Result<()> {
    use std::io::Write;
    let body = if ok {
        "<!doctype html><meta charset=utf-8><title>柚子启动器</title><body style=\"font-family:sans-serif;padding:48px\"><h1>登录完成</h1><p>可以关闭此页面，回到柚子启动器。</p>"
    } else {
        "<!doctype html><meta charset=utf-8><title>柚子启动器</title><body style=\"font-family:sans-serif;padding:48px\"><p>这个地址不是登录回跳。</p>"
    };
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes())
}

use std::io::Read;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_matches_rfc7636_vector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(pkce_challenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn msa_redirect_extracts_code() {
        let url = "https://login.live.com/oauth20_desktop.srf?code=M.C1_abc&lc=2052";
        assert_eq!(msa_code_from_redirect(url).unwrap(), "M.C1_abc");
    }

    #[test]
    fn authorize_url_is_not_a_callback() {
        let auth = msa_authorize_url();
        assert!(msa_callback_url(&auth).is_none());
        assert!(msa_callback_url("https://login.live.com/oauth20_desktop.srf?code=abc").is_some());
    }

    #[test]
    fn query_keeps_code_and_state() {
        let q = parse_query("code=abc%2F1&state=s1&error_description=a+b");
        assert_eq!(q.get("code").map(String::as_str), Some("abc/1"));
        assert_eq!(q.get("state").map(String::as_str), Some("s1"));
        assert_eq!(q.get("error_description").map(String::as_str), Some("a b"));
    }
}

/* ---------------- 账户存储（M0 明文；正式版迁移系统密钥环） ---------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAccount {
    pub name: String,
    pub uuid: String,
    pub kind: String,
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
}

pub fn load_accounts(root: &Path) -> Result<Vec<StoredAccount>> {
    let path = root.join("accounts.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

pub fn save_accounts(root: &Path, accounts: &[StoredAccount]) -> Result<()> {
    std::fs::create_dir_all(root)?;
    std::fs::write(root.join("accounts.json"), serde_json::to_vec_pretty(accounts)?)?;
    Ok(())
}
