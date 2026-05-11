use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// --- Asset ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Fileset,
    Volume,
    NasShare,
}

impl AssetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            AssetKind::Fileset => "fileset",
            AssetKind::Volume => "volume",
            AssetKind::NasShare => "nas_share",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "fileset" => Some(AssetKind::Fileset),
            "volume" => Some(AssetKind::Volume),
            "nas_share" => Some(AssetKind::NasShare),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssetConfig {
    Fileset {
        paths: Vec<PathBuf>,
        consistency_mode: bool,
        exclude_patterns: Vec<String>,
    },
    Volume {
        backend: String,
        volume_id: String,
    },
    NasShare {
        url: String,
        credential_id: Option<String>,
    },
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateAssetRequest {
    pub name: String,
    pub kind: AssetKind,
    pub config: AssetConfig,
}

#[derive(Debug, Clone, Serialize)]
pub struct AssetResponse {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub config: AssetConfig,
    pub sla_policy: Option<SLAPolicyResponse>,
    pub protection_active: bool,
    pub enabled: bool,
    pub health: String,
    pub last_backup: Option<String>,
    pub next_backup: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivateProtectionRequest {
    pub sla_policy_id: String,
}

// --- SLA Policy ---

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSLAPolicyRequest {
    pub name: Option<String>,
    pub copy_mode: String,
    pub backup_type: String,
    pub schedule_cron: String,
    #[serde(default = "default_block_size")]
    pub block_size: i64,
    #[serde(default = "default_subtask_count")]
    pub subtask_count: i64,
    #[serde(default = "default_memory_limit")]
    pub memory_limit_mb: i64,
    pub retention_kind: String,
    pub retention_value: i64,
    pub aggregate_config: Option<AggregateConfigJson>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSLAPolicyRequest {
    pub name: Option<String>,
    pub copy_mode: Option<String>,
    pub backup_type: Option<String>,
    pub schedule_cron: Option<String>,
    pub block_size: Option<i64>,
    pub subtask_count: Option<i64>,
    pub memory_limit_mb: Option<i64>,
    pub retention_kind: Option<String>,
    pub retention_value: Option<i64>,
    pub aggregate_config: Option<AggregateConfigJson>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregateConfigJson {
    #[serde(default = "default_max_blob_size")]
    pub max_blob_size: u64,
    #[serde(default = "default_file_threshold")]
    pub file_threshold: u64,
    #[serde(default = "default_shard_count")]
    pub shard_count: u32,
}

#[derive(Debug, Clone, Serialize)]
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
    pub aggregate_config: Option<AggregateConfigJson>,
    pub is_builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

fn default_block_size() -> i64 { 1_048_576 }
fn default_subtask_count() -> i64 { 4 }
fn default_memory_limit() -> i64 { 512 }
fn default_max_blob_size() -> u64 { 67_108_864 }
fn default_file_threshold() -> u64 { 1_048_576 }
fn default_shard_count() -> u32 { 16 }

// --- Job ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    Backup,
    Restore,
    Snapshot,
}

impl Operation {
    pub fn as_str(&self) -> &'static str {
        match self {
            Operation::Backup => "backup",
            Operation::Restore => "restore",
            Operation::Snapshot => "snapshot",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "backup" => Some(Operation::Backup),
            "restore" => Some(Operation::Restore),
            "snapshot" => Some(Operation::Snapshot),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl JobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            JobStatus::Pending => "pending",
            JobStatus::Running => "running",
            JobStatus::Completed => "completed",
            JobStatus::Failed => "failed",
            JobStatus::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(JobStatus::Pending),
            "running" => Some(JobStatus::Running),
            "completed" => Some(JobStatus::Completed),
            "failed" => Some(JobStatus::Failed),
            "cancelled" => Some(JobStatus::Cancelled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct StartJobRequest {
    pub asset_id: String,
    pub operation: Operation,
}

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Serialize)]
pub struct JobProgress {
    pub phase: String,
    pub percent: f64,
    pub throughput_bytes_per_sec: u64,
    pub eta_seconds: i64,
    pub current_item: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JobFilter {
    pub asset_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// --- Backup Copy ---

#[derive(Debug, Clone, Serialize)]
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

// --- Browse ---

#[derive(Debug, Clone, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified: String,
    pub mode: u32,
}

// --- Restore ---

#[derive(Debug, Clone, Deserialize)]
pub struct RestoreRequest {
    pub asset_id: String,
    pub copy_id: String,
    pub entries: Vec<RestoreEntry>,
    pub destination: RestoreDestination,
    pub conflict_policy: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RestoreEntry {
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum RestoreDestination {
    Original,
    New { path: PathBuf },
}

// --- Agent Info ---

#[derive(Debug, Clone, Serialize)]
pub struct AgentInfoResponse {
    pub version: String,
    pub platform: String,
    pub backends: Vec<String>,
    pub capabilities: Vec<String>,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub uptime_seconds: u64,
    pub db_ok: bool,
    pub queue_depth: usize,
}

// --- Agent Config ---

#[derive(Debug, Clone, Serialize)]
pub struct AgentConfigResponse {
    pub version: String,
    pub copy_storage_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAgentConfigRequest {
    pub copy_storage_dir: Option<String>,
}
