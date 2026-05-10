use axum::{
    extract::State,
    routing::post,
    Json, Router,
};

use crate::api::types::*;
use crate::server::router::AppState;
use crate::db;

/// POST /api/v1/restore
async fn start_restore(
    State(state): State<AppState>,
    Json(req): Json<RestoreRequest>,
) -> Result<Json<JobResponse>, (axum::http::StatusCode, String)> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let _now = chrono::Utc::now().to_rfc3339();

    let job = crate::db::models::JobExecution {
        id: job_id.clone(),
        asset_id: req.asset_id.clone(),
        sla_policy_id: None,
        operation: "restore".to_string(),
        status: "pending".to_string(),
        copy_uuid: Some(req.copy_id.clone()),
        backup_copy_id: Some(req.copy_id.clone()),
        size_bytes: None,
        file_count: Some(req.entries.len() as i64),
        error_count: 0,
        started_at: None,
        ended_at: None,
        log_path: None,
        failure_log_path: None,
    };

    state.db.with_conn(|conn| db::jobs::insert(conn, &job))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.progress.job_status(&job_id, "pending", None);
    state.progress.job_log(&job_id, "info", &format!(
        "Restore queued: {} entries",
        req.entries.len()
    ));

    // Spawn restore execution
    let db = state.db.clone();
    let progress = state.progress.clone();
    let job_id_clone = job_id.clone();
    let asset_id = req.asset_id.clone();
    let copy_id = req.copy_id.clone();

    tokio::spawn(async move {
        progress.job_status(&job_id_clone, "running", None);
        let result = execute_restore_job(&db, &progress, &job_id_clone, &asset_id, &copy_id).await;

        match result {
            Ok(()) => {
                progress.job_status(&job_id_clone, "completed", None);
                let _ = db.with_conn(|conn| db::jobs::update_status(conn, &job_id_clone, "completed", 0));
            }
            Err(e) => {
                progress.job_status(&job_id_clone, "failed", Some(&e.to_string()));
                let _ = db.with_conn(|conn| db::jobs::update_status(conn, &job_id_clone, "failed", 1));
            }
        }
    });

    Ok(Json(JobResponse {
        id: job.id,
        asset_id: job.asset_id,
        operation: job.operation,
        status: job.status,
        progress: None,
        size_bytes: job.size_bytes,
        file_count: job.file_count,
        error_count: job.error_count,
        started_at: job.started_at,
        ended_at: job.ended_at,
    }))
}

async fn execute_restore_job(
    db: &std::sync::Arc<crate::db::Database>,
    progress: &std::sync::Arc<crate::progress::ProgressBus>,
    job_id: &str,
    asset_id: &str,
    copy_id: &str,
) -> Result<(), anyhow::Error> {
    // Load asset
    let asset = db.with_conn(|conn| db::assets::get_by_id(conn, asset_id))?
        .ok_or_else(|| anyhow::anyhow!("Asset not found: {asset_id}"))?;

    // Load the backup copy
    let copy = db.with_conn(|conn| db::copies::get_by_id(conn, copy_id))?
        .ok_or_else(|| anyhow::anyhow!("Backup copy not found: {copy_id}"))?;

    let config: crate::api::types::AssetConfig = serde_json::from_str(&asset.config_json)?;

    let copy_data_path = copy.data_path
        .ok_or_else(|| anyhow::anyhow!("Copy has no data path"))?;
    let source_dir = std::path::PathBuf::from(&copy_data_path);

    progress.job_log(job_id, "info", &format!(
        "Restoring from copy {copy_id}, data at {}", source_dir.display()
    ));

    match config {
        crate::api::types::AssetConfig::Fileset { paths, .. } => {
            let target_dir = paths.first()
                .cloned()
                .unwrap_or_else(|| std::path::PathBuf::from("/"));

            progress.job_log(job_id, "info", &format!(
                "File restore: {} -> {}",
                source_dir.display(),
                target_dir.display()
            ));

            let adapter = crate::adapters::file::FileBackupAdapter::new(
                db.clone(),
                progress.clone(),
            );
            let source_clone = source_dir.clone();
            let target_clone = target_dir.clone();
            let job_id_owned = job_id.to_string();

            tokio::task::spawn_blocking(move || {
                adapter.run_restore(
                    &job_id_owned,
                    &source_clone,
                    &target_clone,
                    bifrost::backup::RestorePolicy::Replace,
                )
            })
            .await??;
        }
        crate::api::types::AssetConfig::Volume { backend, volume_id } => {
            progress.job_log(job_id, "info", &format!(
                "Volume restore: {} -> {volume_id} (backend={backend})",
                source_dir.display()
            ));

            // Find the image file inside the copy data directory
            let image_path = find_image_file(&source_dir)?;

            let adapter = crate::adapters::volume::VolumeBackupAdapter::new(progress.clone());
            let backend_clone = backend.clone();
            let volume_clone = volume_id.clone();
            let job_id_owned = job_id.to_string();

            tokio::task::spawn_blocking(move || {
                adapter.run_restore(
                    &job_id_owned,
                    &backend_clone,
                    &volume_clone,
                    &image_path,
                    true, // force for destructive restore
                )
            })
            .await??;
        }
        crate::api::types::AssetConfig::NasShare { url, .. } => {
            progress.job_log(job_id, "info", &format!(
                "NAS share restore: {} -> {}",
                source_dir.display(),
                url
            ));

            // Parse the NAS URL to determine the target location
            let target = if url.starts_with("nfs://") {
                bifrost::frame::location::DataLocation::from_nfs_url(&url)
                    .map_err(|e| anyhow::anyhow!("Invalid NFS URL '{url}': {e}"))?
            } else if url.starts_with("smb://") {
                bifrost::frame::location::DataLocation::from_smb_url(&url)
                    .map_err(|e| anyhow::anyhow!("Invalid SMB URL '{url}': {e}"))?
            } else {
                return Err(anyhow::anyhow!("Unsupported NAS URL scheme: {url}"));
            };

            let adapter = crate::adapters::file::FileBackupAdapter::new(
                db.clone(),
                progress.clone(),
            );
            let source_clone = source_dir.clone();
            let job_id_owned = job_id.to_string();

            // Use the NAS location as the restore target
            // bifrost will handle mounting/unmounting the share
            tokio::task::spawn_blocking(move || {
                adapter.run_restore_with_location(
                    &job_id_owned,
                    &source_clone,
                    target,
                    bifrost::backup::RestorePolicy::Replace,
                )
            })
            .await??;
        }
    }

    progress.job_log(job_id, "info", "Restore complete");
    Ok(())
}

/// Find a volume image file inside a copy data directory.
fn find_image_file(dir: &std::path::Path) -> Result<std::path::PathBuf, anyhow::Error> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.ends_with(".img") || name.starts_with("volume_") {
                return Ok(path);
            }
        }
    }
    Err(anyhow::anyhow!("No volume image file found in {}", dir.display()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(start_restore))
}
