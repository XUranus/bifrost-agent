use serde::{Deserialize, Serialize};

/// Row from protected_assets table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtectedAsset {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub config_json: String,
    pub sla_policy_id: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Row from sla_policies table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SLAPolicy {
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
    pub aggregate_config_json: Option<String>,
    pub is_builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Row from job_executions table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobExecution {
    pub id: String,
    pub asset_id: String,
    pub sla_policy_id: Option<String>,
    pub operation: String,
    pub status: String,
    pub copy_uuid: Option<String>,
    pub backup_copy_id: Option<String>,
    pub size_bytes: Option<i64>,
    pub file_count: Option<i64>,
    pub error_count: i64,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub log_path: Option<String>,
    pub failure_log_path: Option<String>,
}

/// Row from backup_copies table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupCopy {
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

/// Row from credentials table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: String,
    pub asset_id: String,
    pub kind: String,
    pub data_json: String,
    pub created_at: String,
}

/// Row from retention_log table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionLogEntry {
    pub id: String,
    pub asset_id: String,
    pub copy_id: String,
    pub reason: String,
    pub pruned_at: String,
}
