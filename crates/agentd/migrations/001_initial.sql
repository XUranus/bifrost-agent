-- 001_initial: Core schema for Bifrost Agent
BEGIN;

CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE protected_assets (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK(kind IN ('fileset', 'volume', 'nas_share')),
    config_json     TEXT NOT NULL,
    sla_policy_id   TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sla_policies (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    copy_mode       TEXT NOT NULL CHECK(copy_mode IN ('common', 'aggregate')),
    backup_type     TEXT NOT NULL CHECK(backup_type IN ('full', 'full_incremental')),
    schedule_cron   TEXT NOT NULL,
    block_size      INTEGER NOT NULL DEFAULT 1048576,
    subtask_count   INTEGER NOT NULL DEFAULT 4,
    memory_limit_mb INTEGER NOT NULL DEFAULT 512,
    retention_kind  TEXT NOT NULL CHECK(retention_kind IN ('by_count', 'by_age_days', 'by_storage_gb')),
    retention_value INTEGER NOT NULL,
    aggregate_config_json TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE backup_copies (
    id              TEXT PRIMARY KEY,
    asset_id        TEXT NOT NULL REFERENCES protected_assets(id),
    job_id          TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK(kind IN ('file_full', 'file_inc', 'volume_full', 'volume_inc')),
    copy_uuid       TEXT,
    parent_copy_id  TEXT REFERENCES backup_copies(id),
    size_bytes      INTEGER,
    file_count      INTEGER,
    manifest_path   TEXT,
    data_path       TEXT,
    expires_at      TEXT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'pruned')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE job_executions (
    id              TEXT PRIMARY KEY,
    asset_id        TEXT NOT NULL REFERENCES protected_assets(id),
    sla_policy_id   TEXT REFERENCES sla_policies(id),
    operation       TEXT NOT NULL CHECK(operation IN ('backup', 'restore', 'snapshot')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    copy_uuid       TEXT,
    backup_copy_id  TEXT REFERENCES backup_copies(id),
    size_bytes      INTEGER,
    file_count      INTEGER,
    error_count     INTEGER DEFAULT 0,
    started_at      TEXT,
    ended_at        TEXT,
    log_path        TEXT,
    failure_log_path TEXT
);

CREATE TABLE credentials (
    id              TEXT PRIMARY KEY,
    asset_id        TEXT NOT NULL REFERENCES protected_assets(id),
    kind            TEXT NOT NULL CHECK(kind IN ('nfs', 'smb')),
    data_json       TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE retention_log (
    id        TEXT PRIMARY KEY,
    asset_id  TEXT NOT NULL REFERENCES protected_assets(id),
    copy_id   TEXT NOT NULL REFERENCES backup_copies(id),
    reason    TEXT NOT NULL,
    pruned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backup_copies_asset ON backup_copies(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_backup_copies_parent ON backup_copies(parent_copy_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_asset ON job_executions(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
CREATE INDEX IF NOT EXISTS idx_credentials_asset ON credentials(asset_id);

COMMIT;
