# Changelog

## [0.1.0] — 2026-04-29

### Added

- **Workspace scaffolding**: Cargo workspace with `bifrost-agentd` crate
- **Agent daemon (`bifrost-agentd`)**:
  - CLI configuration with clap (data dir, bind address, port, log level, concurrency)
  - SQLite database with migration runner and full schema (protected_assets, sla_policies, job_executions, backup_copies, credentials, agent_config, retention_log)
  - Bearer token authentication (auto-generated on first run, stored in `agent.key`)
  - Tower auth middleware (ValidateRequestHeaderLayer with bearer token)
  - HTTP REST API endpoints:
    - `GET /api/v1/health` — health check (unauthenticated)
    - `GET /api/v1/agent/info` — agent version, platform, detected backends
    - `GET/PUT /api/v1/agent/config` — agent configuration
    - `GET/POST /api/v1/assets` — list and create protected assets
    - `GET/PUT/DELETE /api/v1/assets/:id` — asset CRUD
    - `POST /api/v1/assets/:id/test` — asset connectivity test
    - `GET/POST /api/v1/sla-policies` — list and create SLA policies
    - `GET/PUT/DELETE /api/v1/sla-policies/:id` — SLA policy CRUD
    - `GET /api/v1/sla-policies/:id/preview` — schedule preview
    - `GET/POST /api/v1/jobs` — list and start backup/restore jobs
    - `GET /api/v1/jobs/:id`, `POST /api/v1/jobs/:id/cancel` — job detail and cancel
    - `GET /api/v1/backup-copies` — list backup copies per asset
    - `GET/DELETE /api/v1/backup-copies/:id` — copy detail and delete
    - `POST /api/v1/backup-copies/:id/expire` — expire a copy
    - `POST /api/v1/restore` — start restore job
    - `GET /api/v1/browse/:copy_id` — browse backup copy contents (stub)
  - WebSocket endpoint (`/ws/events`) with progress event streaming
  - ProgressBus: broadcast channel for job progress, status, log, and health events
  - JobQueue: concurrent job management with semaphore-based limits
  - Backend auto-detection (Btrfs, LVM, ZFS) at startup
  - Privilege escalation check utility

### Added (Stage 5 — Backup Engine Integration)

- **FileBackupAdapter** (`adapters/file.rs`):
  - `run_backup()`: converts SLA params to `BackupJobConfig`, invokes `FileBackupJob::new(cfg).run()`, returns structured `BackupResult`
  - `run_restore()`: converts params to `RestoreJobConfig`, invokes `FileRestoreJob::new(cfg).run()`
  - Maps SLA copy_mode to bifrost format_tag (common→COMMON, aggregate→AGGR)
  - Maps SLA backup_type to bifrost type_tag (full→FULL, full_incremental→INC)
  - Configures hardlink, delete, mtime, aggregate mode, retry policy, failure logging
- **JobQueue** (`runner/queue.rs`):
  - `submit()`: inserts job row, spawns tokio task with semaphore permit, manages cancellation tokens
  - `cancel()`: signals cancellation token for running jobs
  - `Arc<Mutex<HashMap>>` for active job tracking with cleanup on completion/cancel
  - Proper concurrency limiting via `Arc<Semaphore>`
- **Job Execution** (`runner/execute.rs`):
  - `execute_job()`: dispatches backup/restore/snapshot operations by asset kind
  - Loads asset config, SLA policy, parses AssetConfig enum
  - `execute_backup()`: matches AssetConfig variant (Fileset/Volume/NasShare), spawns blocking task
  - Records `BackupCopy` row in DB after successful backup with copy metadata
  - Proper error propagation and status updates for all failure paths
- **Runner module** (`runner/mod.rs`): re-exports JobQueue from queue submodule

### Added (Stage 6 — Volume, Consistency, and NAS Adapters)

- **VolumeBackupAdapter** (`adapters/volume.rs`):
  - `run_backup()`: resolves vpt-rs backend by name, creates BackupPlan with temporary snapshot policy, calls `backend.backup_volume()`
  - `run_restore()`: creates RestorePlan, calls `backend.restore_volume()` with force flag
  - `create_snapshot()` / `delete_snapshot()`: snapshot lifecycle management via SnapshotProvider trait
  - Backend auto-resolution via `CurrentBackend::named()` (btrfs/lvm/zfs)
- **ConsistencyAdapter** (`adapters/consistency.rs`):
  - Full consistency backup workflow: volume snapshot → mount → bifrost file scan → unmount → delete snapshot
  - Uses vpt-rs `open_copy_mount` / `close_copy_mount` for composable snapshot+mount lifecycle
  - Groups source paths by volume to minimize snapshot count
  - Volume detection via `/proc/mounts` and `df` for path-to-volume mapping
  - Mount point resolution for path relocation inside snapshots
  - Cleanup guarantee: unmounts and deletes snapshots even on backup failure
- **NAS Share Backup** (in `execute.rs`):
  - Parses `nfs://` and `smb://` URLs via `DataLocation::from_nfs_url` / `from_smb_url`
  - Direct FileBackupJob execution with remote source DataLocation
  - Supports all bifrost transport combinations (NFS→local, SMB→local)
- **Full asset kind dispatch** (`execute.rs`):
  - Fileset: FileBackupAdapter (standard) or ConsistencyAdapter (consistency mode)
  - Volume: VolumeBackupAdapter with backend auto-detection
  - NasShare: FileBackupJob with remote DataLocation
  - Unified `record_backup_copy()` for all backup paths
  - Separate target directories for file copies vs volume images

### Engineering

- All API types defined with serde Serialize/Deserialize
- Full DB CRUD modules: assets, slas, jobs, copies, creds
- Migration test validates schema creation
- Auth token lifecycle test validates generation and loading
- Zero-warning release build, all 4 tests passing
