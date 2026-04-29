//! CRUD operations for protected_assets table.

use rusqlite::Connection;
use crate::db::models::ProtectedAsset;

pub fn list_all(conn: &Connection) -> Result<Vec<ProtectedAsset>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, config_json, sla_policy_id, enabled, created_at, updated_at
         FROM protected_assets ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ProtectedAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            kind: row.get(2)?,
            config_json: row.get(3)?,
            sla_policy_id: row.get(4)?,
            enabled: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<ProtectedAsset>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, config_json, sla_policy_id, enabled, created_at, updated_at
         FROM protected_assets WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map([id], |row| {
        Ok(ProtectedAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            kind: row.get(2)?,
            config_json: row.get(3)?,
            sla_policy_id: row.get(4)?,
            enabled: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn insert(conn: &Connection, asset: &ProtectedAsset) -> Result<(), anyhow::Error> {
    conn.execute(
        "INSERT INTO protected_assets (id, name, kind, config_json, sla_policy_id, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            asset.id,
            asset.name,
            asset.kind,
            asset.config_json,
            asset.sla_policy_id,
            asset.enabled as i32,
            asset.created_at,
            asset.updated_at,
        ],
    )?;
    Ok(())
}

pub fn update(conn: &Connection, id: &str, name: &str, config_json: &str, enabled: bool) -> Result<(), anyhow::Error> {
    conn.execute(
        "UPDATE protected_assets SET name = ?2, config_json = ?3, enabled = ?4, updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![id, name, config_json, enabled as i32],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), anyhow::Error> {
    conn.execute("DELETE FROM protected_assets WHERE id = ?1", [id])?;
    Ok(())
}
