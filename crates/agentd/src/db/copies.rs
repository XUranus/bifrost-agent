//! CRUD operations for backup_copies table.

use rusqlite::Connection;
use crate::db::models::BackupCopy;

pub fn list_by_asset(conn: &Connection, asset_id: &str) -> Result<Vec<BackupCopy>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, job_id, kind, copy_uuid, parent_copy_id, size_bytes, file_count,
                manifest_path, data_path, expires_at, status, created_at
         FROM backup_copies WHERE asset_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([asset_id], |row| {
        Ok(BackupCopy {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            job_id: row.get(2)?,
            kind: row.get(3)?,
            copy_uuid: row.get(4)?,
            parent_copy_id: row.get(5)?,
            size_bytes: row.get(6)?,
            file_count: row.get(7)?,
            manifest_path: row.get(8)?,
            data_path: row.get(9)?,
            expires_at: row.get(10)?,
            status: row.get(11)?,
            created_at: row.get(12)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<BackupCopy>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, job_id, kind, copy_uuid, parent_copy_id, size_bytes, file_count,
                manifest_path, data_path, expires_at, status, created_at
         FROM backup_copies WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map([id], |row| {
        Ok(BackupCopy {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            job_id: row.get(2)?,
            kind: row.get(3)?,
            copy_uuid: row.get(4)?,
            parent_copy_id: row.get(5)?,
            size_bytes: row.get(6)?,
            file_count: row.get(7)?,
            manifest_path: row.get(8)?,
            data_path: row.get(9)?,
            expires_at: row.get(10)?,
            status: row.get(11)?,
            created_at: row.get(12)?,
        })
    })?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn insert(conn: &Connection, copy: &BackupCopy) -> Result<(), anyhow::Error> {
    conn.execute(
        "INSERT INTO backup_copies (id, asset_id, job_id, kind, copy_uuid, parent_copy_id,
         size_bytes, file_count, manifest_path, data_path, expires_at, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            copy.id,
            copy.asset_id,
            copy.job_id,
            copy.kind,
            copy.copy_uuid,
            copy.parent_copy_id,
            copy.size_bytes,
            copy.file_count,
            copy.manifest_path,
            copy.data_path,
            copy.expires_at,
            copy.status,
            copy.created_at,
        ],
    )?;
    Ok(())
}

pub fn update_status(conn: &Connection, id: &str, status: &str) -> Result<(), anyhow::Error> {
    conn.execute(
        "UPDATE backup_copies SET status = ?2 WHERE id = ?1",
        rusqlite::params![id, status],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), anyhow::Error> {
    conn.execute("DELETE FROM backup_copies WHERE id = ?1", [id])?;
    Ok(())
}
