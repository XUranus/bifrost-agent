use rusqlite::Connection;

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>, anyhow::Error> {
    let result = conn.query_row(
        "SELECT value FROM agent_config WHERE key = ?1",
        [key],
        |row| row.get(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set(conn: &Connection, key: &str, value: &str) -> Result<(), anyhow::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO agent_config (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}
