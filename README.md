# Bifrost Desktop

Cross-platform backup application for Linux, macOS, and Windows.

## Components

- **bifrost-agentd** — Headless backup agent daemon (Rust, axum HTTP server)
- **bifrost-desktop** — Tauri 2.x desktop GUI client (React + TypeScript)
- **bifrost** — File backup/restore engine (local, NFS, SMB)
- **vpt-rs** — Volume backup/restore engine (Btrfs, LVM, ZFS)

## Quick Start

### Build the agent

```bash
cargo build -p bifrost-agentd --release
```

### Run the agent

```bash
./target/release/bifrost-agentd --data-dir /var/lib/bifrost-agent
```

The agent starts on `http://127.0.0.1:8700`. The auth token is auto-generated on first run and stored in `$DATA_DIR/agent.key`.

### Install as a systemd service

```bash
sudo cp crates/agentd/bifrost-agentd.service /etc/systemd/system/
sudo useradd -r -s /bin/false bifrost
sudo mkdir -p /var/lib/bifrost-agent
sudo chown bifrost:bifrost /var/lib/bifrost-agent
sudo systemctl daemon-reload
sudo systemctl enable --now bifrost-agentd
```

### Build the desktop client

```bash
cd desktop
npm install
npx vite build
cargo build -p bifrost-desktop --release
```

## API

The agent exposes a REST API on the configured bind address. All endpoints except `/api/v1/health` require a `Bearer` token in the `Authorization` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/agent/info` | Agent version, platform, backends |
| GET/POST | `/api/v1/assets` | List / create protected assets |
| GET/PUT/DELETE | `/api/v1/assets/:id` | Asset CRUD |
| POST | `/api/v1/assets/:id/test` | Test asset connectivity |
| GET/POST | `/api/v1/sla-policies` | List / create SLA policies |
| GET/PUT/DELETE | `/api/v1/sla-policies/:id` | SLA policy CRUD |
| GET/POST | `/api/v1/jobs` | List / start backup/restore jobs |
| GET | `/api/v1/jobs/:id` | Job detail |
| POST | `/api/v1/jobs/:id/cancel` | Cancel a running job |
| GET | `/api/v1/backup-copies` | List backup copies |
| DELETE | `/api/v1/backup-copies/:id` | Delete a backup copy |
| POST | `/api/v1/restore` | Start a restore job |
| GET | `/api/v1/browse/:copy_id` | Browse backup copy contents |
| WS | `/ws/events` | WebSocket progress events |

## Configuration

### Agent CLI

| Flag | Env | Default | Description |
|------|-----|---------|-------------|
| `--data-dir` | `BIFROST_DATA_DIR` | `/var/lib/bifrost-agent` | Data directory |
| `--bind-host` | `BIFROST_BIND_HOST` | `127.0.0.1` | Bind address |
| `--bind-port` | `BIFROST_BIND_PORT` | `8700` | Bind port |
| `--max-concurrent-jobs` | `BIFROST_MAX_CONCURRENT_JOBS` | `4` | Concurrent job limit |
| `--log-level` | `BIFROST_LOG_LEVEL` | `info` | Log level |

### Protected Asset Kinds

- **Fileset** — File-level backup via bifrost (common/aggregate modes, full/incremental)
- **Volume** — Block-level backup via vpt-rs (Btrfs/LVM/ZFS snapshots)
- **NAS Share** — Remote NFS/SMB backup via bifrost transports

### SLA Policies

- `copy_mode`: `common` (per-file) or `aggregate` (bundled)
- `backup_type`: `full` or `full_incremental`
- `schedule_cron`: Standard cron expression for auto-scheduling
- `retention_kind`: `count`, `days`, `size_gb`, or `none`
- `block_size`: Copy buffer size in bytes
- `subtask_count`: Concurrent subtask workers

## Project Structure

```
bifrost-desktop/
├── Cargo.toml              # Workspace root
├── crates/
│   └── agentd/             # bifrost-agentd binary crate
│       ├── migrations/     # SQL migration files
│       └── src/
│           ├── adapters/   # Engine adapters (file, volume, consistency)
│           ├── api/        # HTTP handlers (assets, slas, jobs, restore, copies)
│           ├── db/         # Database layer (SQLite + rusqlite)
│           ├── runner/     # Job queue and execution dispatch
│           ├── scheduler/  # Cron-based job scheduler
│           ├── server/     # axum router, WebSocket, auth middleware
│           ├── retention.rs
│           └── main.rs
├── desktop/                # Tauri desktop application
│   ├── src-tauri/          # Rust backend (Tauri commands + agent client)
│   └── src/                # React + TypeScript frontend
├── bifrost/                # File backup engine (local + NFS + SMB)
├── vpt-rs/                 # Volume backup engine (Btrfs + LVM + ZFS)
└── docs/                   # Architecture docs and changelog
```

## License

MIT
