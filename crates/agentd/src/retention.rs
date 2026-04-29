//! Retention engine: evaluates SLA policies and prunes expired backup copies.

use std::sync::Arc;

use crate::db::Database;
use crate::progress::ProgressBus;

/// Evaluates retention policies and prunes expired backup copies.
pub struct RetentionEngine {
    db: Arc<Database>,
    _progress: Arc<ProgressBus>,
}

impl RetentionEngine {
    pub fn new(db: Arc<Database>, progress: Arc<ProgressBus>) -> Self {
        Self { db, _progress: progress }
    }

    /// Run retention evaluation for all assets.
    ///
    /// For each enabled asset, loads the SLA retention policy and active copies,
    /// determines which copies to expire, and marks them accordingly.
    pub fn evaluate_all(&self) -> Result<RetentionSummary, anyhow::Error> {
        tracing::info!("Starting retention evaluation for all assets");
        let mut summary = RetentionSummary::default();

        let assets = self.db.with_conn(|conn| crate::db::assets::list_all(conn))?;

        for asset in &assets {
            if !asset.enabled {
                continue;
            }

            let sla = match self.db.with_conn(|conn| crate::db::slas::get_by_id(conn, &asset.sla_policy_id)) {
                Ok(Some(s)) => s,
                _ => continue,
            };

            match self.evaluate_asset(asset, &sla) {
                Ok(count) => {
                    summary.expired += count;
                    if count > 0 {
                        tracing::info!("Retention: asset={} expired={} copies", asset.id, count);
                    }
                }
                Err(e) => {
                    tracing::error!("Retention evaluation failed for asset {}: {e}", asset.id);
                    summary.errors += 1;
                }
            }
        }

        tracing::info!(
            "Retention evaluation complete: {} expired, {} errors in {} assets",
            summary.expired, summary.errors, summary.assets_evaluated
        );
        Ok(summary)
    }

    /// Evaluate retention for a single asset.
    ///
    /// Returns the number of copies expired.
    fn evaluate_asset(
        &self,
        asset: &crate::db::models::ProtectedAsset,
        sla: &crate::db::models::SLAPolicy,
    ) -> Result<usize, anyhow::Error> {
        let copies = self.db.with_conn(|conn| {
            crate::db::copies::list_by_asset(conn, &asset.id)
        })?;

        // Only consider active copies
        let mut active_copies: Vec<_> = copies
            .into_iter()
            .filter(|c| c.status == "active")
            .collect();

        if active_copies.is_empty() {
            return Ok(0);
        }

        // Sort by creation time descending (newest first)
        active_copies.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let expired = match sla.retention_kind.as_str() {
            "count" => {
                Self::retain_by_count(&active_copies, sla.retention_value as usize)
            }
            "days" => {
                Self::retain_by_days(&active_copies, sla.retention_value)
            }
            "size_gb" => {
                Self::retain_by_size(&active_copies, sla.retention_value)
            }
            "none" | "" => {
                vec![] // No retention policy
            }
            other => {
                tracing::warn!("Unknown retention kind '{other}' for SLA {}, skipping", sla.id);
                return Ok(0);
            }
        };

        let count = expired.len();
        if count > 0 {
            let now = chrono::Utc::now().to_rfc3339();
            for copy in &expired {
                // Update copy status to expired
                self.db.with_conn(|conn| {
                    crate::db::copies::update_status(conn, &copy.id, "expired")
                })?;

                // Log the retention action
                let entry = crate::db::models::RetentionLogEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    asset_id: asset.id.clone(),
                    copy_id: copy.id.clone(),
                    reason: format!(
                        "Retention policy: {}={}, copy age={}",
                        sla.retention_kind,
                        sla.retention_value,
                        copy.created_at
                    ),
                    pruned_at: now.clone(),
                };
                self.db.with_conn(|conn| {
                    crate::db::retention_log::insert(conn, &entry)
                })?;

                // Delete data directory if present
                if let Some(ref data_path) = copy.data_path {
                    let path = std::path::Path::new(data_path);
                    if path.exists() {
                        if let Err(e) = std::fs::remove_dir_all(path) {
                            tracing::warn!(
                                "Failed to delete expired copy data at {}: {e}",
                                data_path
                            );
                        }
                    }
                }

                tracing::info!(
                    "Retention expired: copy={} asset={} kind={}",
                    copy.id, asset.id, copy.kind
                );
            }
        }

        Ok(count)
    }

    /// Keep only the N most recent copies.
    fn retain_by_count(copies: &[crate::db::models::BackupCopy], max_count: usize) -> Vec<crate::db::models::BackupCopy> {
        if max_count == 0 || copies.len() <= max_count {
            return vec![];
        }
        copies[max_count..].to_vec()
    }

    /// Keep copies younger than N days.
    fn retain_by_days(copies: &[crate::db::models::BackupCopy], max_days: i64) -> Vec<crate::db::models::BackupCopy> {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(max_days);
        copies
            .iter()
            .filter(|c| {
                chrono::DateTime::parse_from_rfc3339(&c.created_at)
                    .map(|dt| dt.with_timezone(&chrono::Utc) < cutoff)
                    .unwrap_or(false)
            })
            .cloned()
            .collect()
    }

    /// Keep copies up to N GB total size (oldest expired first).
    fn retain_by_size(copies: &[crate::db::models::BackupCopy], max_size_gb: i64) -> Vec<crate::db::models::BackupCopy> {
        let max_bytes = max_size_gb as u64 * 1_073_741_824u64;
        let mut total: u64 = 0;
        let mut expired = Vec::new();

        // Copies are sorted newest-first; we expire oldest (at end of list)
        for copy in copies.iter() {
            let size = copy.size_bytes.unwrap_or(0) as u64;
            if total + size > max_bytes {
                expired.push(copy.clone());
            } else {
                total += size;
            }
        }

        expired
    }
}

#[derive(Debug, Default)]
pub struct RetentionSummary {
    pub assets_evaluated: usize,
    pub expired: usize,
    pub errors: usize,
}
