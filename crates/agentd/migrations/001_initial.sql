-- 001_initial: Core schema for Bifrost Agent
BEGIN;

CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE sla_policies (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    copy_mode       TEXT NOT NULL CHECK(copy_mode IN ('common', 'aggregate')),
    backup_type     TEXT NOT NULL CHECK(backup_type IN ('full', 'full_incremental')),
    schedule_cron   TEXT NOT NULL,
    block_size      INTEGER NOT NULL DEFAULT 1048576,
    subtask_count   INTEGER NOT NULL DEFAULT 4,
    memory_limit_mb INTEGER NOT NULL DEFAULT 512,
    retention_kind  TEXT NOT NULL CHECK(retention_kind IN ('by_count', 'by_age_days', 'by_storage_gb')),
    retention_value INTEGER NOT NULL,
    aggregate_config_json TEXT,
    is_builtin      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE protected_assets (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK(kind IN ('fileset', 'volume', 'nas_share')),
    config_json     TEXT NOT NULL,
    sla_policy_id   TEXT REFERENCES sla_policies(id),
    enabled         INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS agent_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Seed default config values
INSERT OR IGNORE INTO agent_config (key, value) VALUES ('copy_storage_dir', '/var/lib/bifrost-agent/copy_repos');

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

-- Seed built-in SLA policies
INSERT OR IGNORE INTO sla_policies (id, name, copy_mode, backup_type, schedule_cron, block_size, subtask_count, memory_limit_mb, retention_kind, retention_value, is_builtin)
VALUES
    ('builtin-hourly', 'Hourly Backup', 'common', 'full_incremental', '0 * * * *', 1048576, 4, 512, 'by_count', 24, 1),
    ('builtin-daily', 'Daily Backup', 'common', 'full', '0 2 * * *', 1048576, 4, 512, 'by_count', 7, 1),
    ('builtin-weekly', 'Weekly Backup', 'common', 'full', '0 2 * * 0', 1048576, 4, 512, 'by_count', 4, 1);

COMMIT;
