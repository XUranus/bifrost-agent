# Bifrost Desktop — Architecture

## System Overview

Bifrost Desktop is a cross-platform backup application consisting of two components:

1. **`bifrost-agentd`** — Headless backup agent daemon (Rust, axum HTTP server)
2. **`bifrost-desktop`** — Tauri desktop GUI client (future)

The agent is the single source of truth. It manages all backup assets, SLA policies, job scheduling, execution, and retention. The desktop client connects to the agent via HTTP REST API + WebSocket events.

## Crate Structure

```
bifrost-desktop/
├── Cargo.toml              # Workspace root
├── crates/
│   └── agentd/             # bifrost-agentd binary crate
│       ├── Cargo.toml
│       ├── migrations/     # SQL migration files
│       └── src/
│           ├── main.rs     # Entry point
│           ├── config.rs   # AgentConfig (CLI + env)
│           ├── auth.rs     # Token generation
│           ├── progress.rs # ProgressBus (broadcast)
│           ├── privilege.rs
│           ├── retention.rs
│           ├── server/     # HTTP + WS server
│           │   ├── router.rs   # Route definitions, AppState
│           │   ├── auth.rs     # Auth middleware + token extractor
│           │   └── ws.rs       # WebSocket handler
│           ├── api/        # Route handlers
│           │   ├── types.rs    # Request/response DTOs
│           │   ├── assets.rs   # Asset CRUD
│           │   ├── slas.rs     # SLA policy CRUD
│           │   ├── jobs.rs     # Job management
│           │   ├── copies.rs   # Backup copy management
│           │   ├── browse.rs   # Copy browsing
│           │   ├── restore.rs  # Restore operations
│           │   └── agent.rs    # Agent info/health
│           ├── db/         # SQLite persistence
│           │   ├── mod.rs      # Database struct
│           │   ├── migrations.rs
│           │   ├── models.rs   # Row types
│           │   ├── assets.rs
│           │   ├── slas.rs
│           │   ├── jobs.rs
│           │   ├── copies.rs
│           │   └── creds.rs
│           ├── adapters/   # Engine wrappers (stubs for now)
│           │   ├── file.rs
│           │   ├── volume.rs
│           │   └── consistency.rs
│           ├── runner/     # Job execution (stubs)
│           │   ├── mod.rs
│           │   ├── queue.rs
│           │   └── execute.rs
│           └── scheduler/  # Cron scheduling (stub)
│               └── cron.rs
├── desktop/                # Tauri GUI (future)
├── docs/
├── PRD.md
├── PLAN.md
├── bifrost -> ../bifrost   # Symlink to file backup engine
└── vpt-rs -> ../vpt-rs     # Symlink to volume backup engine
```

## Agent API

### Authentication

All endpoints except `/api/v1/health` require:
```
Authorization: Bearer <token>
```

The token is randomly generated on first run and stored in `{data_dir}/agent.key`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check (unauthenticated) |
| GET | `/api/v1/agent/info` | Agent version, platform, backends |
| GET/PUT | `/api/v1/agent/config` | Agent configuration |
| GET/POST | `/api/v1/assets` | List/create protected assets |
| GET/PUT/DELETE | `/api/v1/assets/:id` | Asset CRUD |
| POST | `/api/v1/assets/:id/test` | Test asset connectivity |
| GET/POST | `/api/v1/sla-policies` | List/create SLA policies |
| GET/PUT/DELETE | `/api/v1/sla-policies/:id` | SLA policy CRUD |
| GET | `/api/v1/sla-policies/:id/preview` | Preview schedule |
| GET/POST | `/api/v1/jobs` | List/start jobs |
| GET | `/api/v1/jobs/:id` | Job detail |
| POST | `/api/v1/jobs/:id/cancel` | Cancel job |
| GET | `/api/v1/jobs/:id/log` | Job log |
| GET | `/api/v1/backup-copies?asset_id=` | List copies |
| GET/DELETE | `/api/v1/backup-copies/:id` | Copy detail/delete |
| POST | `/api/v1/backup-copies/:id/expire` | Expire copy |
| POST | `/api/v1/restore` | Start restore |
| GET | `/api/v1/browse/:copy_id` | Browse copy root |
| GET | [`/api/v1/browse/:copy_id/*path`](http://localhost:8787/api/v1/browse/:copy_id/*path) | Browse copy path |
| GET | `/ws/events` | WebSocket event stream |

### WebSocket Events

The WebSocket at `/ws/events` pushes JSON-encoded events:

- `job:progress` — { job_id, phase, percent, throughput_bytes_per_sec, eta_seconds, current_item }
- `job:status` — { job_id, status, error_message? }
- `job:log` — { job_id, level, message, timestamp }
- `asset:health` — { asset_id, status, message }

### Database

SQLite database at `{data_dir}/bifrost.db` with WAL mode enabled. Tables:
- `protected_assets` — backup asset definitions
- `sla_policies` — backup schedule and retention rules
- `job_executions` — execution history
- `backup_copies` — produced backup artifacts
- `credentials` — encrypted NAS credentials
- `agent_config` — key-value settings
- `retention_log` — pruning audit trail
- `schema_version` — migration tracking

## Development

### Build

```bash
cargo build -p bifrost-agentd
cargo test -p bifrost-agentd
```

### Run

```bash
cargo run -p bifrost-agentd -- --data-dir /tmp/bifrost-agent-dev --log-level debug
```

### API Test

```bash
# Health check (no auth)
curl http://localhost:8787/api/v1/health

# Get token
cat /tmp/bifrost-agent-dev/agent.key

# List assets (authenticated)
curl -H "Authorization: Bearer $(cat /tmp/bifrost-agent-dev/agent.key)" \
  http://localhost:8787/api/v1/assets

# Create asset
curl -X POST \
  -H "Authorization: Bearer $(cat /tmp/bifrost-agent-dev/agent.key)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Home Backup","kind":"fileset","config":{"type":"fileset","paths":["/home"],"consistency_mode":false,"exclude_patterns":[]},"sla_policy":{"name":"Daily","copy_mode":"aggregate","backup_type":"full","schedule_cron":"0 3 * * *","retention_kind":"by_count","retention_value":7}}' \
  http://localhost:8787/api/v1/assets
```
