//! CRUD operations for credentials table.

use rusqlite::Connection;
use crate::db::models::Credential;

pub fn get_by_asset(conn: &Connection, asset_id: &str) -> Result<Option<Credential>, anyhow::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, kind, data_json, created_at
         FROM credentials WHERE asset_id = ?1"
    )?;
    let mut rows = stmt.query_map([asset_id], |row| {
        Ok(Credential {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            kind: row.get(2)?,
            data_json: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn insert(conn: &Connection, cred: &Credential) -> Result<(), anyhow::Error> {
    conn.execute(
        "INSERT INTO credentials (id, asset_id, kind, data_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            cred.id,
            cred.asset_id,
            cred.kind,
            cred.data_json,
            cred.created_at,
        ],
    )?;
    Ok(())
}

pub fn delete_by_asset(conn: &Connection, asset_id: &str) -> Result<(), anyhow::Error> {
    conn.execute("DELETE FROM credentials WHERE asset_id = ?1", [asset_id])?;
    Ok(())
}
