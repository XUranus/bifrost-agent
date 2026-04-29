use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub uptime_seconds: u64,
    pub db_ok: bool,
    pub queue_depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfoResponse {
    pub version: String,
    pub platform: String,
    pub backends: Vec<String>,
    pub capabilities: Vec<String>,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetResponse {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub health: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResponse {
    pub id: String,
    pub asset_id: String,
    pub operation: String,
    pub status: String,
    pub size_bytes: Option<i64>,
    pub file_count: Option<i64>,
    pub error_count: i64,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupCopyResponse {
    pub id: String,
    pub asset_id: String,
    pub kind: String,
    pub size_bytes: Option<i64>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified: String,
    pub mode: u32,
}
