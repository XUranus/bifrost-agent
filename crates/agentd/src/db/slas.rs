//! CRUD operations for sla_policies table.

use rusqlite::Connection;
use crate::db::models::SLAPolicy;

pub fn list_all(conn: &Connection) -> Result<Vec<SLAPolicy>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, copy_mode, backup_type, schedule_cron, block_size, subtask_count,
                memory_limit_mb, retention_kind, retention_value, aggregate_config_json,
                created_at, updated_at
         FROM sla_policies ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(SLAPolicy {
            id: row.get(0)?,
            name: row.get(1)?,
            copy_mode: row.get(2)?,
            backup_type: row.get(3)?,
            schedule_cron: row.get(4)?,
            block_size: row.get(5)?,
            subtask_count: row.get(6)?,
            memory_limit_mb: row.get(7)?,
            retention_kind: row.get(8)?,
            retention_value: row.get(9)?,
            aggregate_config_json: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<SLAPolicy>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, copy_mode, backup_type, schedule_cron, block_size, subtask_count,
                memory_limit_mb, retention_kind, retention_value, aggregate_config_json,
                created_at, updated_at
         FROM sla_policies WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map([id], |row| {
        Ok(SLAPolicy {
            id: row.get(0)?,
            name: row.get(1)?,
            copy_mode: row.get(2)?,
            backup_type: row.get(3)?,
            schedule_cron: row.get(4)?,
            block_size: row.get(5)?,
            subtask_count: row.get(6)?,
            memory_limit_mb: row.get(7)?,
            retention_kind: row.get(8)?,
            retention_value: row.get(9)?,
            aggregate_config_json: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn insert(conn: &Connection, policy: &SLAPolicy) -> Result<(), anyhow::Error> {
    conn.execute(
        "INSERT INTO sla_policies (id, name, copy_mode, backup_type, schedule_cron,
         block_size, subtask_count, memory_limit_mb, retention_kind, retention_value,
         aggregate_config_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            policy.id,
            policy.name,
            policy.copy_mode,
            policy.backup_type,
            policy.schedule_cron,
            policy.block_size,
            policy.subtask_count,
            policy.memory_limit_mb,
            policy.retention_kind,
            policy.retention_value,
            policy.aggregate_config_json,
            policy.created_at,
            policy.updated_at,
        ],
    )?;
    Ok(())
}

pub fn update(conn: &Connection, id: &str, policy: &SLAPolicy) -> Result<(), anyhow::Error> {
    conn.execute(
        "UPDATE sla_policies SET name = ?2, copy_mode = ?3, backup_type = ?4, schedule_cron = ?5,
         block_size = ?6, subtask_count = ?7, memory_limit_mb = ?8, retention_kind = ?9,
         retention_value = ?10, aggregate_config_json = ?11, updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![
            id,
            policy.name,
            policy.copy_mode,
            policy.backup_type,
            policy.schedule_cron,
            policy.block_size,
            policy.subtask_count,
            policy.memory_limit_mb,
            policy.retention_kind,
            policy.retention_value,
            policy.aggregate_config_json,
        ],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), anyhow::Error> {
    conn.execute("DELETE FROM sla_policies WHERE id = ?1", [id])?;
    Ok(())
}

/// Check if any assets reference this policy.
pub fn is_referenced(conn: &Connection, id: &str) -> Result<bool, anyhow::Error> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM protected_assets WHERE sla_policy_id = ?1",
        [id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}
