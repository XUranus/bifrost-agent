use axum::{
    extract::State,
    routing::get,
    Json, Router,
};

use crate::server::router::AppState;
use super::types::{AgentInfoResponse, HealthResponse};

/// GET /api/v1/health — unauthenticated health check.
pub async fn health(
    State(state): State<AppState>,
) -> Json<HealthResponse> {
    let db_ok = state.db.with_conn(|_| Ok(())).is_ok();
    Json(HealthResponse {
        status: if db_ok { "ok".into() } else { "degraded".into() },
        version: env!("CARGO_PKG_VERSION").into(),
        uptime_seconds: 0,
        db_ok,
        queue_depth: state.queue.active_count(),
    })
}

/// GET /api/v1/agent/info — agent information.
pub async fn agent_info() -> Json<AgentInfoResponse> {
    let backends = detect_backends();
    Json(AgentInfoResponse {
        version: env!("CARGO_PKG_VERSION").into(),
        platform: std::env::consts::OS.into(),
        backends,
        capabilities: vec![
            "file_backup".into(),
            "file_restore".into(),
            "volume_backup".into(),
            "volume_restore".into(),
            "snapshot".into(),
            "mount".into(),
        ],
        uptime_seconds: 0,
    })
}

/// GET /api/v1/agent/config — get agent configuration.
pub async fn get_config() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// PUT /api/v1/agent/config — update agent configuration.
pub async fn update_config(
    Json(_body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

/// Build the routes for /api/v1/agent/*
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/info", get(agent_info))
        .route("/config", get(get_config).put(update_config))
}

fn detect_backends() -> Vec<String> {
    let mut backends = Vec::new();

    if std::process::Command::new("which")
        .arg("btrfs")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        backends.push("linux-btrfs".into());
    }

    if std::process::Command::new("which")
        .arg("lvs")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        backends.push("linux-lvm".into());
    }

    if std::process::Command::new("which")
        .arg("zfs")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        backends.push("linux-zfs".into());
    }

    if backends.is_empty() {
        backends.push("none".into());
    }

    backends
}
