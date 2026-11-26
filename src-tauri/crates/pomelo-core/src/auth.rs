//! 账户：离线账户（M0）与 Microsoft 设备码登录（实验性，需自备 Azure 客户端 ID）。

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

/// 用已有 Microsoft 访问令牌走 XBL→XSTS→MC 链路
pub async fn login_minecraft_with_token(ms_access_token: &str) -> Result<(McProfile, String)> {
    let client = http()?;
    let xbl: XboxToken = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", ms_access_token)
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
