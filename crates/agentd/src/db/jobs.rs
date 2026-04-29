//! CRUD operations for job_executions table.

use rusqlite::Connection;
use crate::db::models::JobExecution;

pub fn list_all(conn: &Connection, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<JobExecution>, anyhow::Error> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, sla_policy_id, operation, status, copy_uuid, backup_copy_id,
                size_bytes, file_count, error_count, started_at, ended_at, log_path, failure_log_path
         FROM job_executions ORDER BY COALESCE(started_at, '') DESC LIMIT ?1 OFFSET ?2"
    )?;
    let rows = stmt.query_map([limit, offset], |row| {
        Ok(JobExecution {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            sla_policy_id: row.get(2)?,
            operation: row.get(3)?,
            status: row.get(4)?,
            copy_uuid: row.get(5)?,
            backup_copy_id: row.get(6)?,
            size_bytes: row.get(7)?,
            file_count: row.get(8)?,
            error_count: row.get(9)?,
            started_at: row.get(10)?,
            ended_at: row.get(11)?,
            log_path: row.get(12)?,
            failure_log_path: row.get(13)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<JobExecution>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, sla_policy_id, operation, status, copy_uuid, backup_copy_id,
                size_bytes, file_count, error_count, started_at, ended_at, log_path, failure_log_path
         FROM job_executions WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map([id], |row| {
        Ok(JobExecution {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            sla_policy_id: row.get(2)?,
            operation: row.get(3)?,
            status: row.get(4)?,
            copy_uuid: row.get(5)?,
            backup_copy_id: row.get(6)?,
            size_bytes: row.get(7)?,
            file_count: row.get(8)?,
            error_count: row.get(9)?,
            started_at: row.get(10)?,
            ended_at: row.get(11)?,
            log_path: row.get(12)?,
            failure_log_path: row.get(13)?,
        })
    })?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn insert(conn: &Connection, job: &JobExecution) -> Result<(), anyhow::Error> {
    conn.execute(
        "INSERT INTO job_executions (id, asset_id, sla_policy_id, operation, status, copy_uuid,
         backup_copy_id, size_bytes, file_count, error_count, started_at, ended_at, log_path,
         failure_log_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            job.id,
            job.asset_id,
            job.sla_policy_id,
            job.operation,
            job.status,
            job.copy_uuid,
            job.backup_copy_id,
            job.size_bytes,
            job.file_count,
            job.error_count,
            job.started_at,
            job.ended_at,
            job.log_path,
            job.failure_log_path,
        ],
    )?;
    Ok(())
}

pub fn update_status(conn: &Connection, id: &str, status: &str, error_count: i64) -> Result<(), anyhow::Error> {
    let ended_at = match status {
        "completed" | "failed" | "cancelled" => Some(chrono::Utc::now().to_rfc3339()),
        _ => None,
    };
    conn.execute(
        "UPDATE job_executions SET status = ?2, error_count = ?3, ended_at = COALESCE(?4, ended_at)
         WHERE id = ?1",
        rusqlite::params![id, status, error_count, ended_at],
    )?;
    Ok(())
}
