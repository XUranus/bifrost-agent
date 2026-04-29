use axum::{
    extract::State,
    routing::post,
    Json, Router,
};

use crate::api::types::*;
use crate::server::router::AppState;
use crate::db;

/// POST /api/v1/restore
async fn start_restore(
    State(state): State<AppState>,
    Json(req): Json<RestoreRequest>,
) -> Result<Json<JobResponse>, (axum::http::StatusCode, String)> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let job = crate::db::models::JobExecution {
        id: job_id.clone(),
        asset_id: req.asset_id.clone(),
        sla_policy_id: None,
        operation: "restore".to_string(),
        status: "running".to_string(),
        copy_uuid: Some(req.copy_id.clone()),
        backup_copy_id: None,
        size_bytes: None,
        file_count: Some(req.entries.len() as i64),
        error_count: 0,
        started_at: Some(now.clone()),
        ended_at: None,
        log_path: None,
        failure_log_path: None,
    };

    state.db.with_conn(|conn| db::jobs::insert(conn, &job))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.progress.job_status(&job_id, "running", None);
    state.progress.job_log(&job_id, "info", &format!(
        "Restore started: {} entries to restore", req.entries.len()
    ));

    // TODO: Submit to job queue for actual restore execution (Week 12)

    Ok(Json(JobResponse {
        id: job.id,
        asset_id: job.asset_id,
        operation: job.operation,
        status: job.status,
        progress: None,
        size_bytes: job.size_bytes,
        file_count: job.file_count,
        error_count: job.error_count,
        started_at: job.started_at,
        ended_at: job.ended_at,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(start_restore))
}
