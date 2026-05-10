//! Job execution: dispatches to the appropriate adapter based on asset kind.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

use crate::adapters::consistency::ConsistencyAdapter;
use crate::adapters::file::FileBackupAdapter;
use crate::adapters::volume::VolumeBackupAdapter;
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
            execute_restore(&db, &progress, job_id, &asset, &config, cancel).await
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
            execute_fileset_backup(db, progress, job_id, asset, sla, paths, *consistency_mode, cancel).await
        }
        crate::api::types::AssetConfig::Volume {
            backend,
            volume_id,
        } => {
            execute_volume_backup(progress, job_id, asset, sla, backend, volume_id).await
        }
        crate::api::types::AssetConfig::NasShare {
            url,
            credential_id: _,
        } => {
            execute_nas_backup(db, progress, job_id, asset, sla, url, cancel).await
        }
    }
}

async fn execute_fileset_backup(
    db: &Arc<Database>,
    progress: &Arc<ProgressBus>,
    job_id: &str,
    asset: &crate::db::models::ProtectedAsset,
    sla: &crate::db::models::SLAPolicy,
    paths: &[PathBuf],
    consistency_mode: bool,
    cancel: CancellationToken,
) -> Result<(), anyhow::Error> {
    let target_dir = determine_target_dir(asset)?;
    let copy_mode = sla.copy_mode.clone();
    let backup_type = sla.backup_type.clone();
    let block_size = sla.block_size as usize;
    let subtask_count = sla.subtask_count as usize;
    let temp_base = PathBuf::from("/var/lib/bifrost-agent/copy_repos");

    progress.job_log(job_id, "info", &format!(
        "Fileset backup: {} paths -> {} (consistency={consistency_mode})",
        paths.len(),
        target_dir.display()
    ));

    if cancel.is_cancelled() {
        return Err(anyhow::anyhow!("Job cancelled"));
    }

    if consistency_mode {
        // Use consistency adapter: snapshot + mount + file scan
        let adapter = ConsistencyAdapter::new(progress.clone());
        let paths_clone = paths.to_vec();
        let target_clone = target_dir.clone();
        let job_id_owned = job_id.to_string();
        let backend = detect_backend(paths.first().unwrap_or(&target_dir))
            .unwrap_or_else(|| "btrfs".to_string());
        let bt = backup_type.clone();

        let result = tokio::task::spawn_blocking(move || {
            adapter.run_consistency_backup(
                &job_id_owned,
                &paths_clone,
                &target_clone,
                &backend,
                &copy_mode,
                &bt,
                block_size,
                subtask_count,
                &temp_base,
            )
        })
        .await??;

        record_backup_copy(db, asset, job_id, &backup_type, &result.copy_uuid, &result.copy_root, result.total_files, result.total_bytes).await?;

        progress.job_log(job_id, "info", &format!(
            "Consistency backup copy recorded: uuid={}", result.copy_uuid
        ));
    } else {
        // Standard file backup
        let adapter = FileBackupAdapter::new(db.clone(), progress.clone());
        let paths_clone = paths.to_vec();
        let target_clone = target_dir.clone();
        let job_id_owned = job_id.to_string();
        let asset_id_owned = asset.id.clone();
        let bt = backup_type.clone();

        let result = tokio::task::spawn_blocking(move || {
            adapter.run_backup(
                &asset_id_owned,
                &job_id_owned,
                &paths_clone,
                &target_clone,
                &copy_mode,
                &bt,
                block_size,
                subtask_count,
                None,
            )
        })
        .await??;

        record_backup_copy(db, asset, job_id, &backup_type, &result.copy_uuid, &result.copy_root, result.total_files, result.total_bytes).await?;

        progress.job_log(job_id, "info", &format!(
            "Backup copy recorded: uuid={}", result.copy_uuid
        ));
    }

    Ok(())
}

async fn execute_volume_backup(
    progress: &Arc<ProgressBus>,
    job_id: &str,
    asset: &crate::db::models::ProtectedAsset,
    _sla: &crate::db::models::SLAPolicy,
    backend: &str,
    volume_id: &str,
) -> Result<(), anyhow::Error> {
    let target_dir = determine_volume_target_dir(asset)?;

    progress.job_log(job_id, "info", &format!(
        "Volume backup: backend={backend}, volume={volume_id} -> {}",
        target_dir.display()
    ));

    let adapter = VolumeBackupAdapter::new(progress.clone());
    let backend_owned = backend.to_string();
    let volume_owned = volume_id.to_string();
    let target_clone = target_dir.clone();
    let job_id_owned = job_id.to_string();

    let result = tokio::task::spawn_blocking(move || {
        adapter.run_backup(
            &job_id_owned,
            &backend_owned,
            &volume_owned,
            &target_clone,
            None,
        )
    })
    .await??;

    progress.job_log(job_id, "info", &format!(
        "Volume backup complete: {} bytes, backend={}",
        result.size_bytes, result.backend
    ));

    Ok(())
}

async fn execute_nas_backup(
    db: &Arc<Database>,
    progress: &Arc<ProgressBus>,
    job_id: &str,
    asset: &crate::db::models::ProtectedAsset,
    sla: &crate::db::models::SLAPolicy,
    url: &str,
    cancel: CancellationToken,
) -> Result<(), anyhow::Error> {
    let target_dir = determine_target_dir(asset)?;
    let copy_mode = sla.copy_mode.clone();
    let backup_type = sla.backup_type.clone();
    let block_size = sla.block_size as usize;
    let subtask_count = sla.subtask_count as usize;

    // Parse the NAS URL to determine the transport type
    let source = if url.starts_with("nfs://") {
        bifrost::frame::location::DataLocation::from_nfs_url(url)
            .map_err(|e| anyhow::anyhow!("Invalid NFS URL '{url}': {e}"))?
    } else if url.starts_with("smb://") {
        bifrost::frame::location::DataLocation::from_smb_url(url)
            .map_err(|e| anyhow::anyhow!("Invalid SMB URL '{url}': {e}"))?
    } else {
        return Err(anyhow::anyhow!("Unsupported NAS URL scheme: {url}"));
    };

    progress.job_log(job_id, "info", &format!(
        "NAS backup: {url} -> {}",
        target_dir.display()
    ));

    if cancel.is_cancelled() {
        return Err(anyhow::anyhow!("Job cancelled"));
    }

    let target = bifrost::frame::location::DataLocation::local(target_dir.clone());
    let temp_base = PathBuf::from("/var/lib/bifrost-agent/copy_repos");

    progress.job_log(job_id, "info", &format!(
        "NAS backup config: mode={copy_mode}, type={backup_type}, source_kind={}",
        source.kind_name()
    ));

    let job_id_owned = job_id.to_string();
    let asset_id_owned = asset.id.clone();
    let progress_clone = progress.clone();
    let bt = backup_type.clone();

    let result = tokio::task::spawn_blocking(move || {
        run_nas_file_backup(
            &asset_id_owned,
            &job_id_owned,
            source,
            target,
            &copy_mode,
            &bt,
            block_size,
            subtask_count,
            &temp_base,
            &progress_clone,
        )
    })
    .await??;

    record_backup_copy(db, asset, job_id, &backup_type, &result.copy_uuid, &result.copy_root, result.total_files, result.total_bytes).await?;

    progress.job_log(job_id, "info", &format!(
        "NAS backup copy recorded: uuid={}", result.copy_uuid
    ));

    Ok(())
}

/// Run a file backup with a potentially remote source (NAS).
fn run_nas_file_backup(
    _asset_id: &str,
    job_id: &str,
    source: bifrost::frame::location::DataLocation,
    target: bifrost::frame::location::DataLocation,
    copy_mode: &str,
    backup_type: &str,
    block_size: usize,
    subtask_count: usize,
    temp_base: &std::path::Path,
    progress: &Arc<ProgressBus>,
) -> Result<crate::adapters::file::BackupResult, anyhow::Error> {
    use bifrost::backup::aggregate::AggregateConfig;
    use bifrost::failure::{FailureLogFormat, RetryPolicy};
    use bifrost::frame::backup_job::{BackupJobConfig, FileBackupJob};
    use bifrost::frame::repo::TempRepoConfig;
    use bifrost::frame::traits::BackupRestoreJob;
    use bifrost::frame::JobResult;

    progress.job_log(job_id, "info", "Starting NAS file backup...");

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

    let cfg = BackupJobConfig {
        source,
        target,
        format_tag: format_tag.into(),
        type_tag: type_tag.into(),
        temp_config: TempRepoConfig::new(temp_base),
        aggregate_config,
        enable_hardlink: true,
        enable_delete: true,
        enable_mtime: true,
        max_concurrent_subtasks: subtask_count,
        copy_buffer_size: block_size,
        failure_log_format: Some(FailureLogFormat::Json),
        retry_policy: RetryPolicy::default(),
        incremental_base: None,
        ..Default::default()
    };

    let result: JobResult = FileBackupJob::new(cfg).run()
        .map_err(|e| anyhow::anyhow!("NAS backup job failed: {e}"))?;

    progress.job_log(job_id, "info", &format!(
        "NAS backup complete: {} files, {} bytes, copy_uuid={}",
        result.total_files, result.total_bytes, result.copy_uuid
    ));

    Ok(crate::adapters::file::BackupResult {
        copy_uuid: result.copy_uuid,
        copy_root: result.copy_root,
        total_files: result.total_files,
        total_bytes: result.total_bytes,
        errors: result.subtasks_failed,
    })
}

/// Record a backup copy in the database.
async fn record_backup_copy(
    db: &Arc<Database>,
    asset: &crate::db::models::ProtectedAsset,
    job_id: &str,
    backup_type: &str,
    copy_uuid: &str,
    copy_root: &std::path::Path,
    total_files: u64,
    total_bytes: u64,
) -> Result<(), anyhow::Error> {
    let copy_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let copy = crate::db::models::BackupCopy {
        id: copy_id.clone(),
        asset_id: asset.id.clone(),
        job_id: job_id.to_string(),
        kind: format!("file_{}", if backup_type == "full_incremental" { "inc" } else { "full" }),
        copy_uuid: Some(copy_uuid.to_string()),
        parent_copy_id: None,
        size_bytes: Some(total_bytes as i64),
        file_count: Some(total_files as i64),
        manifest_path: Some(copy_root.join("manifest.json").to_string_lossy().to_string()),
        data_path: Some(copy_root.to_string_lossy().to_string()),
        expires_at: None,
        status: "active".to_string(),
        created_at: now,
    };

    db.with_conn(|conn| crate::db::copies::insert(conn, &copy))?;
    Ok(())
}

async fn execute_restore(
    db: &Arc<Database>,
    progress: &Arc<ProgressBus>,
    job_id: &str,
    asset: &crate::db::models::ProtectedAsset,
    config: &crate::api::types::AssetConfig,
    cancel: CancellationToken,
) -> Result<(), anyhow::Error> {
    // Find the most recent backup copy for this asset
    let copies = db.with_conn(|conn| crate::db::copies::list_by_asset(conn, &asset.id))?;
    let copy = copies.into_iter().find(|c| c.status == "active")
        .ok_or_else(|| anyhow::anyhow!("No active backup copy found for asset"))?;

    let copy_data_path = copy.data_path
        .ok_or_else(|| anyhow::anyhow!("Copy has no data path"))?;
    let source_dir = PathBuf::from(&copy_data_path);

    progress.job_log(job_id, "info", &format!(
        "Restoring from copy: {} at {}", &copy.id, source_dir.display()
    ));

    if cancel.is_cancelled() {
        return Err(anyhow::anyhow!("Job cancelled"));
    }

    match config {
        crate::api::types::AssetConfig::Fileset { paths, .. } => {
            let target = paths.first()
                .cloned()
                .unwrap_or_else(|| PathBuf::from("/"));
            let adapter = FileBackupAdapter::new(db.clone(), progress.clone());
            let src = source_dir.clone();
            let tgt = target.clone();
            let jid = job_id.to_string();

            tokio::task::spawn_blocking(move || {
                adapter.run_restore(&jid, &src, &tgt, bifrost::backup::RestorePolicy::Replace)
            }).await??;
        }
        crate::api::types::AssetConfig::Volume { backend, volume_id } => {
            let adapter = VolumeBackupAdapter::new(progress.clone());
            let image_path = find_image_in_dir(&source_dir)?;
            let be = backend.clone();
            let vol = volume_id.clone();
            let jid = job_id.to_string();

            tokio::task::spawn_blocking(move || {
                adapter.run_restore(&jid, &be, &vol, &image_path, true)
            }).await??;
        }
        crate::api::types::AssetConfig::NasShare { url, .. } => {
            let target = if url.starts_with("nfs://") {
                bifrost::frame::location::DataLocation::from_nfs_url(url)
                    .map_err(|e| anyhow::anyhow!("Invalid NFS URL: {e}"))?
            } else if url.starts_with("smb://") {
                bifrost::frame::location::DataLocation::from_smb_url(url)
                    .map_err(|e| anyhow::anyhow!("Invalid SMB URL: {e}"))?
            } else {
                return Err(anyhow::anyhow!("Unsupported NAS URL: {url}"));
            };

            let adapter = FileBackupAdapter::new(db.clone(), progress.clone());
            let src = source_dir.clone();
            let jid = job_id.to_string();

            tokio::task::spawn_blocking(move || {
                adapter.run_restore_with_location(&jid, &src, target, bifrost::backup::RestorePolicy::Replace)
            }).await??;
        }
    }

    progress.job_log(job_id, "info", "Restore completed successfully");
    Ok(())
}

fn find_image_in_dir(dir: &Path) -> Result<PathBuf, anyhow::Error> {
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

fn determine_target_dir(
    asset: &crate::db::models::ProtectedAsset,
) -> Result<PathBuf, anyhow::Error> {
    let base = PathBuf::from("/var/lib/bifrost-agent/copy_repos");
    let dir = base.join(format!("asset_{}", asset.id));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn determine_volume_target_dir(
    asset: &crate::db::models::ProtectedAsset,
) -> Result<PathBuf, anyhow::Error> {
    let base = PathBuf::from("/var/lib/bifrost-agent/volume_backups");
    let dir = base.join(format!("asset_{}", asset.id));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Detect the filesystem type of the mount point containing the given path.
///
/// Reads /proc/self/mounts and returns the filesystem type (e.g. "btrfs", "xfs", "ext4").
/// Falls back to None if detection fails.
fn detect_backend(path: &Path) -> Option<String> {
    let canonical = std::fs::canonicalize(path).ok()?;

    let mounts = std::fs::read_to_string("/proc/self/mounts").ok()?;

    // Find the mount point with the longest matching path
    let mut best_match: Option<(&str, &str)> = None;

    for line in mounts.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 3 {
            continue;
        }
        let mount_point = fields[1];
        let fs_type = fields[2];

        // Check if this mount point is a prefix of our path
        if canonical.starts_with(mount_point) {
            if best_match.map_or(true, |(best, _)| mount_point.len() > best.len()) {
                best_match = Some((mount_point, fs_type));
            }
        }
    }

    best_match.map(|(_, fs_type)| fs_type.to_string())
}
