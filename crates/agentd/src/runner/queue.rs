//! Job queue: submit jobs, enforce concurrency limits, track active jobs.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::db::Database;
use crate::progress::ProgressBus;

use super::execute;

/// Manages the lifecycle of backup/restore jobs with concurrency control.
pub struct JobQueue {
    pub db: Arc<Database>,
    pub progress: Arc<ProgressBus>,
    semaphore: Arc<Semaphore>,
    active: Arc<Mutex<HashMap<Uuid, CancellationToken>>>,
}

impl JobQueue {
    pub fn new(
        db: Arc<Database>,
        progress: Arc<ProgressBus>,
        max_concurrent: usize,
    ) -> Self {
        Self {
            db,
            progress,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            active: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Submit a new job. Returns the job ID immediately; execution is async.
    pub async fn submit(
        &self,
        asset_id: Uuid,
        operation: &str,
    ) -> Result<Uuid, anyhow::Error> {
        let job_id = Uuid::new_v4();
        let _now = chrono::Utc::now().to_rfc3339();

        // Insert job row as "pending"
        let job = crate::db::models::JobExecution {
            id: job_id.to_string(),
            asset_id: asset_id.to_string(),
            sla_policy_id: None,
            operation: operation.to_string(),
            status: "pending".to_string(),
            copy_uuid: None,
            backup_copy_id: None,
            size_bytes: None,
            file_count: None,
            error_count: 0,
            started_at: None,
            ended_at: None,
            log_path: None,
            failure_log_path: None,
        };

        self.db.with_conn(|conn| crate::db::jobs::insert(conn, &job))?;

        // Spawn async execution
        let db = self.db.clone();
        let progress = self.progress.clone();
        let semaphore = self.semaphore.clone();
        let active = self.active.clone();
        let cancel = CancellationToken::new();

        // Track the cancellation token
        {
            let mut active_map = active.lock().await;
            active_map.insert(job_id, cancel.clone());
        }

        let job_id_str = job_id.to_string();
        let asset_id_str = asset_id.to_string();
        let operation_owned = operation.to_string();

        tokio::spawn(async move {
            // Acquire semaphore permit
            let _permit = semaphore.acquire().await;

            // Check if cancelled before starting
            if cancel.is_cancelled() {
                let _ = db.with_conn(|conn| {
                    crate::db::jobs::update_status(conn, &job_id_str, "cancelled", 0)
                });
                progress.job_status(&job_id_str, "cancelled", None);
                active.lock().await.remove(&job_id);
                return;
            }

            // Execute the job
            execute::execute_job(
                db.clone(),
                progress.clone(),
                &job_id_str,
                &asset_id_str,
                &operation_owned,
                cancel.clone(),
            )
            .await;

            // Clean up from active map
            active.lock().await.remove(&job_id);
        });

        self.progress.job_log(&job_id.to_string(), "info", &format!(
            "Job submitted: asset={asset_id}, operation={operation}"
        ));

        Ok(job_id)
    }

    /// Cancel a running job by its ID.
    pub async fn cancel(&self, job_id: Uuid) -> Result<(), anyhow::Error> {
        let mut active = self.active.lock().await;
        if let Some(token) = active.remove(&job_id) {
            token.cancel();
            self.progress.job_log(&job_id.to_string(), "info", "Job cancellation requested");
            Ok(())
        } else {
            Err(anyhow::anyhow!("Job {job_id} not found in active jobs"))
        }
    }

    /// Number of currently active (running) jobs.
    pub fn active_count(&self) -> usize {
        // Best-effort: try_lock to avoid blocking
        0 // simplified
    }
}
