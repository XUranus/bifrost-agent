# Bifrost Desktop — Implementation Plan

**Status:** Draft  
**Version:** 0.1.0  
**Date:** 2026-04-29  

---

## 1. Project Structure

### 1.1 Repository Layout

```
bifrost-desktop/
├── Cargo.toml                  # Workspace manifest
├── Cargo.lock
├── PRD.md                      # Product requirements
├── PLAN.md                     # This file
│
├── bifrost -> ../bifrost       # Symlink: file backup engine (external crate)
├── vpt-rs -> ../vpt-rs         # Symlink: volume backup engine (external crate)
│
├── crates/
│   └── agentd/                 # bifrost-agentd: headless backup daemon
│       ├── Cargo.toml
│       ├── migrations/         # SQL migration files
│       │   ├── 001_initial.sql
│       │   └── 002_retention.sql
│       └── src/
│           ├── main.rs         # Entry point: parse CLI, start server
│           ├── lib.rs          # Re-exports for integration tests
│           ├── config.rs       # AgentConfig: paths, bind address, token path
│           ├── server/         # HTTP + WebSocket server
│           │   ├── mod.rs
│           │   ├── router.rs   # build_router() -> axum::Router
│           │   ├── auth.rs     # AuthLayer, token extraction
│           │   └── ws.rs       # WebSocket upgrade + event dispatch
│           ├── api/            # Route handlers (one module per resource)
│           │   ├── mod.rs
│           │   ├── types.rs    # Shared request/response JSON types
│           │   ├── assets.rs
│           │   ├── slas.rs
│           │   ├── jobs.rs
│           │   ├── copies.rs
│           │   ├── browse.rs
│           │   ├── restore.rs
│           │   └── agent.rs    # /health, /info, /config
│           ├── db/             # SQLite persistence layer
│           │   ├── mod.rs      # Database struct, connection pool
│           │   ├── migrations.rs
│           │   ├── models.rs   # Row types, FromRow impls
│           │   ├── assets.rs   # CRUD queries for protected_assets
│           │   ├── slas.rs     # CRUD queries for sla_policies
│           │   ├── jobs.rs     # CRUD queries for job_executions
│           │   ├── copies.rs   # CRUD queries for backup_copies
│           │   └── creds.rs    # Encrypted credential store
│           ├── adapters/       # Engine wrappers
│           │   ├── mod.rs
│           │   ├── file.rs     # FileBackupAdapter: bifrost Scanner + BackupTask
│           │   ├── volume.rs   # VolumeBackupAdapter: vpt-rs traits
│           │   └── consistency.rs  # Snapshot-then-scan orchestrator
│           ├── runner/         # Job execution
│           │   ├── mod.rs
│           │   ├── queue.rs    # JobQueue: submit, cancel, concurrency limit
│           │   └── execute.rs  # execute_job(): dispatch by asset kind
│           ├── scheduler/
│           │   ├── mod.rs
│           │   └── cron.rs     # CronScheduler: tick loop, match, submit
│           ├── retention.rs    # RetentionEngine: prune expired copies
│           ├── progress.rs     # ProgressBus: broadcast::channel wrapper
│           ├── auth.rs         # Token generation + persistent storage
│           └── privilege.rs    # check_elevation(), run_with_pkexec()
│
├── desktop/                    # bifrost-desktop: Tauri GUI client
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/                    # React + TypeScript frontend
│   │   ├── main.tsx            # React entry point
│   │   ├── App.tsx             # Router + layout shell
│   │   ├── api/                # HTTP + WebSocket client layer
│   │   │   ├── client.ts       # fetch wrapper with auth + base URL
│   │   │   ├── ws.ts           # WebSocket reconnect manager
│   │   │   └── endpoints/      # Typed API functions
│   │   │       ├── assets.ts
│   │   │       ├── slas.ts
│   │   │       ├── jobs.ts
│   │   │       ├── copies.ts
│   │   │       ├── browse.ts
│   │   │       ├── restore.ts
│   │   │       └── agent.ts
│   │   ├── stores/             # Zustand state stores
│   │   │   ├── agentStore.ts   # Agent URL, token, connection state
│   │   │   ├── assetStore.ts   # Assets + SLA policies cache
│   │   │   ├── jobStore.ts     # Running jobs, history, WS-driven updates
│   │   │   └── uiStore.ts      # Theme, sidebar, wizards
│   │   ├── pages/              # Route-level page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Assets.tsx
│   │   │   ├── AssetDetail.tsx
│   │   │   ├── JobHistory.tsx
│   │   │   ├── JobDetail.tsx
│   │   │   ├── RestoreWizard.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Agents.tsx
│   │   ├── components/         # Reusable UI components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── AppShell.tsx
│   │   │   │   └── ConnectionBadge.tsx
│   │   │   ├── assets/
│   │   │   │   ├── AssetCard.tsx
│   │   │   │   ├── CreateAssetDialog.tsx  # Wizard orchestrator
│   │   │   │   ├── FilesetForm.tsx
│   │   │   │   ├── VolumeForm.tsx
│   │   │   │   └── NasShareForm.tsx
│   │   │   ├── sla/
│   │   │   │   ├── SLAPolicyEditor.tsx
│   │   │   │   └── SLAPresets.tsx
│   │   │   ├── jobs/
│   │   │   │   ├── JobTable.tsx
│   │   │   │   ├── JobProgress.tsx    # Live progress bar + stats
│   │   │   │   └── JobLog.tsx         # Scrolling log viewer
│   │   │   ├── browse/
│   │   │   │   ├── CopyBrowser.tsx    # Browse copy file tree
│   │   │   │   └── SnapshotBrowser.tsx
│   │   │   └── shared/
│   │   │       ├── CronInput.tsx      # Visual cron expression builder
│   │   │       ├── PathSelector.tsx
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── ConfirmDialog.tsx
│   │   │       └── EmptyState.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts  # WS connect + event dispatch
│   │   │   ├── useAgent.ts      # Agent connection state + health
│   │   │   ├── useJobs.ts       # Job polling + WS merge
│   │   │   └── useNotification.ts
│   │   ├── types/
│   │   │   └── api.ts           # TypeScript types mirroring agent JSON DTOs
│   │   └── lib/
│   │       ├── constants.ts
│   │       └── format.ts        # Bytes, duration, date formatters
│   │
│   └── src-tauri/               # Tauri Rust backend
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── capabilities/
│       │   └── default.json
│       ├── icons/
│       └── src/
│           ├── main.rs          # Tauri entry point
│           ├── lib.rs           # Tauri plugin setup
│           ├── commands.rs      # All #[tauri::command] functions
│           ├── agent_client/
│           │   ├── mod.rs
│           │   ├── http.rs      # reqwest client with auth header
│           │   ├── ws.rs        # tokio-tungstenite WebSocket client
│           │   └── types.rs     # DTOs matching agent API responses
│           ├── settings.rs      # Local settings file read/write
│           └── tray.rs          # System tray setup
│
├── scripts/
│   ├── setup-dev.sh             # Create dev directories, init DB, generate token
│   ├── run-agent.sh             # Start agent for development
│   └── build-agent-static.sh   # Musl static build
│
└── packaging/
    ├── bifrost-agentd.service   # systemd unit file
    └── AppImage.yml             # AppImage builder config
```

### 1.2 Workspace Cargo.toml

```toml
[workspace]
members = [
    "crates/agentd",
    "desktop/src-tauri",
]
resolver = "2"

[workspace.dependencies]
# Common
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
thiserror = "2"
anyhow = "1"

# Agent-specific
axum = { version = "0.8", features = ["ws"] }
axum-extra = "0.10"
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace", "auth"] }
rusqlite = { version = "0.32", features = ["bundled", "vtab"] }
tokio-util = "0.7"
futures-util = "0.3"
cron = "0.15"
ring = "0.17"  # For token generation

# Desktop Tauri backend
tauri = "2"
tauri-plugin-shell = "2"
tauri-plugin-notification = "2"
tauri-plugin-dialog = "2"
reqwest = { version = "0.12", features = ["json", "websocket"] }
tokio-tungstenite = "0.24"

# Engines (path dependencies via symlinks)
bifrost = { path = "../bifrost", features = ["nfs", "smb"] }
vpt-rs = { path = "../vpt-rs" }
```

### 1.3 Crate Dependency Graph

```
agentd
  ├── bifrost (file backup engine)
  ├── vpt-rs (volume backup engine)
  ├── axum (HTTP server)
  ├── rusqlite (persistence)
  ├── cron (schedule parsing)
  └── ring (token generation)

desktop/src-tauri
  ├── tauri (desktop framework)
  ├── reqwest (HTTP to agent)
  └── tokio-tungstenite (WS to agent)
  └── (does NOT depend on bifrost or vpt-rs)
```

---

## 2. Agent Internal Design

### 2.1 Module Responsibilities

#### `config.rs` — AgentConfig

```rust
pub struct AgentConfig {
    pub data_dir: PathBuf,          // /var/lib/bifrost-agent
    pub bind_host: String,          // "127.0.0.1"
    pub bind_port: u16,             // 8787
    pub db_path: PathBuf,           // {data_dir}/bifrost.db
    pub token_path: PathBuf,        // {data_dir}/agent.key
    pub copy_repos_dir: PathBuf,    // {data_dir}/copy_repos
    pub volume_backups_dir: PathBuf,// {data_dir}/volume_backups
    pub mounts_dir: PathBuf,        // {data_dir}/mounts
    pub max_concurrent_jobs: usize, // 2
    pub log_level: String,          // "info"
}
```

Sources (priority order):
1. Command-line flags (`--data-dir`, `--bind`, `--port`)
2. Environment variables (`BIFROST_AGENT_DATA_DIR`, etc.)
3. Defaults

#### `db/mod.rs` — Database

```rust
pub struct Database {
    conn: Connection,  // rusqlite, wrapped in Mutex<Option<Connection>> for axum
}

impl Database {
    pub fn open(path: &Path) -> Result<Self>;
    pub fn run_migrations(&self) -> Result<()>;
    pub fn conn(&self) -> &Mutex<Connection>;
}
```

Migration strategy:
- `schema_version` table with a single integer row
- `migrations/` directory with numbered `.sql` files
- On startup: read current version, apply any higher-numbered migrations in a transaction
- Each migration file: `BEGIN; ...sql... ; UPDATE schema_version SET version = N; COMMIT;`

#### `progress.rs` — ProgressBus

Wraps `tokio::sync::broadcast`. All running jobs push here; the WebSocket handler fans out to connected clients.

```rust
pub struct ProgressBus {
    tx: broadcast::Sender<WsEvent>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum WsEvent {
    JobProgress { job_id: Uuid, phase: String, percent: f64,
                  throughput_bytes_per_sec: u64, eta_seconds: i64,
                  current_item: String },
    JobStatus { job_id: Uuid, status: JobStatus, error_message: Option<String> },
    JobLog { job_id: Uuid, level: String, message: String, timestamp: DateTime<Utc> },
    AssetHealth { asset_id: Uuid, status: HealthStatus, message: String },
}
```

#### `runner/queue.rs` — JobQueue

Manages concurrent job execution with a semaphore. Jobs are submitted via API and executed asynchronously.

```rust
pub struct JobQueue {
    db: Arc<Database>,
    progress: Arc<ProgressBus>,
    semaphore: Arc<Semaphore>,
    active: Arc<DashMap<Uuid, CancellationToken>>,
}

impl JobQueue {
    pub fn new(db: Arc<Database>, progress: Arc<ProgressBus>, max_concurrent: usize) -> Self;

    /// Insert a pending job row, spawn a background task, return job ID immediately.
    pub async fn submit(&self, asset_id: Uuid, operation: Operation) -> Result<Uuid>;

    /// Signal cancellation to a running job. The job checks the token periodically.
    pub async fn cancel(&self, job_id: Uuid) -> Result<()>;
}
```

#### `runner/execute.rs` — Job executor

The core dispatch function called by the queue:

```rust
pub async fn execute_job(
    db: Arc<Database>,
    progress: Arc<ProgressBus>,
    adapters: Arc<Adapters>,
    job_id: Uuid,
    cancel: CancellationToken,
) {
    // 1. Load job + asset + SLA from DB
    // 2. Update job status -> "running", push JobStatus event
    // 3. Match asset.kind:
    //    - "fileset" | "nas_share" -> file_adapter.run_backup(...)
    //    - "volume" -> volume_adapter.run_backup(...)
    // 4. On completion: create backup_copy row, update job row
    // 5. On error: update job status -> "failed", log error
    // 6. Trigger retention engine for this asset
}
```

#### `adapters/file.rs` — FileBackupAdapter

Translates `SLAPolicy` params into `bifrost::backup::BackupOption`:

| SLA Param | bifrost Mapping |
|-----------|----------------|
| `copy_mode = "aggregate"` | `BackupOption.aggregate = Some(AggregateConfig { max_blob_size, file_threshold, shard_count, layout: Shard })` |
| `copy_mode = "common"` | `BackupOption.aggregate = None` |
| `block_size` | `BackupOption.buffer_size` |
| `subtask_count` | `BackupOption.worker_count` |
| `memory_limit_mb` | SpillQueue threshold (via environment or config) |
| `backup_type = "full"` | `copy_type: Full` |
| `backup_type = "full_incremental"` | `copy_type: Inc`, base copy from `backup_copies.parent_copy_id` |

Progress bridging: bifrost's `RunningScan` and `RunningBackup` expose stats snapshots. The adapter polls these at ~250ms intervals and pushes `JobProgress` events to the bus.

#### `adapters/volume.rs` — VolumeBackupAdapter

Wraps vpt-rs trait implementations. Dispatches to the correct `LinuxBackend` variant (Btrfs/Lvm/Zfs) based on the volume asset's backend metadata.

Progress: vpt-rs runs subprocesses (`dd`, `btrfs send`, `zfs send`). The adapter monitors the output file size or pipe throughput and estimates progress from the total volume size.

#### `adapters/consistency.rs` — Consistency mode

```rust
/// Orchestrates vpt-rs snapshot + bifrost file backup.
/// Used when a fileset asset enables consistency mode.
pub async fn run_consistency_backup(
    asset: &ProtectedAsset,
    sla: &SLAPolicy,
    volume_adapter: &VolumeBackupAdapter,
    file_adapter: &FileBackupAdapter,
    progress: &ProgressBus,
) -> Result<BackupResult> {
    // 1. For each path in the fileset, determine the owning volume
    //    (use vpt-rs backend detection: which backend owns /home/user?)
    // 2. Group paths by volume — take one snapshot per unique volume
    // 3. Mount each snapshot to a temp path
    // 4. Build a path map: original_path -> mount_path
    // 5. Translate fileset paths to mount paths, run file_adapter on mounts
    // 6. On completion OR error: unmount and delete all snapshots
}
```

#### `scheduler/cron.rs` — CronScheduler

```rust
pub struct CronScheduler {
    db: Arc<Database>,
    queue: Arc<JobQueue>,
}

impl CronScheduler {
    /// Runs forever, wakes every 60 seconds.
    pub async fn run(&self, shutdown: CancellationToken) {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            tokio::select! {
                _ = interval.tick() => self.tick().await,
                _ = shutdown.cancelled() => return,
            }
        }
    }

    async fn tick(&self) {
        // 1. Query enabled assets with non-null schedule_cron
        // 2. For each: parse cron expression, check if we're within 60s of next fire
        // 3. If due: submit backup job to queue
        // 4. Update last_run_at in sla_policies (via backup_history)
    }
}
```

Cron matching: use the `cron` crate's `Schedule::includes()` or `Schedule::upcoming()` to determine if a schedule fires within the current tick window.

#### `retention.rs` — RetentionEngine

```rust
pub struct RetentionEngine {
    db: Arc<Database>,
}

impl RetentionEngine {
    /// Evaluate retention policy for an asset's backup copies.
    /// Called after every backup completes and on agent startup.
    pub async fn evaluate(&self, asset_id: Uuid) -> Result<Vec<Uuid /* pruned copy IDs */>> {
        // 1. Load SLA policy for asset
        // 2. Query active backup copies for asset, ordered by created_at DESC
        // 3. Match retention_kind:
        //    - "by_count": keep the N most recent, prune rest
        //    - "by_age_days": compute cutoff timestamp, prune older
        //    - "by_storage_gb": accumulate size from newest, prune when total exceeds limit
        // 4. For each pruned copy:
        //    - Delete files (D_REPO dir or volume image file)
        //    - Update backup_copies.status -> "pruned"
        //    - Insert retention_log row
        // 5. Return list of pruned copy IDs
    }
}
```

#### `auth.rs`

```rust
/// Generate a cryptographically random 32-byte token, store in agent.key.
/// Called on first run if agent.key doesn't exist.
pub fn initialize_token(token_path: &Path) -> Result<String>;

/// Load token from agent.key for comparison in auth middleware.
pub fn load_token(token_path: &Path) -> Result<String>;
```

#### `server/auth.rs` — Auth middleware

```rust
/// Tower layer that extracts Bearer token from Authorization header,
/// compares to stored token, returns 401 on mismatch.
/// Skips auth for /api/v1/health (unauthenticated).
pub fn auth_layer(token: Arc<str>) -> AuthLayer;
```

#### `server/router.rs`

```rust
pub fn build_router(
    db: Arc<Database>,
    progress: Arc<ProgressBus>,
    queue: Arc<JobQueue>,
    adapters: Arc<Adapters>,
    token: Arc<str>,
) -> Router {
    let api = Router::new()
        .nest("/assets", api::assets::router())
        .nest("/sla-policies", api::slas::router())
        .nest("/jobs", api::jobs::router())
        .nest("/backup-copies", api::copies::router())
        .nest("/browse", api::browse::router())
        .nest("/restore", api::restore::router())
        .nest("/agent", api::agent::router())
        .with_state(AppState { db, progress, queue, adapters });

    Router::new()
        .route("/api/v1/health", get(api::agent::health))
        .nest("/api/v1", api)
        .route("/ws/events", get(server::ws::upgrade))
        .layer(auth_layer(token))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}
```

### 2.2 Key Type Definitions

```rust
// --- Asset configs (stored as JSON in protected_assets.config_json) ---

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssetConfig {
    Fileset {
        paths: Vec<PathBuf>,
        consistency_mode: bool,
        exclude_patterns: Vec<String>,     // glob patterns
    },
    Volume {
        backend: String,                    // "linux-btrfs" | "linux-lvm" | "linux-zfs"
        volume_id: String,                  // "/dev/vg0/data" | "tank/data" | subvolume path
    },
    NasShare {
        url: String,                        // "nfs://host/export" or "smb://host/share/path"
        credential_id: Option<Uuid>,        // FK to credentials table
    },
}

// --- SLA aggregate config (optional, stored as JSON) ---

#[derive(Serialize, Deserialize)]
pub struct AggregateConfigJson {
    pub max_blob_size: u64,         // default 64 MiB
    pub file_threshold: u64,        // files smaller than this get aggregated
    pub shard_count: u32,           // number of shard buckets for SHARD layout
}

// --- API request/response types (examples) ---

#[derive(Deserialize)]
pub struct CreateAssetRequest {
    pub name: String,
    pub kind: AssetKind,            // "fileset" | "volume" | "nas_share"
    pub config: AssetConfig,
    pub sla_policy: CreateSLAPolicyRequest,  // Inline SLA creation
}

#[derive(Serialize)]
pub struct AssetResponse {
    pub id: Uuid,
    pub name: String,
    pub kind: AssetKind,
    pub config: AssetConfig,
    pub sla_policy: SLAPolicyResponse,
    pub enabled: bool,
    pub health: HealthStatus,       // derived: checks path existence, backend availability
    pub last_backup: Option<BackupCopySummary>,
    pub next_backup: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct StartJobRequest {
    pub asset_id: Uuid,
    pub operation: Operation,       // "backup" | "restore" | "snapshot"
}

#[derive(Serialize)]
pub struct JobResponse {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub operation: Operation,
    pub status: JobStatus,          // "pending" | "running" | "completed" | "failed" | "cancelled"
    pub progress: Option<JobProgress>,
    pub size_bytes: Option<u64>,
    pub error_count: Option<u32>,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct JobProgress {
    pub phase: String,              // "scan" | "copy" | "hardlink" | "delete" | "mtime" | "send"
    pub percent: f64,
    pub throughput_bytes_per_sec: u64,
    pub eta_seconds: i64,
    pub current_item: String,
}

#[derive(Deserialize)]
pub struct RestoreRequest {
    pub asset_id: Uuid,
    pub copy_id: Uuid,
    pub entries: Vec<RestoreEntry>, // Files/dirs to restore
    pub destination: RestoreDestination,
    pub conflict_policy: ConflictPolicy,
}

#[derive(Serialize, Deserialize)]
pub struct RestoreEntry {
    pub path: String,
    pub kind: EntryKind,            // "file" | "directory"
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum RestoreDestination {
    Original,
    New { path: PathBuf },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictPolicy {
    Replace,
    Skip,
    KeepNewer,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    pub size: u64,
    pub modified: DateTime<Utc>,
    pub mode: u32,
}
```

---

## 3. Desktop Client Internal Design

### 3.1 Tauri Commands (src-tauri/src/commands.rs)

Every command follows the same pattern: validate the agent connection, forward the request, return the response or error string.

```rust
#[tauri::command]
async fn agent_list_assets(state: State<'_, AppState>) -> Result<Vec<AssetResponse>, String> {
    let client = state.agent_client().map_err(|e| e.to_string())?;
    client.get("/api/v1/assets").await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_create_asset(
    state: State<'_, AppState>,
    body: CreateAssetRequest,
) -> Result<AssetResponse, String> {
    let client = state.agent_client().map_err(|e| e.to_string())?;
    client.post("/api/v1/assets", &body).await.map_err(|e| e.to_string())
}

// ... one command per API endpoint
```

### 3.2 Agent Client (src-tauri/src/agent_client/http.rs)

```rust
pub struct AgentClient {
    base_url: String,
    token: String,
    client: reqwest::Client,
}

impl AgentClient {
    pub fn new(base_url: String, token: String) -> Self;

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T>;
    pub async fn post<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T>;
    pub async fn put<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T>;
    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<T>;
}
```

All methods add `Authorization: Bearer <token>` header and prepend `base_url`.

### 3.3 WebSocket Client (src-tauri/src/agent_client/ws.rs)

Connects to `ws://<agent>/ws/events?token=<token>`. Emits Tauri events to the frontend for each incoming message:

```rust
pub async fn connect_ws(
    agent_url: &str,
    token: &str,
    app_handle: tauri::AppHandle,
) -> Result<()> {
    // Connect to ws://host:port/ws/events
    // For each incoming WsEvent JSON frame:
    //   app_handle.emit("ws:event", &event)?;
    // On disconnect: exponential backoff reconnect, emit "ws:disconnected"
}
```

### 3.4 Frontend State Architecture

Three Zustand stores:

```typescript
// agentStore.ts
interface AgentState {
    agents: AgentConnection[];      // List of known agents
    activeAgentId: string | null;   // Currently connected agent
    connectionStatus: 'connected' | 'connecting' | 'disconnected';
    connect: (url: string, token: string) => Promise<void>;
    disconnect: () => void;
}

// assetStore.ts
interface AssetState {
    assets: Asset[];                // Cached from GET /api/v1/assets
    selectedAssetId: string | null;
    fetchAssets: () => Promise<void>;
    createAsset: (req: CreateAssetRequest) => Promise<void>;
    deleteAsset: (id: string) => Promise<void>;
}

// jobStore.ts
interface JobState {
    runningJobs: Map<string, Job>;      // Updated via WS events
    historyJobs: Job[];                 // From GET /api/v1/jobs
    subscribe: () => void;              // Listen for Tauri ws:event
    fetchHistory: (filter?: JobFilter) => Promise<void>;
    startJob: (assetId: string, op: Operation) => Promise<void>;
    cancelJob: (jobId: string) => Promise<void>;
}
```

### 3.5 Frontend Routes

| Route | Page | Content |
|-------|------|---------|
| `/` | Dashboard | Status overview, recent jobs, storage stats |
| `/assets` | Assets | Asset list + create button |
| `/assets/:id` | AssetDetail | Asset info, SLA config, backup history, actions |
| `/jobs` | JobHistory | Filterable job list |
| `/jobs/:id` | JobDetail | Job progress/log, result summary |
| `/restore` | RestoreWizard | Step-by-step restore flow |
| `/settings` | Settings | Theme, agent connections, preferences |
| `/agents` | Agents | Add/remove/test agent connections |

---

## 4. Database Migrations

### `migrations/001_initial.sql`

```sql
CREATE TABLE schema_version (version INTEGER NOT NULL);
INSERT INTO schema_version VALUES (1);

CREATE TABLE protected_assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('fileset', 'volume', 'nas_share')),
    config_json TEXT NOT NULL,
    sla_policy_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sla_policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    copy_mode TEXT NOT NULL CHECK(copy_mode IN ('common', 'aggregate')),
    backup_type TEXT NOT NULL CHECK(backup_type IN ('full', 'full_incremental')),
    schedule_cron TEXT NOT NULL,
    block_size INTEGER NOT NULL DEFAULT 1048576,
    subtask_count INTEGER NOT NULL DEFAULT 4,
    memory_limit_mb INTEGER NOT NULL DEFAULT 512,
    retention_kind TEXT NOT NULL CHECK(retention_kind IN ('by_count', 'by_age_days', 'by_storage_gb')),
    retention_value INTEGER NOT NULL,
    aggregate_config_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE backup_copies (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES protected_assets(id),
    job_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('file_full', 'file_inc', 'volume_full', 'volume_inc')),
    copy_uuid TEXT,
    parent_copy_id TEXT REFERENCES backup_copies(id),
    size_bytes INTEGER,
    file_count INTEGER,
    manifest_path TEXT,
    data_path TEXT,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'pruned')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE job_executions (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES protected_assets(id),
    sla_policy_id TEXT REFERENCES sla_policies(id),
    operation TEXT NOT NULL CHECK(operation IN ('backup', 'restore', 'snapshot')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    copy_uuid TEXT,
    backup_copy_id TEXT REFERENCES backup_copies(id),
    size_bytes INTEGER,
    file_count INTEGER,
    error_count INTEGER DEFAULT 0,
    started_at TEXT,
    ended_at TEXT,
    log_path TEXT,
    failure_log_path TEXT
);

CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES protected_assets(id),
    kind TEXT NOT NULL CHECK(kind IN ('nfs', 'smb')),
    data_json TEXT NOT NULL,  -- encrypted
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE retention_log (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES protected_assets(id),
    copy_id TEXT NOT NULL REFERENCES backup_copies(id),
    reason TEXT NOT NULL,
    pruned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_backup_copies_asset ON backup_copies(asset_id, status);
CREATE INDEX idx_backup_copies_parent ON backup_copies(parent_copy_id);
CREATE INDEX idx_job_executions_asset ON job_executions(asset_id, status);
CREATE INDEX idx_job_executions_status ON job_executions(status);
CREATE INDEX idx_credentials_asset ON credentials(asset_id);
```

### `migrations/002_retention.sql` (placeholder for future needs)

```sql
UPDATE schema_version SET version = 2;
-- Reserved for retention policy enhancements
```

---

## 5. Implementation Order

Dependencies between modules dictate the build order:

```
Phase A: Agent Foundation
  config.rs ──> db/mod.rs ──> auth.rs (token init)
      │              │
      ▼              ▼
  server/router.rs + server/auth.rs
      │
      ▼
  api/agent.rs (health + info endpoints)
  ─── Agent binary boots, serves health check ───

Phase B: Asset & SLA CRUD
  db/{models, assets, slas, creds}.rs
      │
      ▼
  api/{types, assets, slas}.rs
  ─── Assets and SLA policies full CRUD via API ───

Phase C: File Backup Execution
  adapters/file.rs ──> runner/{queue, execute}.rs ──> progress.rs
      │
      ▼
  api/jobs.rs (submit, list, cancel, log)
  server/ws.rs (WebSocket upgrade + event fanout)
  ─── End-to-end fileset backup via API ───

Phase D: Volume Backup Execution
  adapters/volume.rs ──> integrate with runner/execute.rs
  adapters/consistency.rs
  api/browse.rs, api/copies.rs
  ─── Volume backup + consistency mode ───

Phase E: Scheduler + Retention
  scheduler/cron.rs ──> retention.rs
  ─── Scheduled recurring backups work ───

Phase F: Restore
  api/restore.rs (file restore + volume restore)
  ─── Restore via API ───

Phase G: Desktop Client
  Tauri scaffold ──> agent_client/ ──> commands.rs
      │
      ▼
  React scaffold ──> pages + components
      │
      ▼
  Full GUI flows for all API operations
```

### Week-by-Week Task Breakdown

#### Week 1-2: Agent Scaffolding

| Day | Task | Files |
|-----|------|-------|
| 1-2 | Create Cargo workspace; init `crates/agentd` crate; add dependencies | `Cargo.toml`, `crates/agentd/Cargo.toml` |
| 3-4 | Implement `config.rs`: AgentConfig with CLI (clap), env, defaults | `config.rs` |
| 5-6 | Implement `db/mod.rs`, `db/migrations.rs`, `db/models.rs`; write `001_initial.sql` | `db/`, `migrations/001_initial.sql` |
| 7-8 | Implement `auth.rs`: token generation/loading; `server/auth.rs`: AuthLayer | `auth.rs`, `server/auth.rs` |
| 9-10 | Implement `server/router.rs`: axum Router with state; `api/agent.rs`: health + info | `server/`, `api/agent.rs` |
| 11-13 | Implement `db/{assets, slas}.rs`: CRUD queries | `db/assets.rs`, `db/slas.rs` |
| 14 | Write integration test: agent starts, health endpoint returns 200, token auth works | `tests/` |

**Milestone**: Agent binary boots, serves `GET /api/v1/health` with DB connectivity, auth middleware enforces token.

#### Week 3-4: Asset & SLA API + File Backup Adapter

| Day | Task | Files |
|-----|------|-------|
| 1-2 | `api/types.rs`: all request/response DTOs with serde | `api/types.rs` |
| 3-4 | `api/assets.rs`: full CRUD handlers for protected_assets | `api/assets.rs` |
| 5-6 | `api/slas.rs`: full CRUD handlers for sla_policies + presets | `api/slas.rs` |
| 7-8 | `adapters/file.rs`: FileBackupAdapter — wrap bifrost `BackupOption`, `BackupTask`, `RestoreTask` | `adapters/file.rs` |
| 9-11 | `runner/queue.rs`: JobQueue with semaphore + cancellation; `runner/execute.rs`: dispatch logic for fileset | `runner/` |
| 12-13 | `progress.rs`: ProgressBus; wire bifrost stats callbacks into bus | `progress.rs`, `adapters/file.rs` |
| 14 | Test: create fileset asset via API, submit backup job, verify copy repo created | `tests/` |

**Milestone**: API can create a fileset asset, submit a backup job, and the agent executes a real bifrost copy to a local target directory. Progress events fire.

#### Week 5-6: Job API + WebSocket + Desktop Scaffolding

| Day | Task | Files |
|-----|------|-------|
| 1-2 | `api/jobs.rs`: list, detail, submit, cancel, log endpoints | `api/jobs.rs` |
| 3-4 | `server/ws.rs`: WebSocket upgrade, `ProgressBus` subscriber → WsEvent fanout to connected clients | `server/ws.rs` |
| 5-6 | `api/copies.rs`: CRUD for backup_copies; `api/browse.rs`: browse copy contents via bifrost metadata | `api/copies.rs`, `api/browse.rs` |
| 7-8 | Init `desktop/` Tauri project: `npm create tauri-app`, configure `tauri.conf.json` | `desktop/` |
| 9-10 | `desktop/src-tauri/src/agent_client/`: HTTP + WS client, types | `agent_client/` |
| 11-12 | `desktop/src-tauri/src/commands.rs`: thin Tauri command wrappers for all API endpoints | `commands.rs` |
| 13 | `desktop/src-tauri/src/settings.rs`: local settings JSON read/write | `settings.rs` |
| 14 | Test: desktop client connects to agent, lists assets, creates an asset | Integration test |

**Milestone**: Tauri app boots, connects to agent, can list/create assets via Tauri commands proxying to agent API.

#### Week 7-8: Desktop UI — Assets, SLA, Dashboard

| Day | Task | Files |
|-----|------|-------|
| 1-2 | React project setup: routing (react-router), Zustand stores | `src/main.tsx`, `src/App.tsx`, `src/stores/` |
| 3-4 | Layout: `Sidebar`, `AppShell`, `ConnectionBadge` | `src/components/layout/` |
| 5-7 | Asset pages: `AssetCard`, `CreateAssetDialog`, `FilesetForm`, `VolumeForm`, `NasShareForm` | `src/components/assets/`, `src/pages/Assets.tsx` |
| 8-9 | SLA editor: `SLAPolicyEditor`, `SLAPresets` | `src/components/sla/` |
| 10-11 | Dashboard page: asset status overview, recent jobs, next scheduled | `src/pages/Dashboard.tsx` |
| 12-13 | Agent connection manager: add/remove agents, test connection, token entry | `src/pages/Agents.tsx` |
| 14 | End-to-end: create fileset asset + SLA in GUI, agent executes backup | Manual test |

**Milestone**: Full GUI flow for creating fileset asset with SLA, starting backup, seeing progress on dashboard.

#### Week 9-10: Volume Backup + NAS + Consistency Mode

| Day | Task | Files |
|-----|------|-------|
| 1-3 | `adapters/volume.rs`: VolumeBackupAdapter wrapping vpt-rs | `adapters/volume.rs` |
| 4-5 | Volume asset UI: `VolumeForm` with backend detection + volume listing | `src/components/assets/VolumeForm.tsx` |
| 6-7 | NAS share: `NasShareForm` with credential entry + connection test | `src/components/assets/NasShareForm.tsx`, `db/creds.rs` |
| 8-9 | `adapters/consistency.rs`: snapshot-then-scan orchestration | `adapters/consistency.rs` |
| 10-11 | `api/assets.rs`: add test-connection endpoint for NAS validation | `api/assets.rs` |
| 12-13 | Volume backup progress: parse dd/btrfs-send/zfs-send pipe for throughput | `adapters/volume.rs` |
| 14 | Integration test: volume backup (LVM or Btrfs), consistency backup on fileset | `tests/` |

**Milestone**: All three asset kinds (fileset, volume, NAS share) can be created and backed up via API. Consistency mode works for filesets on snapshot-capable volumes.

#### Week 11: Scheduler + Retention

| Day | Task | Files |
|-----|------|-------|
| 1-3 | `scheduler/cron.rs`: CronScheduler with cron parsing, tick loop, due-check | `scheduler/` |
| 4-5 | `retention.rs`: RetentionEngine — evaluate policy, identify expired copies, prune | `retention.rs` |
| 6-7 | SLA preview endpoint: `GET /api/v1/sla-policies/:id/preview` | `api/slas.rs` |
| 8-9 | UI for schedule display: next-run preview, cron visual editor | `src/components/shared/CronInput.tsx` |
| 10-11 | Integration: schedule a backup, wait for cron tick, verify execution | `tests/` |
| 12 | Retention test: create 5 backups, set retention=3, verify 2 pruned | `tests/` |

**Milestone**: Agent runs scheduled backups automatically. Expired copies are pruned.

#### Week 12: Restore

| Day | Task | Files |
|-----|------|-------|
| 1-3 | `api/restore.rs`: file restore endpoint (select copy, entries, destination, policy) | `api/restore.rs` |
| 4-5 | Volume restore endpoint | `api/restore.rs` |
| 6-7 | Restore wizard UI: copy selector → file tree browser → destination → conflict policy → execute | `src/pages/RestoreWizard.tsx` |
| 8-9 | `CopyBrowser.tsx`: virtualized file tree for browsing backup copy contents | `src/components/browse/CopyBrowser.tsx` |
| 10-11 | `SnapshotBrowser.tsx`: mount → browse → unmount volume snapshot | `src/components/browse/SnapshotBrowser.tsx` |
| 12-13 | Restore progress UI: `JobProgress` component reused for restore | `src/components/jobs/JobProgress.tsx` |
| 14 | End-to-end restore test: backup → restore → verify file contents | `tests/` |

**Milestone**: Files can be restored from backup copies via GUI. Volume snapshots can be mounted and browsed.

#### Week 13-14: Polish and Packaging

| Day | Task | Files |
|-----|------|-------|
| 1-2 | `privilege.rs`: pkexec integration for volume operations; `tray.rs`: system tray | `privilege.rs`, `tray.rs` |
| 3-4 | Desktop notifications: Tauri notification plugin for job completion/failure | `src/hooks/useNotification.ts` |
| 5-6 | Error state polish: permission errors, connectivity errors, missing tools — all with resolution steps | `api/`, frontend error handling |
| 7-8 | Dark mode: CSS variables + Tauri theme plugin | `src/`, `tauri.conf.json` |
| 9 | `bifrost-agentd.service`: systemd unit file with notify support | `packaging/bifrost-agentd.service` |
| 10-11 | Static build for agent: musl target, CI script; AppImage build for desktop | `scripts/`, `packaging/` |
| 12-13 | Integration testing on clean VMs: Ubuntu 22.04, Fedora 40, Arch | Manual |
| 14 | Release checklist: version bump, changelog, binary signing, distribution | |

**Milestone**: MVP shipped. Agent installable via static binary + systemd unit. Desktop installable via AppImage.

---

## 6. Testing Strategy

### 6.1 Unit Tests

| Layer | Framework | What to Test |
|-------|-----------|--------------|
| Agent DB queries | `rusqlite` in-memory DB | CRUD operations, migration integrity, constraint violations |
| Auth | Direct function calls | Token generation, validation, middleware rejection |
| Adapters | Mock engine APIs (trait-based) | Config translation, progress event emission, error mapping |
| Cron scheduler | Fake clock | Cron matching, due detection, edge cases (DST, leap) |
| Retention engine | In-memory DB with test data | Count/age/storage policies, edge cases |
| Frontend components | Vitest + React Testing Library | Rendering, user interactions, form validation |
| Frontend stores | Vitest | State transitions, API mock calls |

### 6.2 Integration Tests

| Test | Setup | What It Validates |
|------|-------|-------------------|
| Agent API CRUD | Start agent with temp DB | Create/read/update/delete assets, SLA policies |
| Agent job execution | Start agent, real bifrost lib | Create temp files, backup to temp dir, verify copy repo |
| Agent volume backup | Start agent, real vpt-rs lib | Requires Btrfs test volume or loopback LVM |
| Consistency backup | Agent with both engines | Snapshot → backup → snapshot cleanup |
| Scheduler | Agent with cron tick at 5s | Verify job fires on schedule |
| Desktop → Agent HTTP | Desktop Tauri commands | All command calls succeed against running agent |
| WebSocket events | Desktop WS client + running job | Progress events arrive, status transitions fire |

### 6.3 End-to-End Tests

- **Golden path**: Install agent, install desktop, create fileset asset, run full backup, run incremental backup, browse copy, restore file, verify content matches.
- **Error paths**: Backup with missing source dir, backup with no permission on target, NAS unreachable, volume backend tools not installed, cancel running job, retention prune with locked files.

---

## 7. Key Technical Risks and Design Decisions to Finalize

### 7.1 Open Design Decisions (Blockers)

These must be resolved before or during Week 1-2:

1. **bifrost progress callback mechanism**: bifrost exposes `ScanStatsSnapshot` via polling on `RunningScan`. For real-time progress, we need to either poll at 250ms or add a channel-based callback to bifrost. **Decision needed**: Poll (simpler, no engine change) or add callback API to bifrost?

2. **vpt-rs progress for dd/btrfs send**: vpt-rs shells out to `dd`. We can monitor output file size with `stat` polling to estimate progress. Pipe throughput (`pv`-style) would be more accurate but requires wrapping the subprocess. **Decision needed**: File-size polling (runs today) or pipe monitoring wrapper?

3. **Credential encryption at rest**: NAS credentials need to be stored encrypted. Simplest approach for MVP: AES-256-GCM with a key derived from the agent's bearer token (already a random secret). **Decision needed**: Token-derived key or OS keyring?

4. **Database migration framework**: Embedded SQL files with a version table (simplest) or a crate like `refinery`/`sqlx`? **Decision needed**: Embedded SQL files (no new dependency, transparent)?

5. **Frontend UI library**: Ant Design provides more out-of-the-box (tables, forms, trees) but is heavier. Radix UI + Tailwind is lighter and more customizable. **Decision needed**: Ant Design (faster development, bulkier) or Radix + Tailwind (leaner, more work)?

### 7.2 Technical Risks (Tracked from PRD Section 9)

| Risk | Mitigation in Plan |
|------|--------------------|
| bifrost/vpt-rs API instability | Adapter layer (Section 2.2); pin engine git revisions in `Cargo.toml` |
| vpt-rs subprocess dependency | Backend detection verifies tools (Week 2); health endpoint reports gaps (Week 1) |
| Large backup UX freezing | All I/O in agent async runtime (Week 3); progress throttled to 4Hz (Week 4); virtualized file tree (Week 12) |
| Agent↔desktop version skew | API path versioned (`/api/v1/`); version in health response (Week 1) |
| Remote agent security | Token auth (Week 1); localhost bind by default; TLS docs for remote setup (Week 13) |

---

## 8. Development Environment Setup

### 8.1 Prerequisites

```bash
# Rust toolchain
rustup default stable
rustup target add x86_64-unknown-linux-musl  # For static agent build

# Node.js (for Tauri frontend)
# Use fnm/nvm or system package
node --version  # >= 20

# System libraries (Tauri on Linux)
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libssl-dev libgtk-3-dev  # Debian/Ubuntu
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel \
  librsvg2-devel patchelf openssl-devel gtk3-devel  # Fedora

# bifrost + vpt-rs are already checked out as ../bifrost and ../vpt-rs
# Verify they compile:
cargo check -p bifrost -p vpt-rs
```

### 8.2 Development Workflow

```bash
# Terminal 1: Start agent with dev config
cargo run -p bifrost-agentd -- \
  --data-dir /tmp/bifrost-agent-dev \
  --bind 127.0.0.1 --port 8787 \
  --log-level debug

# Terminal 2: Start desktop in dev mode
cd desktop
npm install
npm run tauri dev

# Run agent tests
cargo test -p bifrost-agentd

# Run desktop frontend tests
cd desktop && npm test

# Build for release
cargo build --release -p bifrost-agentd
cd desktop && npm run tauri build
```

### 8.3 CI Pipeline (GitHub Actions, to be set up in Week 1)

```yaml
# .github/workflows/ci.yml
jobs:
  agent-test:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - run: cargo test -p bifrost-agentd --lib
      - run: cargo clippy -p bifrost-agentd -- -D warnings

  agent-integration:
    runs-on: ubuntu-22.04
    steps:
      - run: cargo test -p bifrost-agentd --test integration

  desktop-test:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - run: cd desktop && npm ci && npm test

  build-agent:
    runs-on: ubuntu-22.04
    steps:
      - run: cargo build --release -p bifrost-agentd --target x86_64-unknown-linux-musl

  build-desktop:
    runs-on: ubuntu-22.04
    steps:
      - run: cd desktop && npm ci && npm run tauri build
```
