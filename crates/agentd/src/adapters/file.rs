//! FileBackupAdapter: wraps bifrost FileBackupJob + FileRestoreJob.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use bifrost::backup::aggregate::AggregateConfig;
use bifrost::failure::{FailureLogConfig, FailureLogFormat, RetryPolicy};
use bifrost::frame::backup_job::{BackupJobConfig, FileBackupJob};
use bifrost::frame::location::DataLocation;
use bifrost::frame::repo::TempRepoConfig;
use bifrost::frame::traits::BackupRestoreJob;
use bifrost::frame::JobResult;

use crate::db::Database;
use crate::progress::ProgressBus;

/// Result of a backup operation.
#[derive(Debug)]
pub struct BackupResult {
    pub copy_uuid: String,
    pub copy_root: PathBuf,
    pub total_files: u64,
    pub total_bytes: u64,
    pub errors: usize,
}

/// Adapter for file-level backup and restore via the bifrost engine.
pub struct FileBackupAdapter {
    _db: Arc<Database>,
    progress: Arc<ProgressBus>,
}

impl FileBackupAdapter {
    pub fn new(_db: Arc<Database>, progress: Arc<ProgressBus>) -> Self {
        Self { _db, progress }
    }

    /// Run a file backup job for a fileset asset.
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn run_backup(
        &self,
        _asset_id: &str,
        job_id: &str,
        source_paths: &[PathBuf],
        target_dir: &Path,
        copy_mode: &str,
        backup_type: &str,
        block_size: usize,
        subtask_count: usize,
        incremental_base: Option<&PathBuf>,
    ) -> Result<BackupResult, anyhow::Error> {
        self.progress.job_status(job_id, "running", None);
        self.progress.job_log(job_id, "info", "Starting file backup scan phase...");

        let source = DataLocation::local(source_paths.first().cloned().unwrap_or_else(|| PathBuf::from("/")));
        let target = DataLocation::local(target_dir.to_path_buf());

        let format_tag = match copy_mode {
            "aggregate" => "AGGR",
            _ => "COMMON",
        };

        let type_tag = match backup_type {
            "full_incremental" => "INC",
            _ => "FULL",
        };

        let aggregate_config = if copy_mode == "aggregate" {
            AggregateConfig::enabled()
        } else {
            AggregateConfig::default()
        };

        let failure_log_path = self.failure_log_path(job_id);
        let _failure_log = FailureLogConfig::new(&failure_log_path, FailureLogFormat::Json);

        // Build temp config using agent's copy repos directory
        let temp_base = self.copy_repo_dir();

        let cfg = BackupJobConfig {
            source,
            target,
            format_tag: format_tag.into(),
            type_tag: type_tag.into(),
            temp_config: TempRepoConfig::new(&temp_base),
            aggregate_config,
            enable_hardlink: true,
            enable_delete: true,
            enable_mtime: true,
            max_concurrent_subtasks: subtask_count,
            copy_buffer_size: block_size,
            failure_log_format: Some(FailureLogFormat::Json),
            retry_policy: RetryPolicy::default(),
            incremental_base: incremental_base.cloned(),
            ..Default::default()
        };

        self.progress.job_log(job_id, "info", &format!(
            "Backup config: mode={copy_mode}, type={backup_type}, target={}",
            target_dir.display()
        ));

        // Run the backup (blocking)
        let result: JobResult = FileBackupJob::new(cfg).run().map_err(|e| {
            anyhow::anyhow!("Backup job failed: {e}")
        })?;

        self.progress.job_log(job_id, "info", &format!(
            "Backup complete: {} files, {} bytes, copy_uuid={}",
            result.total_files, result.total_bytes, result.copy_uuid
        ));

        Ok(BackupResult {
            copy_uuid: result.copy_uuid,
            copy_root: result.copy_root,
            total_files: result.total_files,
            total_bytes: result.total_bytes,
            errors: result.subtasks_failed,
        })
    }

    /// Run a file restore job.
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn run_restore(
        &self,
        job_id: &str,
        source_dir: &Path,
        target_dir: &Path,
        policy: bifrost::backup::RestorePolicy,
    ) -> Result<(), anyhow::Error> {
        use bifrost::frame::FileRestoreJob;
        use bifrost::frame::RestoreJobConfig;
        use bifrost::frame::location::DataLocation;

        self.progress.job_status(job_id, "running", None);
        self.progress.job_log(job_id, "info", "Starting file restore...");

        let cfg = RestoreJobConfig {
            copy_source: DataLocation::local(source_dir.to_path_buf()),
            restore_target: DataLocation::local(target_dir.to_path_buf()),
            policy,
            ..Default::default()
        };

        let restore_job = FileRestoreJob::new(cfg);
        let result = restore_job.run().map_err(|e| {
            anyhow::anyhow!("Restore job failed: {e}")
        })?;

        self.progress.job_log(job_id, "info", &format!(
            "Restore complete: {} files, {} bytes",
            result.total_files, result.total_bytes
        ));

        Ok(())
    }

    fn copy_repo_dir(&self) -> PathBuf {
        let dir = self._db.with_conn(|conn| crate::db::agent_config::get(conn, "copy_storage_dir"))
            .unwrap_or(None)
            .unwrap_or_else(|| "/var/lib/bifrost-agent/copy_repos".to_string());
        PathBuf::from(dir)
    }

    /// Run a file restore job to a remote destination (NAS, SMB, NFS).
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn run_restore_with_location(
        &self,
        job_id: &str,
        source_dir: &Path,
        target: DataLocation,
        policy: bifrost::backup::RestorePolicy,
    ) -> Result<(), anyhow::Error> {
        use bifrost::frame::FileRestoreJob;
        use bifrost::frame::RestoreJobConfig;

        self.progress.job_status(job_id, "running", None);
        self.progress.job_log(job_id, "info", "Starting file restore to remote target...");

        let cfg = RestoreJobConfig {
            copy_source: DataLocation::local(source_dir.to_path_buf()),
            restore_target: target,
            policy,
            ..Default::default()
        };

        let restore_job = FileRestoreJob::new(cfg);
        let result = restore_job.run().map_err(|e| {
            anyhow::anyhow!("Restore job failed: {e}")
        })?;

        self.progress.job_log(job_id, "info", &format!(
            "Restore complete: {} files, {} bytes",
            result.total_files, result.total_bytes
        ));

        Ok(())
    }

    fn failure_log_path(&self, job_id: &str) -> PathBuf {
        PathBuf::from("/var/lib/bifrost-agent/logs/jobs")
            .join(format!("{job_id}_failures.json"))
    }
}
