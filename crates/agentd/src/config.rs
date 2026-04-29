use clap::Parser;
use std::path::PathBuf;

/// Bifrost backup agent daemon.
#[derive(Parser, Debug, Clone)]
#[command(name = "bifrost-agentd", version = env!("CARGO_PKG_VERSION"))]
pub struct AgentConfig {
    /// Data directory for agent state, database, and backup repositories
    #[arg(long, env = "BIFROST_AGENT_DATA_DIR", default_value = "/var/lib/bifrost-agent")]
    pub data_dir: PathBuf,

    /// Bind address for the HTTP API
    #[arg(long, env = "BIFROST_AGENT_BIND_HOST", default_value = "127.0.0.1")]
    pub bind_host: String,

    /// Bind port for the HTTP API
    #[arg(long, env = "BIFROST_AGENT_BIND_PORT", default_value_t = 8787)]
    pub bind_port: u16,

    /// Maximum concurrent backup jobs
    #[arg(long, env = "BIFROST_AGENT_MAX_CONCURRENT_JOBS", default_value_t = 2)]
    pub max_concurrent_jobs: usize,

    /// Log level (trace, debug, info, warn, error)
    #[arg(long, env = "BIFROST_AGENT_LOG_LEVEL", default_value = "info")]
    pub log_level: String,
}

impl AgentConfig {
    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("bifrost.db")
    }

    pub fn token_path(&self) -> PathBuf {
        self.data_dir.join("agent.key")
    }

    pub fn copy_repos_dir(&self) -> PathBuf {
        self.data_dir.join("copy_repos")
    }

    pub fn volume_backups_dir(&self) -> PathBuf {
        self.data_dir.join("volume_backups")
    }

    pub fn mounts_dir(&self) -> PathBuf {
        self.data_dir.join("mounts")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.data_dir.join("logs")
    }

    pub fn jobs_log_dir(&self) -> PathBuf {
        self.logs_dir().join("jobs")
    }

    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.bind_host, self.bind_port)
    }

    /// Ensure all required directories exist.
    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(self.data_dir())?;
        std::fs::create_dir_all(self.copy_repos_dir())?;
        std::fs::create_dir_all(self.volume_backups_dir())?;
        std::fs::create_dir_all(self.mounts_dir())?;
        std::fs::create_dir_all(self.jobs_log_dir())?;
        Ok(())
    }

    fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }
}
