//! VolumeBackupAdapter: wraps vpt-rs volume backup, restore, snapshot, and mount.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use vpt_rs::{
    BackupPlan, BackupSource, BackupTarget, RestorePlan,
    SnapshotInfo, SnapshotKind, SnapshotPolicy, SnapshotRequest, VolumeRef,
    BlockDeviceCopier, RestorePlanner, SnapshotProvider,
};
use vpt_rs::platform::CurrentBackend;

use crate::progress::ProgressBus;

/// Result of a volume backup operation.
#[derive(Debug)]
pub struct VolumeBackupResult {
    pub image_path: PathBuf,
    pub snapshot_id: Option<String>,
    pub size_bytes: u64,
    pub backend: String,
}

/// Adapter for volume-level backup, restore, snapshot, and mount operations
/// via the vpt-rs engine.
pub struct VolumeBackupAdapter {
    progress: Arc<ProgressBus>,
}

impl VolumeBackupAdapter {
    pub fn new(progress: Arc<ProgressBus>) -> Self {
        Self { progress }
    }

    /// Resolve a backend by name (e.g. "btrfs", "lvm", "zfs").
    fn resolve_backend(name: &str) -> Result<CurrentBackend, anyhow::Error> {
        CurrentBackend::named(name)
            .map_err(|e| anyhow::anyhow!("Failed to resolve volume backend '{}': {}", name, e))
    }

    /// Run a volume backup: snapshot + block-level copy to image file.
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn run_backup(
        &self,
        job_id: &str,
        backend_name: &str,
        volume_id: &str,
        target_dir: &Path,
        incremental_base: Option<&PathBuf>,
    ) -> Result<VolumeBackupResult, anyhow::Error> {
        self.progress.job_log(job_id, "info", &format!(
            "Volume backup: backend={backend_name}, volume={volume_id}"
        ));

        let backend = Self::resolve_backend(backend_name)?;
        let volume_ref = VolumeRef::new(volume_id);

        let image_path = target_dir.join(format!("volume_{}.img", sanitize_for_filename(volume_id)));

        self.progress.job_log(job_id, "info", &format!(
            "Backend: {}, capabilities: {:?}",
            backend.backend_name(),
            <CurrentBackend as SnapshotProvider>::capabilities(&backend)
        ));

        let plan = BackupPlan {
            source: BackupSource::Volume(volume_ref),
            target: BackupTarget::ImageFile(image_path.clone()),
            snapshot_policy: SnapshotPolicy::temporary(
                SnapshotKind::CrashConsistent,
                Some(format!("bifrost-agent-{job_id}")),
                true,
            ),
            parent_snapshot: incremental_base.map(|p| {
                vpt_rs::SnapshotRef::new(p.to_string_lossy().to_string())
            }),
        };

        self.progress.job_log(job_id, "info", "Creating snapshot and starting block-level backup...");

        backend.backup_volume(&plan)
            .map_err(|e| anyhow::anyhow!("Volume backup failed: {e}"))?;

        let size = std::fs::metadata(&image_path)
            .map(|m| m.len())
            .unwrap_or(0);

        self.progress.job_log(job_id, "info", &format!(
            "Volume backup complete: {} ({size} bytes)",
            image_path.display()
        ));

        Ok(VolumeBackupResult {
            image_path,
            snapshot_id: None, // temporary snapshot was auto-cleaned
            size_bytes: size,
            backend: backend.backend_name().to_string(),
        })
    }

    /// Run a volume restore from an image file.
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn run_restore(
        &self,
        job_id: &str,
        backend_name: &str,
        volume_id: &str,
        image_path: &Path,
        force: bool,
    ) -> Result<(), anyhow::Error> {
        self.progress.job_log(job_id, "info", &format!(
            "Volume restore: backend={backend_name}, volume={volume_id}, image={}",
            image_path.display()
        ));

        let backend = Self::resolve_backend(backend_name)?;

        let plan = RestorePlan {
            source: BackupTarget::ImageFile(image_path.to_path_buf()),
            destination: VolumeRef::new(volume_id),
            force,
            base_snapshot: None,
        };

        self.progress.job_log(job_id, "info", "Starting block-level restore...");

        backend.restore_volume(&plan)
            .map_err(|e| anyhow::anyhow!("Volume restore failed: {e}"))?;

        self.progress.job_log(job_id, "info", "Volume restore complete");
        Ok(())
    }

    /// Create a snapshot and return its info (for consistency mode or browsing).
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn create_snapshot(
        &self,
        job_id: &str,
        backend_name: &str,
        volume_id: &str,
        label: &str,
    ) -> Result<SnapshotInfo, anyhow::Error> {
        let backend = Self::resolve_backend(backend_name)?;
        let request = SnapshotRequest {
            source: VolumeRef::new(volume_id),
            kind: SnapshotKind::CrashConsistent,
            label: Some(label.to_string()),
            read_only: true,
        };

        let info = backend.create_snapshot(&request)
            .map_err(|e| anyhow::anyhow!("Snapshot creation failed: {e}"))?;

        self.progress.job_log(job_id, "info", &format!(
            "Snapshot created: id={}, path_hint={:?}",
            info.handle.id, info.path_hint
        ));

        Ok(info)
    }

    /// Delete a snapshot by its handle.
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn delete_snapshot(
        &self,
        job_id: &str,
        backend_name: &str,
        snapshot: &vpt_rs::SnapshotHandle,
    ) -> Result<(), anyhow::Error> {
        let backend = Self::resolve_backend(backend_name)?;
        backend.delete_snapshot(snapshot)
            .map_err(|e| anyhow::anyhow!("Snapshot deletion failed: {e}"))?;

        self.progress.job_log(job_id, "info", &format!("Snapshot deleted: id={}", snapshot.id));
        Ok(())
    }
}

fn sanitize_for_filename(s: &str) -> String {
    s.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|', ' '], "_")
}
