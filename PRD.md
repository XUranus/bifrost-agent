# Bifrost Desktop — Product Requirements Document

**Status:** Draft  
**Version:** 0.2.0  
**Date:** 2026-04-29  
**Author:** xuranus

---

## 1. Product Overview

### 1.1 Elevator Pitch

Bifrost Desktop is a cross-platform (Linux / macOS / Windows) backup application. It provides **file-level backup** (powered by the `bifrost` engine), **volume-level backup** (powered by the `vpt-rs` engine), and **NAS share backup** (NFS/SMB, powered by `bifrost` transport layer) — all managed through a unified "Protected Asset" model with SLA-driven scheduling and retention.

The system is split into two deployable components:

- **Bifrost Agent** (`bifrost-agentd`): A headless daemon that executes backup/restore jobs, manages schedules, and persists state. Runs as a systemd service on Linux.
- **Bifrost Desktop** (`bifrost-desktop`): A Tauri-based GUI client that connects to one or more agents via HTTP/JSON RPC, providing configuration, monitoring, and restore workflows.

Agent and desktop client can run on the same machine or be deployed separately (e.g., agent on a NAS, client on a workstation).

### 1.2 Problem Statement

Existing backup tools force users into a trade-off:

- **File-level tools** (rsync, Borg, Restic, Duplicati) are easy to use but cannot do block-level volume backup, leverage native filesystem snapshots, or handle NAS shares natively.
- **Volume-level tools** (dd, partclone, btrfs send, zfs send, LVM snapshots) are powerful but require deep CLI expertise, provide no built-in file browsing or scheduling, and ignore file-level incremental logic.
- **Enterprise backup suites** (Veeam, Commvault, Bacula) are overkill for individual power users and SMBs, are often Windows-only, and blur the line between agent and console poorly.

Bifrost bridges this gap with a single agent that protects files, volumes, and NAS shares under one SLA model, and a desktop client that manages it all without a terminal.

### 1.3 Target Audience

| Persona | Use Case |
|---------|----------|
| **Linux power user / sysadmin** | Scheduled incremental file backups of `/home` + LVM snapshots of data volumes to external drives or a NAS agent |
| **SMB / homelab operator** | Weekly volume-level backups of ZFS datasets to a backup server, plus daily file-level backups of config directories, all managed from a laptop |
| **Developer** | Pre-upgrade snapshots of root filesystem (Btrfs) + continuous backup of project directories with consistency mode |
| **macOS user (future)** | File backup to a Linux agent on the network or local external drive |
| **Windows power user (future)** | File backup to SMB shares, VSS-based volume snapshots for system state capture |

### 1.4 Platform Support Strategy

| Platform | Phase | Agent | Desktop Client |
|----------|-------|-------|----------------|
| **Linux** | Phase 1 (MVP) | Full: bifrost (local/NFS/SMB) + vpt-rs (Btrfs/LVM/ZFS) | Full: Tauri desktop |
| **macOS** | Phase 2 | bifrost (local/NFS/SMB) + vpt-rs APFS stub | Tauri desktop |
| **Windows** | Phase 3 | bifrost (local/SMB) + vpt-rs VSS stub | Tauri desktop |

Phase 1 focuses exclusively on Linux for both components. The agent RPC protocol is platform-agnostic from day one.

---

## 2. Core Concepts

### 2.1 Protected Asset

A **Protected Asset** is the unit of protection — the "what to back up." Three kinds exist:

| Asset Kind | Description | Backend Engine | Examples |
|------------|-------------|---------------|----------|
| **Fileset** | One or more local file/directory paths | `bifrost` file backup | `/home`, `/etc`, `/var/lib/docker/volumes` |
| **Volume** | A local block volume, filesystem, or dataset | `vpt-rs` volume backup | `/dev/vg0/data` (LVM), `tank/data` (ZFS), `/mnt/data/subvol` (Btrfs) |
| **NAS Share** | A remote NFS export or SMB share (with credentials) | `bifrost` NFS/SMB transport | `nfs://nas.local/exports/backup`, `smb://fileserver/shared/team` |

Each Protected Asset is configured with exactly one **SLA Policy** (see below) and stores its credentials (for NAS shares) or volume backend metadata (for volumes) alongside the asset definition.

#### 2.1.1 Consistency Backup Mode (Fileset only)

A Fileset asset may optionally enable **consistency backup mode**. When enabled, the agent:

1. Before scanning: determines which volume(s) contain the protected paths
2. Uses `vpt-rs` to take a temporary read-only snapshot of each involved volume (e.g., Btrfs subvolume snapshot, LVM snapshot, ZFS snapshot)
3. Mounts the snapshots at temporary paths
4. Runs `bifrost` file scan + copy against the mounted snapshot paths (guaranteeing a point-in-time consistent view)
5. After backup: unmounts and deletes all temporary snapshots

This is powered by `vpt-rs::copy_mount::{open,close}_copy_mount` composed with `bifrost::scanner::Scanner`. Without consistency mode, the file backup scans the live filesystem directly (files may change during scan).

Consistency mode is only available when the fileset resides on a filesystem for which vpt-rs has a snapshot-capable backend (Btrfs, LVM, ZFS). The agent auto-detects this and presents the option accordingly.

### 2.2 SLA Policy

An **SLA Policy** defines the "how" and "when" of backup for a Protected Asset:

| Parameter | Description | Engine Mapping |
|-----------|-------------|---------------|
| **Copy mode** | `common` (file-by-file copy) or `aggregate` (pack small files into blobs) | `bifrost::backup::AggregateConfig` |
| **Backup type** | `full` only, or `full + incremental` (inc not applicable to volume assets) | bifrost copy type; vpt-rs parent snapshot |
| **Schedule** | Cron expression for recurring execution | Agent scheduler |
| **Block read size** | I/O buffer size for copy operations | bifrost backup buffer size; vpt-rs `dd bs=` |
| **Concurrent subtask count** | Number of parallel copy workers | bifrost worker pool size |
| **Memory limit** | Soft memory cap for the backup job (spill-to-disk when exceeded) | bifrost `SpillQueue` threshold |
| **Retention policy** | How many backups to keep, or max age, or max total storage | Built in agent (not in engines) |

An SLA Policy can be shared across multiple Protected Assets or be asset-specific.

### 2.3 Backup Copy

A **Backup Copy** is the result of a single execution of an SLA Policy against a Protected Asset. It contains:

- Copy metadata (UUID, timestamps, type full/inc, size, file count)
- For fileset/NAS: a bifrost copy repository (`manifest.json` + `D_REPO`/`M_REPO`/`C_REPO`)
- For volume: a backup image file + metadata (backend type, partition info, checksums)
- Execution log and failure records

Backup copies are subject to the SLA retention policy — expired copies are pruned automatically.

---

## 3. System Architecture

### 3.1 Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                     Deployment Options                       │
│                                                              │
│  Option A: Single-host (both on same Linux machine)         │
│  ┌──────────────┐     HTTP/WS      ┌────────────────────┐   │
│  │ bifrost-desktop │ ◄────localhost───► │  bifrost-agentd    │   │
│  │  (Tauri GUI)   │                  │  (systemd service) │   │
│  └──────────────┘                    │  ┌──────────────┐ │   │
│                                       │  │  scheduler   │ │   │
│                                       │  │  job runner  │ │   │
│                                       │  │  SQLite DB   │ │   │
│                                       │  └──────────────┘ │   │
│                                       └────────────────────┘   │
│                                                              │
│  Option B: Remote agent (agent on NAS, client on desktop)    │
│  ┌──────────────┐     HTTP/WS      ┌────────────────────┐   │
│  │ bifrost-desktop │ ◄─── LAN/VPN ───► │  bifrost-agentd    │   │
│  │  (workstation) │                  │  (NAS/server)      │   │
│  └──────────────┘                    └────────────────────┘   │
│                                                              │
│  Option C: Headless (agent only, no GUI)                     │
│  ┌────────────────────┐                                      │
│  │  bifrost-agentd    │ ← configured via CLI or REST API     │
│  │  (server)          │                                       │
│  └────────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Architecture

```
┌──────────────────────────────────────────────────────────┐
│              bifrost-desktop (Tauri GUI)                  │
│                                                           │
│  Frontend: React + TypeScript + Vite                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Dashboard│ │ Assets   │ │ Restore   │ │ Settings    │ │
│  │          │ │ & SLA    │ │ Wizard    │ │             │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │
│                                                           │
│  Rust Backend (thin layer):                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AgentClient (HTTP + WebSocket to agentd)           │  │
│  │  ConnectionManager (multi-agent, reconnect, auth)   │  │
│  │  LocalSettingsStore (window geom, theme, agent URLs)│  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                  HTTP/JSON RPC + WebSocket                 │
├──────────────────────────────────────────────────────────┤
│              bifrost-agentd (Headless Daemon)              │
│                                                           │
│  HTTP Server (axum):                                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │  REST API (/api/v1/...)    WebSocket (/ws/events)   │  │
│  │  Auth middleware (shared-secret token)              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  Application Layer:                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AssetRegistry │ SLAEngine │ JobScheduler          │  │
│  │  RetentionEngine│ ProgressBus │ NotificationMgr    │  │
│  │  PrivilegeEscalator                                │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  Domain Adapters:                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  FileBackupAdapter   VolumeBackupAdapter           │  │
│  │  (wraps bifrost)     (wraps vpt-rs)                │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  Engines (linked as libraries):                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  bifrost crate              vpt-rs crate            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  Infrastructure:                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  SQLite (assets, SLA, history, retention state)    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Technology Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Agent HTTP framework | **axum** (Rust) | Async, tower middleware, WebSocket support, well-maintained |
| Agent DB | **SQLite** via `rusqlite` | Already a bifrost dependency; zero-config; single-file |
| Desktop framework | **Tauri 2.x** | Native Rust integration; smaller binary than Electron |
| Desktop frontend | **React + TypeScript** + Vite | Mature ecosystem, strong typing |
| UI Kit | **Ant Design** or **Radix UI** | Good data-table, form, notification primitives |
| RPC protocol | **REST + JSON** for requests; **WebSocket** for streaming events | Simple, debuggable, widely supported |
| Auth (client↔agent) | **Pre-shared key** (bearer token in `Authorization` header) | Simple for LAN/localhost; can add mTLS later |
| Agent daemonization | **systemd** service (Linux) | Native integration, auto-restart, logging to journald |
| Scheduling | In-process cron engine in agentd | No external dependency; survives reboot via systemd |
| Packaging | **AppImage** (desktop); static binary (agent) | Minimal dependencies; works across distros |

### 3.4 Key Architectural Decisions

**AD-01: Agent and desktop are separate processes communicating via HTTP/WS.**  
The agent must run as a background service to execute scheduled backups independently of whether the desktop GUI is open. Separating them also enables remote deployment (agent on NAS, client on workstation) and headless operation. The desktop client is a "fat UI / thin logic" layer — all backup intelligence lives in the agent.

**AD-02: Both engines are linked as libraries into the agent binary.**  
`bifrost` and `vpt-rs` are Rust crates linked directly into `bifrost-agentd`. No subprocess invocation for engine operations. Progress callbacks from the engines are bridged directly into the agent's WebSocket event bus.

**AD-03: SQLite in the agent is the single source of truth.**  
Asset definitions, SLA policies, schedule state, job history, retention bookkeeping, and agent configuration all live in one SQLite database at `/var/lib/bifrost-agent/bifrost.db` (or a configurable path). The desktop client holds no persistent state beyond local preferences (window geometry, theme, list of known agent URLs).

**AD-04: Progress is push-based via WebSocket.**  
Both engines expose streaming progress (bifrost via `ScanStatsSnapshot`; vpt-rs via subprocess pipe parsing). The adapters bridge these into WebSocket events so the desktop client receives real-time progress without polling. When no desktop client is connected, events are buffered for the job history log only.

**AD-05: Privilege escalation is explicit and scoped to operations that need it.**  
Volume backup (LVM snapshots, `dd`, `btrfs send`) typically requires root. The agent runs as a non-root service user by default. When an operation requires elevation, the agent invokes `pkexec` (or equivalent) for that specific subprocess, with clear audit logging. The desktop client surfaces permission errors with resolution instructions.

**AD-06: Protected Assets and SLA Policies are separate entities with a 1:1 binding.**  
An SLA Policy can be defined independently and reused, but each Protected Asset references exactly one policy. This keeps the model simple while allowing policy sharing where desired (users can point multiple assets at the same policy).

**AD-07: Consistency backup composes vpt-rs snapshot + bifrost scan.**  
This is not a third engine — it's the agent orchestrating: `vpt-rs::open_copy_mount()` → `bifrost::Scanner::enqueue_path()` on mount point → `bifrost::BackupTask` → `vpt-rs::close_copy_mount()`. The agent auto-detects which vpt-rs backend owns each path by mapping the path to its parent volume.

---

## 4. Feature Set

### 4.1 MVP (Phase 1 — Linux)

#### 4.1.1 Protected Asset Management (P0)

| ID | Feature | Description |
|----|---------|-------------|
| PA-01 | **Create Fileset asset** | User selects local directories/files; optionally enables consistency mode |
| PA-02 | **Create Volume asset** | Auto-detect available backends (Btrfs/LVM/ZFS), list volumes, select one |
| PA-03 | **Create NAS Share asset** | Enter NFS export URL or SMB share path + credentials; connectivity test |
| PA-04 | **Asset list/detail** | View all assets with status, last backup, next scheduled run, health |
| PA-05 | **Edit/delete asset** | Modify asset paths/credentials; delete asset (with option to keep or delete existing backup copies) |
| PA-06 | **Asset health check** | Verify paths exist, volumes are accessible, NAS credentials still valid |

#### 4.1.2 SLA Policy Management (P0)

| ID | Feature | Description |
|----|---------|-------------|
| SL-01 | **Create/edit SLA policy** | Configure all SLA parameters (copy mode, backup type, schedule, block size, subtask count, memory limit, retention) |
| SL-02 | **Policy assignment** | Bind an SLA policy to a Protected Asset (1:1) |
| SL-03 | **Policy presets** | Built-in policy templates: "Daily Quick" (aggregate, inc, 7-day retention), "Weekly Full" (common, full, 4-week retention), "Monthly Archive" (aggregate, full, 12-month retention) |
| SL-04 | **Retention configuration** | By copy count, by age (days), or by total storage size; automatic pruning |
| SL-05 | **Next-run preview** | Show the next 5 scheduled execution times for a policy |

#### 4.1.3 File Backup (P0)

| ID | Feature | Description | Engine |
|----|---------|-------------|--------|
| FB-01 | **Full file backup** | Complete copy of all files in a Fileset or NAS Share asset | `bifrost::frame::BackupJob` (full) |
| FB-02 | **Incremental file backup** | Copy only files changed since the last backup (aggregate format only) | `bifrost::backup::aggregate` incremental |
| FB-03 | **Aggregate backup** | Pack small files into blob containers (size threshold configurable in SLA) | `bifrost::backup::aggregate::AggregateConfig` |
| FB-04 | **Common (non-aggregated) backup** | Standard file-by-file copy, suitable for large-file datasets | `bifrost::frame::BackupJob` (common) |
| FB-05 | **Consistency backup mode** | Auto-snapshot volumes → backup from snapshot → delete snapshot; ensures point-in-time consistency | vpt-rs snapshot + bifrost scanner |
| FB-06 | **Real-time progress** | Per-file progress, throughput, ETA during scan and copy phases | bifrost stats → WebSocket event |
| FB-07 | **File restore** | Browse a backup copy → select files/directories → restore to original or new location | `bifrost::backup::RestoreTask` |
| FB-08 | **Restore policies** | Replace existing, skip existing, keep newer | `bifrost::backup::RestorePolicy` |
| FB-09 | **Failure reporting** | Structured error log per backup job, browsable in UI | `bifrost::failure::FailureRecorder` |
| FB-10 | **Path filters** | Include/exclude glob patterns configurable per asset (prune scope before scan) | `bifrost::scanner::ScanPathFilterSet` |

#### 4.1.4 Volume Backup (P0)

| ID | Feature | Description | Engine |
|----|---------|-------------|--------|
| VB-01 | **Backend detection** | Auto-detect available storage backends and their capabilities | `vpt-rs::BackendDescriptor::discover_all()` |
| VB-02 | **Volume listing** | List backup-eligible volumes with size, used, available, backend info | `vpt-rs::SnapshotProvider` |
| VB-03 | **Snapshot management** | Create, list, delete snapshots of a volume asset | `vpt-rs::SnapshotProvider` trait |
| VB-04 | **Volume backup (full)** | Export a volume/snapshot to an image file | `vpt-rs::BlockDeviceCopier::backup_volume` |
| VB-05 | **Volume backup (incremental)** | Incremental send for Btrfs/ZFS using parent snapshot | `vpt-rs` incremental send (-i flag) |
| VB-06 | **Volume restore** | Restore a volume from a backup image (with --force option) | `vpt-rs::RestorePlanner::restore_volume` |
| VB-07 | **Snapshot mount+browse** | Mount a snapshot read-only for file-level browsing and extraction | `vpt-rs::MountManager` |
| VB-08 | **Auto-snapshot policy** | Auto-create temporary snapshot before backup, auto-delete after | `vpt-rs::SnapshotPolicy::Temporary` |
| VB-09 | **Operation progress** | Data-written / total-size progress for dd/btrfs send/zfs send | Subprocess pipe monitoring |

#### 4.1.5 NAS Share Backup (P0)

| ID | Feature | Description | Engine |
|----|---------|-------------|--------|
| NS-01 | **NFS export backup** | Scan and back up an NFSv3 export using bifrost NFS transport | `bifrost::nfs` (feature-gated) |
| NS-02 | **SMB share backup** | Scan and back up an SMB share using bifrost SMB transport | `bifrost::smb` (feature-gated) |
| NS-03 | **Credential management** | Store NFS/SMB credentials encrypted in agent DB; test connection before save | Agent credential store |
| NS-04 | **NAS connectivity health** | Periodic reachability check; alert if NAS is unreachable before scheduled backup | Agent health checker |

#### 4.1.6 Desktop Client (P0)

| ID | Feature | Description |
|----|---------|-------------|
| DC-01 | **Dashboard** | Overview: all assets with status badges, recent job history, next scheduled jobs, storage usage summary |
| DC-02 | **Asset configuration UI** | Wizard for creating each asset kind; forms for SLA policy editing |
| DC-03 | **Job monitor** | Live progress of running jobs; job history with filtering by asset, status, date range |
| DC-04 | **Restore wizard** | Browse backup copies → select files → choose destination and conflict policy → restore |
| DC-05 | **Snapshot browser** | For volume assets: list snapshots, mount one, browse contents in file tree |
| DC-06 | **Copy browser** | For fileset/NAS assets: browse backup copy file trees, preview file metadata |
| DC-07 | **Agent connection manager** | Add/remove agent URLs, connection status indicator, reconnect handling |
| DC-08 | **Notifications** | Desktop notifications for job completion, failure, permission required |
| DC-09 | **Dark mode** | Follow system preference or manual toggle |

#### 4.1.7 Agent Daemon (P0)

| ID | Feature | Description |
|----|---------|-------------|
| AD-01 | **HTTP REST API** | Full CRUD for assets, SLA policies, jobs; job control (start/cancel) |
| AD-02 | **WebSocket events** | Streaming progress, status changes, log lines, health alerts |
| AD-03 | **Job scheduler** | Cron-based scheduling; persists schedule state across restarts |
| AD-04 | **Job executor** | Async job queue; enforces memory/concurrency limits from SLA |
| AD-05 | **Retention engine** | Post-backup hook that evaluates retention policy and prunes expired copies |
| AD-06 | **systemd integration** | Ship with `.service` file; log to journald; notify on ready/stopping |
| AD-07 | **Auth middleware** | Bearer token validation on all endpoints; token generated on first run |
| AD-08 | **Privilege escalation** | Detect operations requiring root; invoke `pkexec` for scoped elevation; audit log |
| AD-09 | **Agent health endpoint** | `GET /api/v1/health` returning version, uptime, queue depth, DB status |

### 4.2 Post-MVP (Phase 2+)

| ID | Feature | Description | Phase |
|----|---------|-------------|-------|
| CF-01 | **macOS desktop client** | Tauri build for macOS; connect to local or remote Linux agent | Phase 2 |
| CF-02 | **macOS agent (limited)** | Agent on macOS: file backup + APFS snapshot stubs | Phase 2 |
| CF-03 | **Windows desktop client** | Tauri build for Windows; connect to local or remote Linux agent | Phase 3 |
| CF-04 | **Windows agent (limited)** | Agent on Windows: file backup + VSS stubs | Phase 3 |
| CF-05 | **Encryption at rest** | AES-256-GCM encryption of backup data | Phase 2 |
| CF-06 | **Compression** | Zstd/LZ4 compression of backup data | Phase 2 |
| CF-07 | **Cloud target** | S3-compatible / Backblaze B2 / GCS as backup copy destination | Phase 3 |
| CF-08 | **Multi-agent management** | One desktop client managing multiple agents across the network | Phase 2 |
| CF-09 | **Backup copy comparison** | Side-by-side diff of two backup copies of the same asset | Phase 2 |
| CF-10 | **Storage health scrub** | Periodic checksum verification of backup copies; detect bitrot | Phase 3 |
| CF-11 | **i18n** | English + Chinese (Simplified) locales; i18n framework | Phase 2 |
| CF-12 | **`.deb` / `.rpm` packaging** | Native packages for Debian/Ubuntu and Fedora/RHEL | Phase 2 |
| CF-13 | **MSI installer** | Native Windows installer | Phase 3 |
| CF-14 | **DMG packaging** | Native macOS disk image | Phase 2 |

---

## 5. User Experience

### 5.1 Core UX Flows

#### Flow 1: Create a Protected Asset and Run First Backup

```
Dashboard → [+ Add Asset]
  → Choose asset kind: Fileset | Volume | NAS Share
  → Fileset flow:
      - Select directories (file picker, multi-select)
      - Optionally enable consistency mode
      - If consistency mode: agent checks if paths are on snapshot-capable volumes
  → Volume flow:
      - Agent auto-detects backends → show eligible volumes with metadata
      - Select volume → confirm
  → NAS Share flow:
      - Enter URL (nfs://host/export or smb://host/share/path)
      - Enter credentials (uid/gid for NFS, username/password/domain for SMB)
      - [Test Connection]
  → Configure SLA:
      - Choose preset or custom: copy mode, schedule, retention, advanced params
  → Review → [Create & Run First Backup]
  → Live progress monitor → Completion notification
```

#### Flow 2: Restore Files from a Backup Copy

```
Dashboard → [Restore] → Select asset → Select backup copy from history
  → Browse file tree of backup copy
  → Check files/directories to restore
  → Select destination: Original location | New location
  → Choose conflict policy: Replace | Skip | Keep newer
  → [Start Restore] → Progress → Completion notification
```

#### Flow 3: Browse a Volume Snapshot

```
Assets → Volume asset → [Snapshots] → Select snapshot → [Mount]
  → Snapshot mounted at agent-managed temp path
  → File browser showing mounted contents
  → User can select files to extract/copy out
  → [Unmount] cleans up
```

### 5.2 Navigation Structure

```
┌─────────────────────────────────────────────┐
│  Sidebar                                      │
│  ┌─────────────────┐                         │
│  │ 🏠 Dashboard     │                         │
│  │ 📦 Assets        │  ← Protected Assets     │
│  │ 📋 Job History   │                         │
│  │ 🔄 Restore       │                         │
│  │ ⚙️ Settings       │  ← Agent conn, prefs    │
│  │ 🔌 Agents        │  ← Connection manager   │
│  └─────────────────┘                         │
│                              Main Content Area│
└─────────────────────────────────────────────┘
```

### 5.3 Non-Functional UX Requirements

- **First-run wizard**: On first launch, prompt to connect to a local agent (auto-detect `bifrost-agentd` on localhost) or enter a remote agent URL. Then guide through creating the first Protected Asset.
- **Offline resilience**: Desktop client handles agent disconnection gracefully (reconnect with backoff, clear status indicator). Agent continues scheduled jobs independently.
- **Responsive**: All heavy work is on the agent; desktop client stays responsive with async HTTP calls and WebSocket events.
- **Graceful error states**: Permission errors show specific resolution steps ("Agent needs root for LVM snapshot — run `sudo pkexec bifrost-agentd` or add agent user to `lvm` group"). NAS unreachable shows last-known-good timestamp and troubleshooting link.
- **i18n-ready**: All user-facing strings externalized; English only for MVP.

---

## 6. Data Model (Agent Database)

### 6.1 Entity Relationships

```
ProtectedAsset (1) ────── (1) SLAPolicy
       │
       │ (1)
       │
       ├── (N) BackupCopy
       │
       └── (N) JobExecution
```

### 6.2 Schema

```sql
-- Protected assets: what to back up
CREATE TABLE protected_assets (
    id              TEXT PRIMARY KEY,       -- UUID
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL,          -- 'fileset' | 'volume' | 'nas_share'
    config_json     TEXT NOT NULL,          -- Kind-specific config (paths, volume ref, NAS URL + creds)
    sla_policy_id   TEXT NOT NULL REFERENCES sla_policies(id),
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- SLA policies: how and when to back up
CREATE TABLE sla_policies (
    id              TEXT PRIMARY KEY,       -- UUID
    name            TEXT NOT NULL,
    copy_mode       TEXT NOT NULL,          -- 'common' | 'aggregate'
    backup_type     TEXT NOT NULL,          -- 'full' | 'full_incremental'
    schedule_cron   TEXT NOT NULL,          -- Standard 5-field cron
    block_size      INTEGER NOT NULL,       -- I/O buffer size in bytes
    subtask_count   INTEGER NOT NULL,       -- Concurrent worker count
    memory_limit_mb INTEGER NOT NULL,       -- Soft memory cap in MB
    retention_kind  TEXT NOT NULL,          -- 'by_count' | 'by_age_days' | 'by_storage_gb'
    retention_value INTEGER NOT NULL,       -- e.g., 7 (copies), 30 (days), 500 (GB)
    aggregate_config_json TEXT,             -- Optional: aggregate-specific settings (blob size, file threshold, shard count)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Every execution of a backup/restore job
CREATE TABLE job_executions (
    id              TEXT PRIMARY KEY,       -- UUID
    asset_id        TEXT NOT NULL REFERENCES protected_assets(id),
    sla_policy_id   TEXT REFERENCES sla_policies(id),  -- Snapshot of SLA at execution time
    operation       TEXT NOT NULL,          -- 'backup' | 'restore' | 'snapshot'
    status          TEXT NOT NULL,          -- 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    copy_uuid       TEXT,                   -- bifrost copy UUID (for file/NAS backups)
    backup_copy_id  TEXT REFERENCES backup_copies(id),
    size_bytes      INTEGER,
    file_count      INTEGER,
    error_count     INTEGER,
    started_at      TEXT,
    ended_at        TEXT,
    log_path        TEXT,                   -- Path to execution log file
    failure_log_path TEXT                  -- Path to structured failure log
);

-- Backup copies produced by job executions
CREATE TABLE backup_copies (
    id              TEXT PRIMARY KEY,       -- UUID
    asset_id        TEXT NOT NULL REFERENCES protected_assets(id),
    job_id          TEXT NOT NULL REFERENCES job_executions(id),
    kind            TEXT NOT NULL,          -- 'file_full' | 'file_inc' | 'volume_full' | 'volume_inc'
    copy_uuid       TEXT,                   -- bifrost copy UUID (file/NAS copies)
    parent_copy_id  TEXT REFERENCES backup_copies(id),  -- For incremental copies
    size_bytes      INTEGER,
    file_count      INTEGER,
    manifest_path   TEXT,                   -- Path to bifrost manifest.json, or volume backup metadata
    data_path       TEXT,                   -- Path to D_REPO or volume image file
    expires_at      TEXT,                   -- Computed from SLA retention policy
    status          TEXT NOT NULL,          -- 'active' | 'expired' | 'pruned'
    created_at      TEXT NOT NULL
);

-- NAS share credentials (stored encrypted, referenced by asset config_json)
CREATE TABLE credentials (
    id              TEXT PRIMARY KEY,
    asset_id        TEXT NOT NULL REFERENCES protected_assets(id),
    kind            TEXT NOT NULL,          -- 'nfs' | 'smb'
    data_json       TEXT NOT NULL,          -- Encrypted credential payload
    created_at      TEXT NOT NULL
);

-- Agent configuration (key-value)
CREATE TABLE agent_config (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

-- Retention pruning log (audit trail)
CREATE TABLE retention_log (
    id              TEXT PRIMARY KEY,
    asset_id        TEXT NOT NULL REFERENCES protected_assets(id),
    copy_id         TEXT NOT NULL REFERENCES backup_copies(id),
    reason          TEXT NOT NULL,          -- e.g., 'by_count: kept 7, pruned 2'
    pruned_at       TEXT NOT NULL
);
```

### 6.3 Filesystem Layout

```
Agent data directory (/var/lib/bifrost-agent/ or configurable):
├── bifrost.db                    # SQLite application database
├── agent.key                     # Shared secret for client auth (generated on first run)
├── logs/
│   ├── agentd.log                # Agent daemon log
│   └── jobs/                     # Per-job execution logs
├── copy_repos/                   # Default parent for bifrost copy repositories
│   └── <copy_uuid>/              #   manifest.json, D_REPO/, M_REPO/, C_REPO/
├── volume_backups/               # Default parent for volume backup image files
│   └── <asset_id>/
│       └── <timestamp>.img
└── mounts/                       # Temp mount points for snapshot browsing
    └── <mount_id>/

Desktop client config directory (~/.config/bifrost-desktop/):
├── settings.json                 # Theme, window geometry, agent connection list
└── logs/
    └── desktop.log
```

---

## 7. RPC API (Agent ↔ Desktop)

### 7.1 Protocol

- **Transport**: HTTP/1.1 + JSON
- **Auth**: `Authorization: Bearer <token>` header on all requests
- **Base path**: `/api/v1`
- **Streaming**: WebSocket at `/ws/events` for progress, status changes, and alerts

### 7.2 REST Endpoints

#### Assets

```
GET    /api/v1/assets                    List all protected assets
POST   /api/v1/assets                    Create a new protected asset
GET    /api/v1/assets/:id                Get asset detail (includes current status)
PUT    /api/v1/assets/:id                Update asset configuration
DELETE /api/v1/assets/:id                Delete asset (query: ?keep_copies=true)
POST   /api/v1/assets/:id/test          Test asset connectivity (NAS check, volume access)
```

#### SLA Policies

```
GET    /api/v1/sla-policies             List all SLA policies
POST   /api/v1/sla-policies             Create a new SLA policy
GET    /api/v1/sla-policies/:id         Get policy detail
PUT    /api/v1/sla-policies/:id         Update policy
DELETE /api/v1/sla-policies/:id         Delete policy (fails if still referenced by assets)
GET    /api/v1/sla-policies/:id/preview  Preview next 5 scheduled runs
```

#### Jobs

```
GET    /api/v1/jobs                      List jobs (query: ?asset_id=&status=&limit=&offset=)
GET    /api/v1/jobs/:id                  Get job detail (includes progress if running)
POST   /api/v1/jobs                      Start a new job (body: { asset_id, operation })
POST   /api/v1/jobs/:id/cancel          Cancel a running job
GET    /api/v1/jobs/:id/log             Get job execution log (query: ?tail=100)
```

#### Backup Copies

```
GET    /api/v1/backup-copies             List copies (query: ?asset_id=&status=)
GET    /api/v1/backup-copies/:id         Get copy detail
DELETE /api/v1/backup-copies/:id         Delete a specific copy (manual prune)
POST   /api/v1/backup-copies/:id/expire  Mark expired (retention engine will prune)
```

#### Browse

```
GET    /api/v1/browse/:copy_id           Browse root of a backup copy
GET    /api/v1/browse/:copy_id/:path     Browse a subdirectory in a backup copy

GET    /api/v1/snapshots/:snapshot_id/mount  Mount a volume snapshot
DELETE /api/v1/snapshots/:snapshot_id/mount  Unmount
GET    /api/v1/snapshots/mounts/:mount_id/:path  Browse a mounted snapshot
```

#### Restore

```
POST   /api/v1/restore                   Start a restore job
       Body: {
         asset_id, copy_id,
         entries: [{path, kind}],        // Selected files/dirs to restore
         destination: {kind: 'original' | 'new', path?},
         conflict_policy: 'replace' | 'skip' | 'keep_newer'
       }
```

#### Agent

```
GET    /api/v1/health                    Agent health/status
GET    /api/v1/agent/info                Version, capabilities, platform, backends
GET    /api/v1/agent/config              Get agent configuration
PUT    /api/v1/agent/config              Update agent configuration
```

### 7.3 WebSocket Events

Server → Client push events over `/ws/events`:

```json
// Job progress update (throttled, max 4Hz)
{
  "event": "job:progress",
  "job_id": "...",
  "phase": "copy",
  "percent": 67.5,
  "throughput_bytes_per_sec": 524288000,
  "eta_seconds": 42,
  "current_item": "/home/user/docs/report.pdf"
}

// Job status change
{
  "event": "job:status",
  "job_id": "...",
  "status": "completed",      // running | completed | failed | cancelled
  "error_message": null
}

// Job log line (real-time)
{
  "event": "job:log",
  "job_id": "...",
  "level": "WARN",
  "message": "Retry 2/5 for /home/user/large_file.dat: EIO",
  "timestamp": "2026-04-29T14:30:00Z"
}

// Asset health alert
{
  "event": "asset:health",
  "asset_id": "...",
  "status": "degraded",        // healthy | degraded | unavailable
  "message": "NAS share unreachable: connection timeout after 30s"
}
```

---

## 8. Development Phases

### Phase 1 — Linux MVP (Target: 10-14 weeks)

| Week | Deliverable |
|------|-------------|
| 1-2 | **Agent scaffolding**: axum HTTP server, SQLite schema + migrations, auth middleware, health endpoint, systemd service file |
| 3-4 | **Asset & SLA CRUD**: REST endpoints for assets and SLA policies; `FileBackupAdapter` wrapping bifrost APIs (full backup, no scheduling yet) |
| 5-6 | **Job runner**: async job queue, full backup execution for fileset assets, progress bridging to WebSocket, job history |
| 7-8 | **Desktop client scaffolding**: Tauri + React project, sidebar shell, agent connection manager, asset list UI, SLA policy form UI |
| 9-10 | **Volume + NAS integration**: `VolumeBackupAdapter` wrapping vpt-rs APIs, NAS share assets (NFS/SMB), consistency backup mode for fileset assets |
| 11 | **Scheduler + retention**: Cron engine in agent, schedule CRUD from desktop, retention policy evaluation and pruning |
| 12 | **Restore**: File restore endpoints + desktop restore wizard, volume restore, snapshot mount/browse |
| 13-14 | **Polish**: systemd integration, `pkexec` privilege escalation, desktop notifications, error states, AppImage + static binary packaging, integration testing |

### Phase 2 — macOS + Advanced Features (Target: 6-8 weeks)

- macOS build targets for both agent (limited) and desktop client
- Encryption and compression of backup data
- Multi-agent management in desktop client
- Backup copy comparison / diff view
- `.deb` / `.rpm` / DMG packaging
- i18n framework

### Phase 3 — Windows + Cloud (Target: 8-10 weeks)

- Windows build targets for both agent (limited, VSS) and desktop client
- Cloud storage targets (S3, B2, GCS)
- Storage health / checksum scrub
- MSI/NSIS installer for Windows

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Root privilege complexity** | Volume backup / consistency mode fail silently for unprivileged agents | Scoped `pkexec` integration; clear permission-error responses in API; agent health endpoint reports missing capabilities |
| **Agent ↔ desktop version skew** | Desktop client may talk to older/newer agent with incompatible API | API versioning in URL path (`/api/v1/`); agent reports version in `/health`; desktop warns on mismatch |
| **Large backup UX** | Scanning 10M+ files can take minutes; UI must not freeze | All I/O in agent on async Tokio runtime; progress events throttled to 4Hz; virtualized file tree in restore browser |
| **bifrost / vpt-rs API stability** | Both engines are v0.1.0; APIs may change | Adapter layer isolates agent from engine types; pin engine revisions in Cargo.toml; integration tests per adapter |
| **vpt-rs subprocess dependency** | Volume backup relies on system binaries (`btrfs`, `lvs`, `zfs`, `dd`); missing tools cause cryptic failures | Backend detection verifies tool availability upfront; `GET /api/v1/agent/info` reports available backends; desktop surfaces missing-tool guidance |
| **Cross-platform filesystem differences** | Path handling, permissions, xattrs vary across OS | bifrost already handles platform abstraction via `native/` module; vpt-rs uses `platform/` module |
| **Tauri ecosystem churn** | Tauri 2.x is still maturing | Pin Tauri minor version; use stable plugin APIs; desktop client is intentionally thin so migration cost is low |
| **Network reliability (remote agent)** | Desktop ↔ agent WebSocket may drop over WAN/VPN | Reconnect with exponential backoff in desktop client; agent persists all state independently; missed events replayed from job history on reconnect |
| **Security of remote agent connection** | Agent API exposed over network is an attack surface | Bearer token auth; TLS recommended for non-localhost deployments; agent binds to localhost by default (user must explicitly configure remote bind); rate limiting on auth failures |

---

## 10. Success Metrics

| Metric | Target (Phase 1) |
|--------|-------------------|
| Backup throughput (local SSD, fileset) | >= 500 MB/s for large files; >= 10,000 files/s for small files |
| Agent memory during backup (1M files) | < 512 MB RSS |
| Agent idle memory | < 50 MB RSS |
| Agent binary size (static) | < 30 MB stripped |
| Desktop client binary size (AppImage) | < 60 MB compressed |
| Desktop client memory (idle) | < 150 MB RSS |
| First-run to first backup | < 3 minutes |
| API response time (list assets, no active jobs) | < 50ms p95 |
| WebSocket event latency | < 200ms p95 |
| Supported Linux distributions | Ubuntu 22.04+, Fedora 40+, Arch, Debian 12+ |
| Test coverage (agent Rust code) | > 80% line coverage for adapter and application layers |

---

## 11. Open Questions

1. **Licensing model**: Open-source core (fileset backup + local agent) with premium features (volume backup, NAS backup, remote agent management, encryption)? Or fully open-source with enterprise support subscriptions?
2. **Credential encryption at rest**: How should the agent encrypt NAS credentials and bearer tokens in the database? OS keyring integration (`libsecret` on Linux, Keychain on macOS, DPAPI on Windows)? Or a master key derived from a user-provided passphrase?
3. **Consistency backup — multi-volume filesets**: If a fileset spans multiple volumes (e.g., `/home` on one Btrfs subvolume, `/var` on another), the agent must snapshot all involved volumes simultaneously. vpt-rs snapshots are per-backend; there's no cross-backend atomic snapshot. Should the agent serialize (snapshot A → snapshot B → backup both, slight time skew) or just document this limitation?
4. **Concurrent job execution**: Allow multiple backup jobs to run simultaneously? Both engines support parallelism, but system resource contention (I/O, CPU, memory) is a concern. Option: configurable max concurrent jobs in agent config.
5. **Telemetry**: Opt-in anonymous usage statistics and crash reports? Privacy implications with backup tooling are significant.
6. **vpt-rs re-architecture for desktop**: Currently vpt-rs shells out to system binaries (`btrfs`, `lvs`, `zfs`, `dd`). Should we invest in native Rust implementations (e.g., `libbtrfs` bindings, direct `liblvm2` FFI, `libzfs` C bindings) for richer progress reporting and better error handling? The subprocess approach works but gives coarse progress (pipe throughput vs. actual filesystem progress).
7. **Agent discovery**: Should the desktop client support auto-discovery of agents on the LAN (mDNS/Bonjour)? Or is manual URL entry sufficient for MVP?
8. **Agent database migrations**: What migration framework for the SQLite schema? `refinery` or `sqlx` migrations, or simple versioned SQL files executed at agent startup?
