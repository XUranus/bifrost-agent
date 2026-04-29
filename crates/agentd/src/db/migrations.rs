use rusqlite::Connection;

const MIGRATIONS: &[(&str, &str)] = &[
    ("001_initial", include_str!("../../migrations/001_initial.sql")),
];

/// Run all pending migrations against the database.
pub fn run(conn: &Connection) -> Result<(), anyhow::Error> {
    // Ensure schema_version table exists (bootstrap).
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);"
    )?;
    // Insert initial version only if table is empty.
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM schema_version",
        [],
        |row| row.get(0),
    )?;
    if count == 0 {
        conn.execute("INSERT INTO schema_version VALUES (0)", [])?;
    }

    let current: i32 = conn.query_row(
        "SELECT version FROM schema_version LIMIT 1",
        [],
        |row| row.get(0),
    )?;

    for (name, sql) in MIGRATIONS {
        let version: i32 = name
            .split('_')
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        if version > current {
            tracing::info!("Running migration: {name} (v{version})");
            conn.execute_batch(sql)?;
            conn.execute(
                "UPDATE schema_version SET version = ?1",
                [version],
            )?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrations_run() {
        let conn = Connection::open_in_memory().unwrap();
        run(&conn).unwrap();

        // Verify tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"protected_assets".to_string()));
        assert!(tables.contains(&"sla_policies".to_string()));
        assert!(tables.contains(&"job_executions".to_string()));
        assert!(tables.contains(&"backup_copies".to_string()));
        assert!(tables.contains(&"credentials".to_string()));
        assert!(tables.contains(&"agent_config".to_string()));
        assert!(tables.contains(&"retention_log".to_string()));

        // Verify version is set
        let version: i32 = conn
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert!(version > 0);
    }
}
