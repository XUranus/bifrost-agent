use rusqlite::Connection;
use std::sync::Mutex;

use crate::config::AgentConfig;

mod migrations;
pub mod models;
pub mod agent_config;
pub mod assets;
pub mod slas;
pub mod jobs;
pub mod copies;
pub mod creds;
pub mod retention_log;

/// Central database handle, shared across all API handlers via axum State.
pub struct Database {
    conn: Mutex<Connection>,
    data_dir: std::path::PathBuf,
}

impl Database {
    /// Open (or create) the SQLite database and run migrations.
    pub fn open(config: &AgentConfig) -> Result<Self, anyhow::Error> {
        let path = config.db_path();
        let data_dir = config.data_dir.clone();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&path)?;

        // Enable WAL mode for better concurrent read performance.
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        let db = Self {
            conn: Mutex::new(conn),
            data_dir,
        };

        db.run_migrations()?;
        db.seed_defaults()?;
        Ok(db)
    }

    /// The agent's data directory.
    pub fn data_dir(&self) -> &std::path::Path {
        &self.data_dir
    }

    /// Acquire the connection lock and run a closure.
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, anyhow::Error>
    where
        F: FnOnce(&Connection) -> Result<T, anyhow::Error>,
    {
        let conn = self.conn.lock().unwrap();
        f(&conn)
    }

    fn run_migrations(&self) -> Result<(), anyhow::Error> {
        self.with_conn(|conn| migrations::run(conn))
    }

    fn seed_defaults(&self) -> Result<(), anyhow::Error> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT OR IGNORE INTO agent_config (key, value) VALUES ('copy_storage_dir', '/var/lib/bifrost-agent/copy_repos')",
                [],
            )?;
            Ok(())
        })
    }
}
