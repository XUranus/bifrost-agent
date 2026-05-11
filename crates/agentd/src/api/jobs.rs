use axum::{
    extract::{Path, Query, State},
    routing::{get, post, delete},
    Json, Router,
};

use crate::db::models::JobExecution;
use crate::db;
use crate::api::types::*;
use crate::server::router::AppState;

/// GET /api/v1/jobs
pub async fn list_jobs(
    State(state): State<AppState>,
    Query(filter): Query<JobFilter>,
) -> Json<Vec<JobResponse>> {
    let jobs = state.db.with_conn(|conn| db::jobs::list_all(conn, filter.status.as_deref(), filter.limit, filter.offset))
        .unwrap_or_default();

    let responses = jobs.into_iter().map(|j| job_to_response(&j)).collect();
    Json(responses)
}

/// GET /api/v1/jobs/:id
pub async fn get_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<JobResponse>, (axum::http::StatusCode, String)> {
    let job = state.db.with_conn(|conn| db::jobs::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Job not found".into()))?;

    Ok(Json(job_to_response(&job)))
}

/// POST /api/v1/jobs
pub async fn start_job(
    State(state): State<AppState>,
    Json(req): Json<StartJobRequest>,
) -> Result<Json<JobResponse>, (axum::http::StatusCode, String)> {
    // Verify asset exists and protection is active
    let asset = state.db.with_conn(|conn| db::assets::get_by_id(conn, &req.asset_id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    if asset.sla_policy_id.is_none() || !asset.enabled {
        return Err((
            axum::http::StatusCode::CONFLICT,
            "Asset protection is not active. Activate protection before running jobs.".into(),
        ));
    }

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
pub async fn cancel_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // Verify the job exists first
    let job = state.db.with_conn(|conn| db::jobs::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Job not found".into()))?;

    // Only allow cancelling pending or running jobs
    if job.status != "pending" && job.status != "running" {
        return Err((axum::http::StatusCode::CONFLICT, format!("Job is already {}", job.status)));
    }

    state.db.with_conn(|conn| db::jobs::update_status(conn, &id, "cancelled", 0))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.progress.job_status(&id, "cancelled", None);

    Ok(Json(serde_json::json!({ "cancelled": id })))
}

/// GET /api/v1/jobs/:id/log
pub async fn get_job_log(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let entries = state.progress.get_job_logs(&id);
    let lines: Vec<serde_json::Value> = entries.into_iter().map(|e| {
        serde_json::json!({
            "level": e.level,
            "message": e.message,
            "timestamp": e.timestamp,
        })
    }).collect();
    Json(serde_json::json!({ "lines": lines }))
}

/// DELETE /api/v1/jobs/:id
pub async fn delete_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let job = state.db.with_conn(|conn| db::jobs::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Job not found".into()))?;

    // Only allow deleting terminal-state jobs
    if job.status == "running" || job.status == "pending" {
        return Err((axum::http::StatusCode::CONFLICT, "Cannot delete a running or pending job".into()));
    }

    state.db.with_conn(|conn| db::jobs::delete_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "deleted": id })))
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
        .route("/:id", get(get_job).delete(delete_job))
        .route("/:id/cancel", post(cancel_job))
        .route("/:id/log", get(get_job_log))
}
