//! Job execution: dispatches to the appropriate adapter based on asset kind.

use std::path::PathBuf;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

use crate::adapters::file::FileBackupAdapter;
use crate::db::Database;
use crate::progress::ProgressBus;

/// Execute a single backup/restore/snapshot job.
pub async fn execute_job(
    db: Arc<Database>,
    progress: Arc<ProgressBus>,
    job_id: &str,
    asset_id: &str,
    operation: &str,
    cancel: CancellationToken,
) {
    progress.job_status(job_id, "running", None);

    // Load asset + SLA from DB
    let asset = match db.with_conn(|conn| crate::db::assets::get_by_id(conn, asset_id)) {
        Ok(Some(a)) => a,
        Ok(None) => {
            progress.job_status(job_id, "failed", Some("Asset not found"));
            let _ = db.with_conn(|conn| crate::db::jobs::update_status(conn, job_id, "failed", 1));
            return;
        }
        Err(e) => {
            progress.job_status(job_id, "failed", Some(&e.to_string()));
            let _ = db.with_conn(|conn| crate::db::jobs::update_status(conn, job_id, "failed", 1));
            return;
        }
    };

    let sla = match db.with_conn(|conn| crate::db::slas::get_by_id(conn, &asset.sla_policy_id)) {
        Ok(Some(s)) => s,
        _ => {
            progress.job_status(job_id, "failed", Some("SLA policy not found"));
            let _ = db.with_conn(|conn| crate::db::jobs::update_status(conn, job_id, "failed", 1));
            return;
        }
    };

    let config: crate::api::types::AssetConfig = match serde_json::from_str(&asset.config_json) {
        Ok(c) => c,
        Err(e) => {
            progress.job_status(job_id, "failed", Some(&e.to_string()));
            let _ = db.with_conn(|conn| crate::db::jobs::update_status(conn, job_id, "failed", 1));
            return;
        }
    };

    let result = match operation {
        "backup" => {
            execute_backup(&db, &progress, job_id, &asset, &sla, &config, cancel).await
        }
        "restore" => {
            progress.job_log(job_id, "warn", "Restore execution not yet implemented");
            Ok(())
        }
        "snapshot" => {
            progress.job_log(job_id, "warn", "Snapshot execution not yet implemented");
            Ok(())
        }
        _ => {
            progress.job_status(job_id, "failed", Some(&format!("Unknown operation: {operation}")));
            let _ = db.with_conn(|conn| crate::db::jobs::update_status(conn, job_id, "failed", 1));
            return;
        }
    };

    match result {
        Ok(()) => {
            progress.job_status(job_id, "completed", None);
            let _ = db.with_conn(|conn| crate::db::jobs::update_status(conn, job_id, "completed", 0));
        }
        Err(e) => {
            progress.job_status(job_id, "failed", Some(&e.to_string()));
            let _ = db.with_conn(|conn| crate::db::jobs::update_status(conn, job_id, "failed", 1));
        }
    }
}

async fn execute_backup(
    db: &Arc<Database>,
    progress: &Arc<ProgressBus>,
    job_id: &str,
    asset: &crate::db::models::ProtectedAsset,
    sla: &crate::db::models::SLAPolicy,
    config: &crate::api::types::AssetConfig,
    cancel: CancellationToken,
) -> Result<(), anyhow::Error> {
    match config {
        crate::api::types::AssetConfig::Fileset {
            paths,
            consistency_mode,
            exclude_patterns: _,
        } => {
            if *consistency_mode {
                progress.job_log(job_id, "info", "Consistency mode requested but not yet implemented; falling back to direct backup");
            }

            let target_dir = determine_target_dir(db, asset)?;

            progress.job_log(job_id, "info", &format!(
                "Fileset backup: {} paths -> {}",
                paths.len(),
                target_dir.display()
            ));

            if cancel.is_cancelled() {
                return Err(anyhow::anyhow!("Job cancelled"));
            }

            // Run in blocking thread since bifrost is synchronous
            let adapter = FileBackupAdapter::new(db.clone(), progress.clone());
            let paths_clone = paths.clone();
            let target_clone = target_dir.clone();
            let copy_mode = sla.copy_mode.clone();
            let backup_type = sla.backup_type.clone();
            let block_size = sla.block_size as usize;
            let subtask_count = sla.subtask_count as usize;
            let job_id_owned = job_id.to_string();
            let asset_id_owned = asset.id.clone();

            let result = tokio::task::spawn_blocking(move || {
                adapter.run_backup(
                    &asset_id_owned,
                    &job_id_owned,
                    &paths_clone,
                    &target_clone,
                    &copy_mode,
                    &backup_type,
                    block_size,
                    subtask_count,
                    None, // incremental_base not yet supported
                )
            })
            .await??;

            // Record backup copy in DB
            let copy_id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            let copy = crate::db::models::BackupCopy {
                id: copy_id.clone(),
                asset_id: asset.id.clone(),
                job_id: job_id.to_string(),
                kind: format!("file_{}", if sla.backup_type == "full_incremental" { "inc" } else { "full" }),
                copy_uuid: Some(result.copy_uuid.clone()),
                parent_copy_id: None,
                size_bytes: Some(result.total_bytes as i64),
                file_count: Some(result.total_files as i64),
                manifest_path: Some(result.copy_root.join("manifest.json").to_string_lossy().to_string()),
                data_path: Some(result.copy_root.to_string_lossy().to_string()),
                expires_at: None,
                status: "active".to_string(),
                created_at: now,
            };

            db.with_conn(|conn| crate::db::copies::insert(conn, &copy))?;

            progress.job_log(job_id, "info", &format!(
                "Backup copy recorded: id={copy_id}, uuid={}",
                result.copy_uuid
            ));

            Ok(())
        }
        crate::api::types::AssetConfig::Volume { .. } => {
            progress.job_log(job_id, "info", "Volume backup not yet implemented");
            Ok(())
        }
        crate::api::types::AssetConfig::NasShare { .. } => {
            progress.job_log(job_id, "info", "NAS share backup not yet implemented");
            Ok(())
        }
    }
}

fn determine_target_dir(
    _db: &Database,
    asset: &crate::db::models::ProtectedAsset,
) -> Result<PathBuf, anyhow::Error> {
    // Get agent config for copy_repos_dir, or fall back to default
    let base = PathBuf::from("/var/lib/bifrost-agent/copy_repos");
    let dir = base.join(format!("asset_{}", asset.id));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
