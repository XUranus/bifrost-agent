//! Cron-based scheduler: ticks every 60s, matches SLA schedules, submits jobs.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

use crate::db::Database;
use crate::runner::JobQueue;

/// Cron-based job scheduler.
///
/// Runs a background tick loop that evaluates SLA cron expressions and submits
/// backup jobs for assets whose schedules are due.
pub struct CronScheduler {
    db: Arc<Database>,
    queue: Arc<JobQueue>,
    last_run: Mutex<HashMap<String, i64>>, // asset_id -> last scheduled unix timestamp
}

impl CronScheduler {
    pub fn new(db: Arc<Database>, queue: Arc<JobQueue>) -> Self {
        Self {
            db,
            queue,
            last_run: Mutex::new(HashMap::new()),
        }
    }

    /// Start the scheduler loop. Runs until the cancellation token fires.
    pub async fn run(&self, cancel: tokio_util::sync::CancellationToken) {
        tracing::info!("Scheduler started (tick interval: 60s)");

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    tracing::info!("Scheduler cancelled, shutting down");
                    return;
                }
                _ = tokio::time::sleep(Duration::from_secs(60)) => {
                    if let Err(e) = self.tick().await {
                        tracing::error!("Scheduler tick failed: {e}");
                    }
                }
            }
        }
    }

    /// Single scheduler tick: check all enabled assets and submit due jobs.
    async fn tick(&self) -> Result<(), anyhow::Error> {
        let now = chrono::Utc::now();
        let now_ts = now.timestamp();

        // Load all enabled assets with their SLA policies
        let assets = self.db.with_conn(|conn| crate::db::assets::list_all(conn))?;

        for asset in assets {
            if !asset.enabled {
                continue;
            }

            let sla_id = match &asset.sla_policy_id {
                Some(id) => id.clone(),
                None => continue,
            };

            let sla = match self.db.with_conn(|conn| crate::db::slas::get_by_id(conn, &sla_id)) {
                Ok(Some(s)) => s,
                _ => continue,
            };

            // Parse cron expression
            let schedule = match cron::Schedule::from_str(&sla.schedule_cron) {
                Ok(s) => s,
                Err(e) => {
                    tracing::warn!(
                        "Invalid cron expression '{}' for SLA '{}' (asset {}): {e}",
                        sla.schedule_cron, sla.id, asset.id
                    );
                    continue;
                }
            };

            // Check if the schedule would have fired since our last run
            let mut last_map = self.last_run.lock().await;
            let last_ts = last_map.get(&asset.id).copied().unwrap_or(now_ts - 3600);

            // Get the next occurrence after our last run time
            let last_time: chrono::DateTime<chrono::Utc> = chrono::DateTime::from_timestamp(last_ts, 0)
                .unwrap_or_else(|| chrono::Utc::now());
            let next_fire: chrono::DateTime<chrono::Utc> = match schedule.after(&last_time).next() {
                Some(t) => t,
                None => continue,
            };

            // If the next fire time is before or at now, it's due
            if next_fire <= now {
                tracing::info!(
                    "Schedule due: asset={} ({}) cron={} last={} next={}",
                    asset.id, asset.name, sla.schedule_cron,
                    last_time.format("%Y-%m-%d %H:%M:%S"),
                    next_fire.format("%Y-%m-%d %H:%M:%S")
                );

                // Submit backup job
                match uuid::Uuid::parse_str(&asset.id) {
                    Ok(asset_uuid) => {
                        match self.queue.submit(asset_uuid, "backup").await {
                            Ok(job_id) => {
                                tracing::info!("Scheduled backup submitted: asset={} job={}", asset.id, job_id);
                                last_map.insert(asset.id.clone(), now_ts);
                            }
                            Err(e) => {
                                tracing::error!("Failed to submit scheduled backup for asset {}: {e}", asset.id);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Invalid asset UUID '{}': {e}", asset.id);
                    }
                }
            }
        }

        Ok(())
    }
}
