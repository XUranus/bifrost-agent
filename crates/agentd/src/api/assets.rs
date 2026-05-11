use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::db::models::ProtectedAsset;
use crate::db::{self, Database};
use crate::api::types::*;
use crate::server::router::AppState;

/// GET /api/v1/assets
async fn list_assets(State(state): State<AppState>) -> Json<Vec<AssetResponse>> {
    let assets = state.db.with_conn(|conn| db::assets::list_all(conn)).unwrap_or_default();

    let responses: Vec<AssetResponse> = assets
        .into_iter()
        .map(|a| asset_to_response(&state.db, &a).unwrap_or_else(|_| AssetResponse {
            id: a.id.clone(),
            name: a.name.clone(),
            kind: a.kind.clone(),
            config: serde_json::from_str(&a.config_json).unwrap_or(AssetConfig::Fileset {
                paths: vec![],
                consistency_mode: false,
                exclude_patterns: vec![],
            }),
            sla_policy: None,
            protection_active: false,
            enabled: a.enabled,
            health: "unknown".into(),
            last_backup: None,
            next_backup: None,
            created_at: a.created_at,
        }))
        .collect();

    Json(responses)
}

/// POST /api/v1/assets
async fn create_asset(
    State(state): State<AppState>,
    Json(req): Json<CreateAssetRequest>,
) -> Result<Json<AssetResponse>, (axum::http::StatusCode, String)> {
    let asset_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let config_json = serde_json::to_string(&req.config)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;

    // Insert asset without SLA, protection inactive
    let asset = ProtectedAsset {
        id: asset_id.clone(),
        name: req.name.clone(),
        kind: req.kind.as_str().to_string(),
        config_json,
        sla_policy_id: None,
        enabled: false,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    state.db.with_conn(|conn| db::assets::insert(conn, &asset))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AssetResponse {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        config: req.config,
        sla_policy: None,
        protection_active: false,
        enabled: false,
        health: "ok".into(),
        last_backup: None,
        next_backup: None,
        created_at: asset.created_at,
    }))
}

/// GET /api/v1/assets/:id
async fn get_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AssetResponse>, (axum::http::StatusCode, String)> {
    let asset = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    Ok(Json(asset_to_response(&state.db, &asset)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?))
}

/// PUT /api/v1/assets/:id
async fn update_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<CreateAssetRequest>,
) -> Result<Json<AssetResponse>, (axum::http::StatusCode, String)> {
    let existing = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    let config_json = serde_json::to_string(&req.config)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;

    state.db.with_conn(|conn| db::assets::update(conn, &id, &req.name, &config_json, existing.enabled))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let asset = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    Ok(Json(asset_to_response(&state.db, &asset)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?))
}

/// DELETE /api/v1/assets/:id
#[derive(Deserialize)]
struct DeleteQuery {
    keep_copies: Option<bool>,
}

async fn delete_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<DeleteQuery>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // Delete all associated job executions first (FK constraint)
    let _ = state.db.with_conn(|conn| db::jobs::delete_by_asset(conn, &id));

    // If not keeping copies, delete all associated backup copies
    if !query.keep_copies.unwrap_or(false) {
        let copies = state.db.with_conn(|conn| db::copies::list_by_asset(conn, &id))
            .unwrap_or_default();
        for copy in &copies {
            let _ = state.db.with_conn(|conn| db::copies::delete(conn, &copy.id));
        }
    }

    state.db.with_conn(|conn| db::assets::delete(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "deleted": id })))
}

/// POST /api/v1/assets/:id/activate
async fn activate_protection(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<ActivateProtectionRequest>,
) -> Result<Json<AssetResponse>, (axum::http::StatusCode, String)> {
    let _asset = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    // Verify the SLA exists
    let _sla = state.db.with_conn(|conn| db::slas::get_by_id(conn, &req.sla_policy_id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "SLA policy not found".into()))?;

    // Bind SLA and enable
    state.db.with_conn(|conn| db::assets::update_sla(conn, &id, Some(&req.sla_policy_id)))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.db.with_conn(|conn| db::assets::set_enabled(conn, &id, true))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let updated = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    Ok(Json(asset_to_response(&state.db, &updated)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?))
}

/// POST /api/v1/assets/:id/deactivate
async fn deactivate_protection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AssetResponse>, (axum::http::StatusCode, String)> {
    let _asset = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    state.db.with_conn(|conn| db::assets::set_enabled(conn, &id, false))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let updated = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    Ok(Json(asset_to_response(&state.db, &updated)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?))
}

/// PUT /api/v1/assets/:id/sla
async fn change_sla(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<ActivateProtectionRequest>,
) -> Result<Json<AssetResponse>, (axum::http::StatusCode, String)> {
    let _asset = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    // Verify the SLA exists
    let _sla = state.db.with_conn(|conn| db::slas::get_by_id(conn, &req.sla_policy_id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "SLA policy not found".into()))?;

    state.db.with_conn(|conn| db::assets::update_sla(conn, &id, Some(&req.sla_policy_id)))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let updated = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Asset not found".into()))?;

    Ok(Json(asset_to_response(&state.db, &updated)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?))
}

/// POST /api/v1/assets/:id/test
async fn test_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<serde_json::Value> {
    let asset = state.db.with_conn(|conn| db::assets::get_by_id(conn, &id))
        .unwrap_or(None);

    let (healthy, message) = match asset {
        Some(a) => match a.kind.as_str() {
            "fileset" => {
                let config: Option<AssetConfig> = serde_json::from_str(&a.config_json).ok();
                match config {
                    Some(AssetConfig::Fileset { paths, .. }) => {
                        let all_exist = paths.iter().all(|p| p.exists());
                        if all_exist {
                            (true, "All paths exist".to_string())
                        } else {
                            (false, "Some paths do not exist".to_string())
                        }
                    }
                    _ => (false, "Invalid fileset config".to_string()),
                }
            }
            "volume" => (true, "Volume check not implemented".to_string()),
            "nas_share" => (true, "NAS connectivity check not implemented".to_string()),
            _ => (false, "Unknown asset kind".to_string()),
        },
        None => {
            return Json(serde_json::json!({ "healthy": false, "message": "Asset not found" }));
        }
    };

    Json(serde_json::json!({
        "healthy": healthy,
        "message": message,
    }))
}

fn asset_to_response(db: &Arc<Database>, a: &ProtectedAsset) -> Result<AssetResponse, anyhow::Error> {
    let config: AssetConfig = serde_json::from_str(&a.config_json)?;

    let sla_response = match &a.sla_policy_id {
        Some(sla_id) => {
            let sla = db.with_conn(|conn| db::slas::get_by_id(conn, sla_id))?;
            sla.map(|s| SLAPolicyResponse {
                id: s.id,
                name: s.name,
                copy_mode: s.copy_mode,
                backup_type: s.backup_type,
                schedule_cron: s.schedule_cron,
                block_size: s.block_size,
                subtask_count: s.subtask_count,
                memory_limit_mb: s.memory_limit_mb,
                retention_kind: s.retention_kind,
                retention_value: s.retention_value,
                aggregate_config: s.aggregate_config_json.and_then(|j| serde_json::from_str(&j).ok()),
                is_builtin: s.is_builtin,
                created_at: s.created_at,
                updated_at: s.updated_at,
            })
        }
        None => None,
    };

    let protection_active = a.sla_policy_id.is_some() && a.enabled;

    Ok(AssetResponse {
        id: a.id.clone(),
        name: a.name.clone(),
        kind: a.kind.clone(),
        config,
        sla_policy: sla_response,
        protection_active,
        enabled: a.enabled,
        health: "ok".into(),
        last_backup: None,
        next_backup: None,
        created_at: a.created_at.clone(),
    })
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_assets).post(create_asset))
        .route("/:id", get(get_asset).put(update_asset).delete(delete_asset))
        .route("/:id/test", post(test_asset))
        .route("/:id/activate", post(activate_protection))
        .route("/:id/deactivate", post(deactivate_protection))
        .route("/:id/sla", axum::routing::put(change_sla))
}
