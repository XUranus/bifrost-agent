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

### Engineering

- All API types defined with serde Serialize/Deserialize
- Full DB CRUD modules: assets, slas, jobs, copies, creds
- Migration test validates schema creation
- Auth token lifecycle test validates generation and loading
