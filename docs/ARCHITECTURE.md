# Bifrost Desktop — Architecture

## System Overview

Bifrost Desktop is a cross-platform backup application consisting of two components:

1. **`bifrost-agentd`** — Headless backup agent daemon (Rust, axum HTTP server)
2. **`bifrost-desktop`** — Tauri 2.x desktop GUI client (Rust backend + React/TypeScript frontend)

The agent is the single source of truth. It manages all backup assets, SLA policies, job scheduling, execution, and retention. The desktop client connects to the agent via HTTP REST API + WebSocket events.

### Engine Dependencies

- **bifrost** — File backup/restore engine with NFS/SMB transport, four-phase pipeline (scan→copy→hardlink→delete), aggregate mode
- **vpt-rs** — Volume backup/restore engine with Btrfs/LVM/ZFS backends, snapshot lifecycle, block-level copy

## Crate Structure

```
bifrost-desktop/
├── Cargo.toml              # Workspace root
├── crates/
│   └── agentd/             # bifrost-agentd binary crate
│       ├── Cargo.toml
│       ├── migrations/     # SQL migration files
│       ├── bifrost-agentd.service  # systemd unit file
│       └── src/
│           ├── main.rs     # Entry point: parse config, init DB, mount router
│           ├── config.rs   # AgentConfig (CLI args with env fallback)
│           ├── auth.rs     # Token generation/loading (ring rng, hex-encoded)
│           ├── lib.rs      # Public module declarations
│           ├── progress.rs # ProgressBus (broadcast::Sender<WsEvent>)
│           ├── privilege.rs # Root check via libc::geteuid
│           ├── retention.rs # RetentionEngine (count/days/size_gb policies)
│           ├── server/
│           │   ├── mod.rs      # Module declarations
│           │   ├── router.rs   # Router assembly, AppState
│           │   ├── auth.rs     # Bearer token middleware + AuthToken extractor
│           │   └── ws.rs       # WebSocket upgrade + event streaming
│           ├── api/
│           │   ├── mod.rs      # Module declarations
│           │   ├── types.rs    # Request/response DTOs, AssetConfig enum
│           │   ├── assets.rs   # Full CRUD + test endpoint
│           │   ├── slas.rs     # Full CRUD + schedule preview + reference check
│           │   ├── jobs.rs     # List, start, get, cancel
│           │   ├── copies.rs   # List by asset, get, delete, expire
│           │   ├── browse.rs   # Browse copy contents (stub)
│           │   ├── restore.rs  # Restore job submission + execution dispatch
│           │   └── agent.rs    # Health check + agent info (backend detection)
│           ├── db/
│           │   ├── mod.rs      # Database struct (Mutex<Connection>, WAL mode)
│           │   ├── migrations.rs # Bootstrap + versioned migration runner
│           │   ├── models.rs   # Row types: ProtectedAsset, SLAPolicy, etc.
│           │   ├── assets.rs   # CRUD queries
│           │   ├── slas.rs     # CRUD + is_referenced check
│           │   ├── jobs.rs     # CRUD + update_status with auto-ended_at
│           │   ├── copies.rs   # list_by_asset, get_by_id, update_status, delete
│           │   ├── creds.rs    # CRUD queries
│           │   └── retention_log.rs # Insert + list_by_asset for audit trail
│           ├── adapters/
│           │   ├── mod.rs      # Module declarations
│           │   ├── file.rs     # FileBackupAdapter: bifrost FileBackupJob wrapper
│           │   ├── volume.rs   # VolumeBackupAdapter: vpt-rs CurrentBackend wrapper
│           │   └── consistency.rs # ConsistencyAdapter: snapshot+mount+scan workflow
│           ├── runner/
│           │   ├── mod.rs      # Re-exports JobQueue
│           │   ├── queue.rs    # JobQueue: semaphore concurrency, cancel tokens
│           │   └── execute.rs  # Job dispatch: fileset/volume/NAS, all 3 operations
│           └── scheduler/
│               ├── mod.rs      # Module declarations
│               └── cron.rs     # CronScheduler: 60s tick, cron expression eval
├── desktop/
│   ├── package.json        # React 18, Vite 5, Tauri 2 API
│   ├── tsconfig.json       # TypeScript strict mode
│   ├── vite.config.ts      # Vite + React plugin
│   ├── index.html          # SPA shell
│   ├── src-tauri/          # Tauri 2.x Rust backend
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json # Window config, plugins, bundle settings
│   │   ├── build.rs
│   │   └── src/
│   │       ├── main.rs     # Entry point (windows_subsystem)
│   │       ├── lib.rs      # Tauri builder, 23 command handlers
│   │       ├── commands.rs # 23 Tauri command proxies to AgentClient
│   │       ├── settings.rs # JSON file persistence
│   │       ├── tray.rs     # System tray
│   │       └── agent_client/
│   │           ├── mod.rs      # AgentClient struct
│   │           ├── http.rs     # reqwest REST client with Bearer auth
│   │           ├── ws.rs       # tokio-tungstenite event stream
│   │           └── types.rs    # HealthResponse, JobResponse, etc.
│   └── src/                # React + TypeScript frontend
│       ├── main.tsx        # ReactDOM entry with BrowserRouter
│       ├── App.tsx         # Root: connect gate + route definitions
│       ├── api/
│       │   └── client.ts   # Typed Tauri invoke bridge (23 functions)
│       ├── components/
│       │   └── Layout.tsx  # Sidebar navigation + disconnect
│       ├── hooks/
│       │   └── useAgent.ts # Connection state hook
│       ├── pages/
│       │   ├── Connect.tsx      # Agent URL + token input
│       │   ├── Dashboard.tsx    # Health stats, assets, recent jobs
│       │   ├── Assets.tsx       # Asset grid with backup-now
│       │   ├── AssetDetail.tsx  # Full metadata, SLA, copies, delete
│       │   ├── Jobs.tsx         # Filterable job list with cancel
│       │   └── Settings.tsx     # Agent health + info panels
│       └── types/
│           └── index.ts   # Full TypeScript type definitions
├── docs/
│   ├── ARCHITECTURE.md     # This file
│   └── CHANGELOG.md        # Versioned change history
├── README.md               # Project overview + quick start
├── PRD.md                  # Product requirements document
├── PLAN.md                 # Implementation plan
├── bifrost -> ../bifrost   # Symlink to file backup engine
└── vpt-rs -> ../vpt-rs     # Symlink to volume backup engine
```

## Data Flow

### Backup Flow

```
Desktop GUI (React)
  └─ invoke("start_job", {assetId, operation:"backup"})
      └─ Tauri Command Handler (commands.rs)
          └─ AgentClient.post("/api/v1/jobs")
              └─ Agent API Handler (api/jobs.rs)
                  └─ JobQueue.submit(asset_id, "backup")
                      ├─ Insert job_executions row (status: pending)
                      ├─ Spawn tokio task
                      │   ├─ Acquire semaphore permit
                      │   ├─ execute_job()
                      │   │   ├─ Load asset + SLA from DB
                      │   │   ├─ Parse AssetConfig
                      │   │   └─ Dispatch by kind:
                      │   │       ├─ Fileset → FileBackupAdapter.run_backup()
                      │   │       │   └─ FileBackupJob::new(BackupJobConfig).run()
                      │   │       ├─ Fileset+consistency → ConsistencyAdapter
                      │   │       │   └─ open_copy_mount → FileBackupJob → close_copy_mount
                      │   │       ├─ Volume → VolumeBackupAdapter.run_backup()
                      │   │       │   └─ backend.backup_volume(BackupPlan)
                      │   │       └─ NasShare → DataLocation::from_url → FileBackupJob
                      │   ├─ Record BackupCopy in DB
                      │   └─ Update job status (completed/failed)
                      └─ ProgressBus events → WebSocket → Desktop
```

### Restore Flow

```
Desktop GUI
  └─ invoke("start_restore", {body})
      └─ API Handler (api/restore.rs)
          ├─ Insert job_executions row
          ├─ Spawn tokio task
          │   ├─ Load asset + copy from DB
          │   ├─ Dispatch by asset kind:
          │   │   ├─ Fileset → FileBackupAdapter.run_restore()
          │   │   └─ Volume → VolumeBackupAdapter.run_restore()
          │   └─ Update job status
          └─ ProgressBus events
```

### Scheduling Flow

```
CronScheduler.run() [background task]
  └─ Every 60s:
      ├─ Load all enabled assets + SLAs
      ├─ For each: parse schedule_cron
      ├─ Check if next fire ≤ now
      └─ If due: JobQueue.submit(asset_id, "backup")
```

### Retention Flow

```
RetentionEngine.evaluate_all()
  └─ For each enabled asset + SLA:
      ├─ Load active copies (sorted newest-first)
      ├─ Apply retention policy:
      │   ├─ count: keep N newest
      │   ├─ days: keep younger than N days
      │   └─ size_gb: keep up to N GB total
      ├─ Expire pruned copies (status → "expired")
      ├─ Delete data directories
      └─ Log to retention_log table
```

## Agent API

### Authentication

All endpoints except `/api/v1/health` require:
```
Authorization: Bearer <token>
```

The token is randomly generated on first run (32 random bytes via ring, hex-encoded) and stored in `{data_dir}/agent.key` with 0o600 permissions.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/health` | No | Health check (status, version, db_ok, queue_depth) |
| GET | `/api/v1/agent/info` | Yes | Agent version, platform, detected backends |
| GET/POST | `/api/v1/assets` | Yes | List all / create protected asset |
| GET/PUT/DELETE | `/api/v1/assets/:id` | Yes | Asset CRUD |
| POST | `/api/v1/assets/:id/test` | Yes | Test asset connectivity |
| GET/POST | `/api/v1/sla-policies` | Yes | List all / create SLA policy |
| GET/PUT/DELETE | `/api/v1/sla-policies/:id` | Yes | SLA policy CRUD (delete checks references) |
| GET | `/api/v1/sla-policies/:id/preview` | Yes | Schedule preview (next 5 runs) |
| GET/POST | `/api/v1/jobs` | Yes | List jobs (filterable) / start backup/restore |
| GET | `/api/v1/jobs/:id` | Yes | Single job detail |
| POST | `/api/v1/jobs/:id/cancel` | Yes | Cancel running job |
| GET | `/api/v1/backup-copies` | Yes | List backup copies (filter by asset_id) |
| GET/DELETE | `/api/v1/backup-copies/:id` | Yes | Copy detail / delete |
| POST | `/api/v1/backup-copies/:id/expire` | Yes | Manually expire a copy |
| POST | `/api/v1/restore` | Yes | Start restore job |
| GET | `/api/v1/browse/:copy_id` | Yes | Browse copy root directory |
| GET | [`/api/v1/browse/:copy_id/*path`](http://localhost:8700/api/v1/browse/:copy_id/*path) | Yes | Browse copy subdirectory |
| WS | `/ws/events` | No | WebSocket progress event stream |

### WebSocket Events

The WebSocket at `/ws/events` pushes JSON-encoded events:

- **`job:progress`** — `{ job_id, phase, percent, throughput_bytes_per_sec, eta_seconds, current_item }`
- **`job:status`** — `{ job_id, status, error_message? }`
- **`job:log`** — `{ job_id, level, message, timestamp }`
- **`asset:health`** — `{ asset_id, status, message }`

### Database Schema

SQLite at `{data_dir}/bifrost.db` with WAL mode and foreign keys enabled.

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `protected_assets` | Backup asset definitions | id, name, kind, config_json, sla_policy_id, enabled |
| `sla_policies` | Schedule and retention rules | id, copy_mode, backup_type, schedule_cron, retention_kind/value |
| `job_executions` | Execution history | id, asset_id, operation, status, size_bytes, file_count |
| `backup_copies` | Produced backup artifacts | id, asset_id, kind, copy_uuid, data_path, status |
| `credentials` | NAS auth (NFS/SMB) | id, asset_id, kind, data_json |
| `agent_config` | Key-value settings | key, value |
| `retention_log` | Pruning audit trail | id, asset_id, copy_id, reason, pruned_at |
| `schema_version` | Migration tracking | version |

## Key Design Decisions

1. **Blocking engine calls via spawn_blocking**: Both bifrost and vpt-rs are synchronous libraries. All engine operations run in `tokio::task::spawn_blocking` to avoid blocking the async runtime.

2. **SLA as first-class entity**: SLA policies are independent of assets (linked by foreign key), enabling reuse and bulk updates across asset groups.

3. **Bearer token auth**: Simple, stateless authentication using a single bearer token. The token is auto-generated on first run with cryptographically random bytes (ring crate) and stored with restrictive file permissions (0o600).

4. **Semaphore-based concurrency**: JobQueue uses an `Arc<Semaphore>` configured at startup to limit concurrent job execution, preventing resource exhaustion.

5. **Consistency backup orchestration**: Uses vpt-rs `open_copy_mount`/`close_copy_mount` for atomic snapshot+mount lifecycle with guaranteed cleanup, then runs bifrost file backup against the mounted snapshot.

6. **Transport abstraction via DataLocation**: NAS shares (NFS/SMB) use bifrost's `DataLocation` URL parsing, allowing the same backup pipeline to handle local and remote sources transparently.

7. **Migration-based schema evolution**: Bootstrap pattern checks `schema_version` table, compares against known migration versions, and applies only new migrations.

## Development

### Prerequisites

- Rust toolchain (nightly for vpt-rs, or set `rust-toolchain.toml`)
- Node.js 22+ and npm 10+ (for desktop frontend)
- Linux system libraries: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` (for Tauri on Linux)

### Build

```bash
# Agent daemon
cargo build -p bifrost-agentd
cargo test -p bifrost-agentd

# Desktop client
cd desktop
npm install
npx tsc --noEmit    # TypeScript check
npx vite build       # Production frontend bundle
cargo build -p bifrost-desktop  # Full Tauri app
```

### Run

```bash
# Start the agent
cargo run -p bifrost-agentd -- --data-dir /tmp/bifrost-agent-dev --log-level debug

# Start the desktop dev server
cd desktop && npm run dev
```

### API Test

```bash
# Health check (no auth)
curl http://localhost:8700/api/v1/health

# Get token
cat /tmp/bifrost-agent-dev/agent.key

# List assets (authenticated)
TOKEN=$(cat /tmp/bifrost-agent-dev/agent.key)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8700/api/v1/assets

# Create a fileset asset
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Home Backup",
    "kind":"fileset",
    "config":{
      "type":"fileset",
      "paths":["/home"],
      "consistency_mode":false,
      "exclude_patterns":[]
    },
    "sla_policy":{
      "name":"Daily",
      "copy_mode":"aggregate",
      "backup_type":"full",
      "schedule_cron":"0 3 * * *",
      "retention_kind":"count",
      "retention_value":7
    }
  }' http://localhost:8700/api/v1/assets

# Create a volume asset
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Data Volume",
    "kind":"volume",
    "config":{"type":"volume","backend":"lvm","volume_id":"/dev/vg0/data"},
    "sla_policy":{
      "name":"Weekly","copy_mode":"common","backup_type":"full",
      "schedule_cron":"0 2 * * 0","retention_kind":"count","retention_value":4
    }
  }' http://localhost:8700/api/v1/assets

# Start a backup job
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"asset_id":"<ASSET_ID>","operation":"backup"}' \
  http://localhost:8700/api/v1/jobs

# Monitor via WebSocket
websocat "ws://localhost:8700/ws/events"
```
