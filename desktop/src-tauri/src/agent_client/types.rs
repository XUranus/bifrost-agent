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
pub struct SLAPolicyResponse {
    pub id: String,
    pub name: String,
    pub copy_mode: String,
    pub backup_type: String,
    pub schedule_cron: String,
    pub block_size: i64,
    pub subtask_count: i64,
    pub memory_limit_mb: i64,
    pub retention_kind: String,
    pub retention_value: i64,
    pub aggregate_config: Option<serde_json::Value>,
    pub is_builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetResponse {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub config: Option<serde_json::Value>,
    pub sla_policy: Option<serde_json::Value>,
    pub protection_active: bool,
    pub enabled: bool,
    pub health: String,
    pub last_backup: Option<String>,
    pub next_backup: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobProgress {
    pub phase: String,
    pub percent: f64,
    pub throughput_bytes_per_sec: u64,
    pub eta_seconds: i64,
    pub current_item: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResponse {
    pub id: String,
    pub asset_id: String,
    pub operation: String,
    pub status: String,
    pub progress: Option<JobProgress>,
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
    pub job_id: String,
    pub kind: String,
    pub copy_uuid: Option<String>,
    pub parent_copy_id: Option<String>,
    pub size_bytes: Option<i64>,
    pub file_count: Option<i64>,
    pub manifest_path: Option<String>,
    pub data_path: Option<String>,
    pub expires_at: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfigResponse {
    pub version: String,
    pub copy_storage_dir: String,
}
