use rusqlite::Connection;

use crate::db::models::RetentionLogEntry;

/// Insert a retention log entry.
pub fn insert(conn: &Connection, entry: &RetentionLogEntry) -> Result<(), anyhow::Error> {
    conn.execute(
        "INSERT INTO retention_log (id, asset_id, copy_id, reason, pruned_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![entry.id, entry.asset_id, entry.copy_id, entry.reason, entry.pruned_at],
    )?;
    Ok(())
}

/// List all retention log entries for an asset.
#[allow(dead_code)]
pub fn list_by_asset(conn: &Connection, asset_id: &str) -> Result<Vec<RetentionLogEntry>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, copy_id, reason, pruned_at FROM retention_log WHERE asset_id = ?1 ORDER BY pruned_at DESC"
    )?;
    let rows = stmt.query_map(rusqlite::params![asset_id], |row| {
        Ok(RetentionLogEntry {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            copy_id: row.get(2)?,
            reason: row.get(3)?,
            pruned_at: row.get(4)?,
        })
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}
