//! Consistency backup orchestrator: vpt-rs snapshot + bifrost file scan.
//!
//! Flow:
//! 1. Determine which volumes contain the fileset paths
//! 2. Create volume snapshots via vpt-rs
//! 3. Mount snapshots to temporary directories
//! 4. Run bifrost FileBackupJob against the mounted snapshot paths
//! 5. Unmount snapshots
//! 6. Delete snapshots

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use bifrost::backup::aggregate::AggregateConfig;
use bifrost::failure::{FailureLogFormat, RetryPolicy};
use bifrost::frame::backup_job::{BackupJobConfig, FileBackupJob};
use bifrost::frame::location::DataLocation;
use bifrost::frame::repo::TempRepoConfig;
use bifrost::frame::traits::BackupRestoreJob;
use bifrost::frame::JobResult;
use vpt_rs::{
    CopyMountRequest, CopyMountSession, MountMode, SnapshotKind, VolumeRef,
    close_copy_mount, open_copy_mount,
};
use vpt_rs::platform::CurrentBackend;

use crate::progress::ProgressBus;

/// Result of a consistency backup.
#[derive(Debug)]
pub struct ConsistencyBackupResult {
    pub copy_uuid: String,
    pub copy_root: PathBuf,
    pub total_files: u64,
    pub total_bytes: u64,
    pub errors: usize,
    pub snapshot_count: usize,
}

/// Orchestrates a consistency backup: takes snapshots of volumes containing
/// the fileset paths, then runs a file backup against the snapshot mount points.
pub struct ConsistencyAdapter {
    progress: Arc<ProgressBus>,
}

impl ConsistencyAdapter {
    pub fn new(progress: Arc<ProgressBus>) -> Self {
        Self { progress }
    }

    /// Run a consistency backup.
    ///
    /// This is a blocking operation — call from `tokio::task::spawn_blocking`.
    pub fn run_consistency_backup(
        &self,
        job_id: &str,
        source_paths: &[PathBuf],
        target_dir: &Path,
        backend_name: &str,
        copy_mode: &str,
        backup_type: &str,
        block_size: usize,
        subtask_count: usize,
        temp_base: &Path,
    ) -> Result<ConsistencyBackupResult, anyhow::Error> {
        self.progress.job_log(job_id, "info", "Starting consistency backup: snapshot + mount + file scan");

        // Group source paths by volume to minimize snapshot count
        let volume_groups = group_paths_by_volume(source_paths);
        self.progress.job_log(job_id, "info", &format!(
            "Detected {} volume(s) for {} source paths",
            volume_groups.len(),
            source_paths.len()
        ));

        // Phase 1: Create snapshots and mount them
        let backend = CurrentBackend::named(backend_name)
            .map_err(|e| anyhow::anyhow!("Failed to resolve backend '{}': {}", backend_name, e))?;

        let mut sessions: Vec<CopyMountSession> = Vec::new();
        let mut path_mappings: Vec<(PathBuf, PathBuf)> = Vec::new(); // (original, mount-relative)

        for (volume_id, paths) in &volume_groups {
            self.progress.job_log(job_id, "info", &format!(
                "Creating snapshot for volume {volume_id} ({path_count} paths)",
                path_count = paths.len()
            ));

            let request = CopyMountRequest {
                source: VolumeRef::new(volume_id),
                kind: SnapshotKind::CrashConsistent,
                label: Some(format!("bifrost-consistency-{job_id}")),
                mode: MountMode::ReadOnly,
                target: None, // auto-generate mount point
            };

            let session = open_copy_mount(&backend, &request)
                .map_err(|e| {
                    // Clean up any already-opened sessions on failure
                    for s in &sessions {
                        let _ = close_copy_mount(&backend, &s.snapshot.handle, &s.mount);
                    }
                    anyhow::anyhow!("Failed to create/mount snapshot for volume {volume_id}: {e}")
                })?;

            self.progress.job_log(job_id, "info", &format!(
                "Snapshot mounted at {} for volume {volume_id}",
                session.mount.mount_point.display()
            ));

            // Map original paths to mount-point-relative bifrost paths
            let mount_root = session.mount.mount_point.clone();
            for original_path in paths {
                // The path inside the snapshot mount corresponds to the original path
                // For subvolumes/datasets, the mount point contains the filesystem root
                let relocated = relocate_path(original_path, volume_id, &mount_root);
                path_mappings.push((original_path.clone(), relocated));
            }

            sessions.push(session);
        }

        // Phase 2: Run bifrost file backup against mounted snapshot paths
        let snapshot_paths: Vec<PathBuf> = path_mappings.iter().map(|(_, snap)| snap.clone()).collect();

        self.progress.job_log(job_id, "info", &format!(
            "Running file backup against {} snapshot mount points",
            snapshot_paths.len()
        ));

        let source = DataLocation::local(
            snapshot_paths.first().cloned().unwrap_or_else(|| PathBuf::from("/"))
        );
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

        let backup_result: Result<JobResult, _> = FileBackupJob::new(cfg).run();
        let snapshot_count = sessions.len();

        // Phase 3: Clean up — unmount and delete snapshots (always)
        for session in &sessions {
            if let Err(e) = close_copy_mount(&backend, &session.snapshot.handle, &session.mount) {
                self.progress.job_log(job_id, "warn", &format!(
                    "Failed to close copy-mount session (mount={}): {e}",
                    session.mount.mount_point.display()
                ));
            }
        }

        // Now check the backup result
        let result = backup_result.map_err(|e| {
            anyhow::anyhow!("Consistency backup file scan failed: {e}")
        })?;

        self.progress.job_log(job_id, "info", &format!(
            "Consistency backup complete: {} files, {} bytes, {} snapshots cleaned up",
            result.total_files, result.total_bytes, snapshot_count
        ));

        Ok(ConsistencyBackupResult {
            copy_uuid: result.copy_uuid,
            copy_root: result.copy_root,
            total_files: result.total_files,
            total_bytes: result.total_bytes,
            errors: result.subtasks_failed,
            snapshot_count,
        })
    }
}

/// Group source paths by the volume/filesystem they reside on.
///
/// On Linux, this uses `/proc/mounts` or `mount` output to determine which
/// filesystem each path belongs to.
fn group_paths_by_volume(paths: &[PathBuf]) -> HashMap<String, Vec<PathBuf>> {
    let mut groups: HashMap<String, Vec<PathBuf>> = HashMap::new();

    for path in paths {
        let volume = detect_volume_for_path(path);
        groups.entry(volume).or_default().push(path.clone());
    }

    groups
}

/// Detect the volume/device a path resides on.
fn detect_volume_for_path(path: &Path) -> String {
    // Use `df` or `stat` to determine the mount point / device
    // Simple heuristic: parse /proc/mounts or use stat
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let path_str = path.to_string_lossy().to_string();
        if let Ok(output) = Command::new("df").arg(&path_str).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse: Filesystem ... Mounted on
            // /dev/mapper/vg0-data ... /home
            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if !parts.is_empty() {
                    let device = parts[0].to_string();
                    if !device.starts_with("tmpfs") && !device.starts_with("devtmpfs") {
                        return device;
                    }
                }
            }
        }
    }
    // Fallback: use path parent or a synthetic identifier
    path.parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string())
}

/// Map an original filesystem path to its location inside a snapshot mount.
///
/// Example: file `/home/user/docs/file.txt` on volume `/dev/vg0/home` mounted at
/// `/tmp/snap_abc` → `/tmp/snap_abc/user/docs/file.txt`
fn relocate_path(original: &Path, _volume_id: &str, mount_root: &Path) -> PathBuf {
    // For block-level snapshots (LVM), the mount contains the full filesystem
    // so we need to find the relative path within the filesystem.
    // Simple approach: use the path as-is relative to the filesystem root.
    // For subvolume-based snapshots (btrfs), the subvolume IS the mount point.

    // Find the mount point of the original path
    let mount_point = find_mount_point(original);

    // Strip the mount point prefix to get relative path within the filesystem
    let relative = if original.starts_with(&mount_point) {
        original.strip_prefix(&mount_point).unwrap_or(original)
    } else {
        original
    };

    mount_root.join(relative)
}

/// Find the mount point for a given path using /proc/mounts.
fn find_mount_point(path: &Path) -> PathBuf {
    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/mounts") {
            let mut best_match: Option<(PathBuf, usize)> = None;
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let mp = PathBuf::from(parts[1]);
                    if path.starts_with(&mp) {
                        let len = mp.to_string_lossy().len();
                        match &best_match {
                            Some((_, best_len)) if len > *best_len => {
                                best_match = Some((mp, len));
                            }
                            None => {
                                best_match = Some((mp, len));
                            }
                            _ => {}
                        }
                    }
                }
            }
            if let Some((mp, _)) = best_match {
                return mp;
            }
        }
    }
    // Fallback
    PathBuf::from("/")
}
