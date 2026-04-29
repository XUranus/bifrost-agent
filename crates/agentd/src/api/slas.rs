use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};

use crate::db::models::SLAPolicy;
use crate::db;
use crate::api::types::*;
use crate::server::router::AppState;

/// GET /api/v1/sla-policies
async fn list_policies(State(state): State<AppState>) -> Json<Vec<SLAPolicyResponse>> {
    let policies = state.db.with_conn(|conn| db::slas::list_all(conn)).unwrap_or_default();
    let responses = policies.into_iter().map(|p| policy_to_response(&p)).collect();
    Json(responses)
}

/// POST /api/v1/sla-policies
async fn create_policy(
    State(state): State<AppState>,
    Json(req): Json<CreateSLAPolicyRequest>,
) -> Result<Json<SLAPolicyResponse>, (axum::http::StatusCode, String)> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let policy = SLAPolicy {
        id: id.clone(),
        name: req.name.clone(),
        copy_mode: req.copy_mode.clone(),
        backup_type: req.backup_type.clone(),
        schedule_cron: req.schedule_cron.clone(),
        block_size: req.block_size,
        subtask_count: req.subtask_count,
        memory_limit_mb: req.memory_limit_mb,
        retention_kind: req.retention_kind.clone(),
        retention_value: req.retention_value,
        aggregate_config_json: req.aggregate_config.as_ref().map(|c| {
            serde_json::to_string(c).unwrap_or_default()
        }),
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    state.db.with_conn(|conn| db::slas::insert(conn, &policy))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(policy_to_response(&policy)))
}

/// GET /api/v1/sla-policies/:id
async fn get_policy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SLAPolicyResponse>, (axum::http::StatusCode, String)> {
    let policy = state.db.with_conn(|conn| db::slas::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "SLA policy not found".into()))?;

    Ok(Json(policy_to_response(&policy)))
}

/// PUT /api/v1/sla-policies/:id
async fn update_policy(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateSLAPolicyRequest>,
) -> Result<Json<SLAPolicyResponse>, (axum::http::StatusCode, String)> {
    let existing = state.db.with_conn(|conn| db::slas::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "SLA policy not found".into()))?;

    let now = chrono::Utc::now().to_rfc3339();
    let updated = SLAPolicy {
        name: req.name.unwrap_or(existing.name),
        copy_mode: req.copy_mode.unwrap_or(existing.copy_mode),
        backup_type: req.backup_type.unwrap_or(existing.backup_type),
        schedule_cron: req.schedule_cron.unwrap_or(existing.schedule_cron),
        block_size: req.block_size.unwrap_or(existing.block_size),
        subtask_count: req.subtask_count.unwrap_or(existing.subtask_count),
        memory_limit_mb: req.memory_limit_mb.unwrap_or(existing.memory_limit_mb),
        retention_kind: req.retention_kind.unwrap_or(existing.retention_kind),
        retention_value: req.retention_value.unwrap_or(existing.retention_value),
        aggregate_config_json: req.aggregate_config.as_ref().map(|c| {
            serde_json::to_string(c).unwrap_or_default()
        }).or(existing.aggregate_config_json),
        updated_at: now,
        ..existing
    };

    state.db.with_conn(|conn| db::slas::update(conn, &id, &updated))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(policy_to_response(&updated)))
}

/// DELETE /api/v1/sla-policies/:id
async fn delete_policy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let referenced = state.db.with_conn(|conn| db::slas::is_referenced(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if referenced {
        return Err((
            axum::http::StatusCode::CONFLICT,
            "SLA policy is still referenced by one or more assets".into(),
        ));
    }

    state.db.with_conn(|conn| db::slas::delete(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "deleted": id })))
}

/// GET /api/v1/sla-policies/:id/preview
async fn preview_schedule(
    Path(_id): Path<String>,
) -> Json<serde_json::Value> {
    // Stub: return placeholder next runs
    let now = chrono::Utc::now();
    let runs: Vec<String> = (1..=5)
        .map(|i| (now + chrono::Duration::hours(i * 24)).to_rfc3339())
        .collect();
    Json(serde_json::json!({ "next_runs": runs }))
}

fn policy_to_response(p: &SLAPolicy) -> SLAPolicyResponse {
    SLAPolicyResponse {
        id: p.id.clone(),
        name: p.name.clone(),
        copy_mode: p.copy_mode.clone(),
        backup_type: p.backup_type.clone(),
        schedule_cron: p.schedule_cron.clone(),
        block_size: p.block_size,
        subtask_count: p.subtask_count,
        memory_limit_mb: p.memory_limit_mb,
        retention_kind: p.retention_kind.clone(),
        retention_value: p.retention_value,
        aggregate_config: p.aggregate_config_json.as_ref()
            .and_then(|j| serde_json::from_str(j).ok()),
        created_at: p.created_at.clone(),
        updated_at: p.updated_at.clone(),
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_policies).post(create_policy))
        .route("/{id}", get(get_policy).put(update_policy).delete(delete_policy))
        .route("/{id}/preview", get(preview_schedule))
}
