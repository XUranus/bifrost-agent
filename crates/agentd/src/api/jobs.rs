use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};

use crate::db::models::JobExecution;
use crate::db;
use crate::api::types::*;
use crate::server::router::AppState;

/// GET /api/v1/jobs
async fn list_jobs(
    State(state): State<AppState>,
    Query(filter): Query<JobFilter>,
) -> Json<Vec<JobResponse>> {
    let jobs = state.db.with_conn(|conn| db::jobs::list_all(conn, filter.limit, filter.offset))
        .unwrap_or_default();

    let responses = jobs.into_iter().map(|j| job_to_response(&j)).collect();
    Json(responses)
}

/// GET /api/v1/jobs/:id
async fn get_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<JobResponse>, (axum::http::StatusCode, String)> {
    let job = state.db.with_conn(|conn| db::jobs::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Job not found".into()))?;

    Ok(Json(job_to_response(&job)))
}

/// POST /api/v1/jobs
async fn start_job(
    State(state): State<AppState>,
    Json(req): Json<StartJobRequest>,
) -> Result<Json<JobResponse>, (axum::http::StatusCode, String)> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let job = JobExecution {
        id: job_id.clone(),
        asset_id: req.asset_id.clone(),
        sla_policy_id: None,
        operation: req.operation.as_str().to_string(),
        status: "running".to_string(),
        copy_uuid: None,
        backup_copy_id: None,
        size_bytes: None,
        file_count: None,
        error_count: 0,
        started_at: Some(now.clone()),
        ended_at: None,
        log_path: None,
        failure_log_path: None,
    };

    state.db.with_conn(|conn| db::jobs::insert(conn, &job))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.progress.job_status(&job_id, "running", None);

    // TODO: Submit to job queue for actual execution (Week 5-6)

    Ok(Json(job_to_response(&job)))
}

/// POST /api/v1/jobs/:id/cancel
async fn cancel_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    state.db.with_conn(|conn| db::jobs::update_status(conn, &id, "cancelled", 0))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.progress.job_status(&id, "cancelled", None);

    Ok(Json(serde_json::json!({ "cancelled": id })))
}

/// GET /api/v1/jobs/:id/log
async fn get_job_log(
    Path(_id): Path<String>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "lines": [],
        "message": "Log streaming not yet implemented"
    }))
}

fn job_to_response(j: &JobExecution) -> JobResponse {
    JobResponse {
        id: j.id.clone(),
        asset_id: j.asset_id.clone(),
        operation: j.operation.clone(),
        status: j.status.clone(),
        progress: None,
        size_bytes: j.size_bytes,
        file_count: j.file_count,
        error_count: j.error_count,
        started_at: j.started_at.clone(),
        ended_at: j.ended_at.clone(),
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_jobs).post(start_job))
        .route("/{id}", get(get_job))
        .route("/{id}/cancel", post(cancel_job))
        .route("/{id}/log", get(get_job_log))
}
