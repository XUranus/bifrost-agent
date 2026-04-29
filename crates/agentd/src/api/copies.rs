use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::db;
use crate::api::types::BackupCopyResponse;
use crate::server::router::AppState;

#[derive(Deserialize)]
struct ListQuery {
    asset_id: Option<String>,
    status: Option<String>,
}

/// GET /api/v1/backup-copies
async fn list_copies(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Json<Vec<BackupCopyResponse>> {
    let asset_id = match query.asset_id {
        Some(id) => id,
        None => return Json(vec![]), // Require asset_id filter
    };

    let copies = state.db.with_conn(|conn| db::copies::list_by_asset(conn, &asset_id))
        .unwrap_or_default();

    let responses: Vec<BackupCopyResponse> = copies.into_iter().map(|c| BackupCopyResponse {
        id: c.id,
        asset_id: c.asset_id,
        job_id: c.job_id,
        kind: c.kind,
        copy_uuid: c.copy_uuid,
        parent_copy_id: c.parent_copy_id,
        size_bytes: c.size_bytes,
        file_count: c.file_count,
        manifest_path: c.manifest_path,
        data_path: c.data_path,
        expires_at: c.expires_at,
        status: c.status,
        created_at: c.created_at,
    }).collect();

    Json(responses)
}

/// GET /api/v1/backup-copies/:id
async fn get_copy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<BackupCopyResponse>, (axum::http::StatusCode, String)> {
    let copy = state.db.with_conn(|conn| db::copies::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Backup copy not found".into()))?;

    Ok(Json(BackupCopyResponse {
        id: copy.id,
        asset_id: copy.asset_id,
        job_id: copy.job_id,
        kind: copy.kind,
        copy_uuid: copy.copy_uuid,
        parent_copy_id: copy.parent_copy_id,
        size_bytes: copy.size_bytes,
        file_count: copy.file_count,
        manifest_path: copy.manifest_path,
        data_path: copy.data_path,
        expires_at: copy.expires_at,
        status: copy.status,
        created_at: copy.created_at,
    }))
}

/// DELETE /api/v1/backup-copies/:id
async fn delete_copy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    state.db.with_conn(|conn| db::copies::delete(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "deleted": id })))
}

/// POST /api/v1/backup-copies/:id/expire
async fn expire_copy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    state.db.with_conn(|conn| db::copies::update_status(conn, &id, "expired"))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "expired": id })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_copies))
        .route("/{id}", get(get_copy).delete(delete_copy))
        .route("/{id}/expire", post(expire_copy))
}
