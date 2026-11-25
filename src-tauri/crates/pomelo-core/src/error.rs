use thiserror::Error;

#[derive(Debug, Error)]
pub enum PomeloError {
    #[error("IO 错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("网络错误：{0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON 解析错误：{0}")]
    Json(#[from] serde_json::Error),
    #[error("未找到：{0}")]
    NotFound(String),
    #[error("启动失败：{0}")]
    Launch(String),
    #[error("账户错误：{0}")]
    Auth(String),
    #[error("校验失败：{0}")]
    Verify(String),
    #[error("不支持的平台：{0}")]
    Unsupported(String),
}

pub type Result<T> = std::result::Result<T, PomeloError>;
