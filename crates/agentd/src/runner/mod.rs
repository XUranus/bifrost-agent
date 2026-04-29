use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Semaphore, Mutex};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::db::Database;
use crate::progress::ProgressBus;

pub mod execute;
pub mod queue;

/// Manages the lifecycle of backup/restore jobs.
pub struct JobQueue {
    db: Arc<Database>,
    progress: Arc<ProgressBus>,
    semaphore: Arc<Semaphore>,
    active: Mutex<HashMap<Uuid, CancellationToken>>,
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
            active: Mutex::new(HashMap::new()),
        }
    }

    /// Number of currently active jobs.
    pub fn active_count(&self) -> usize {
        // Best-effort: try_lock to avoid blocking
        self.active.try_lock().map(|m| m.len()).unwrap_or(0)
    }
}
