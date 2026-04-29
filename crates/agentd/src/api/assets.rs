use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::db::models::{ProtectedAsset, SLAPolicy};
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
            sla_policy: SLAPolicyResponse {
                id: a.sla_policy_id.clone(),
                name: "Unknown".into(),
                copy_mode: "common".into(),
                backup_type: "full".into(),
                schedule_cron: "0 0 * * *".into(),
                block_size: 1_048_576,
                subtask_count: 4,
                memory_limit_mb: 512,
                retention_kind: "by_count".into(),
                retention_value: 7,
                aggregate_config: None,
                created_at: String::new(),
                updated_at: String::new(),
            },
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
    let sla_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let config_json = serde_json::to_string(&req.config)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;

    // Insert SLA policy
    let sla = SLAPolicy {
        id: sla_id.clone(),
        name: req.sla_policy.name.clone(),
        copy_mode: req.sla_policy.copy_mode.clone(),
        backup_type: req.sla_policy.backup_type.clone(),
        schedule_cron: req.sla_policy.schedule_cron.clone(),
        block_size: req.sla_policy.block_size,
        subtask_count: req.sla_policy.subtask_count,
        memory_limit_mb: req.sla_policy.memory_limit_mb,
        retention_kind: req.sla_policy.retention_kind.clone(),
        retention_value: req.sla_policy.retention_value,
        aggregate_config_json: req.sla_policy.aggregate_config.as_ref().map(|c| {
            serde_json::to_string(c).unwrap_or_default()
        }),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    state.db.with_conn(|conn| db::slas::insert(conn, &sla))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert asset
    let asset = ProtectedAsset {
        id: asset_id.clone(),
        name: req.name.clone(),
        kind: req.kind.as_str().to_string(),
        config_json,
        sla_policy_id: sla_id.clone(),
        enabled: true,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    state.db.with_conn(|conn| db::assets::insert(conn, &asset))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Return response
    let sla_response = SLAPolicyResponse {
        id: sla.id,
        name: sla.name,
        copy_mode: sla.copy_mode,
        backup_type: sla.backup_type,
        schedule_cron: sla.schedule_cron,
        block_size: sla.block_size,
        subtask_count: sla.subtask_count,
        memory_limit_mb: sla.memory_limit_mb,
        retention_kind: sla.retention_kind,
        retention_value: sla.retention_value,
        aggregate_config: req.sla_policy.aggregate_config,
        created_at: sla.created_at,
        updated_at: sla.updated_at,
    };

    Ok(Json(AssetResponse {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        config: req.config,
        sla_policy: sla_response,
        enabled: asset.enabled,
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
    let config_json = serde_json::to_string(&req.config)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;

    state.db.with_conn(|conn| db::assets::update(conn, &id, &req.name, &config_json, true))
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
    let sla = db.with_conn(|conn| db::slas::get_by_id(conn, &a.sla_policy_id))?;

    let sla_response = sla.map(|s| SLAPolicyResponse {
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
        created_at: s.created_at,
        updated_at: s.updated_at,
    }).unwrap_or_else(|| SLAPolicyResponse {
        id: a.sla_policy_id.clone(),
        name: "Unknown".into(),
        copy_mode: "common".into(),
        backup_type: "full".into(),
        schedule_cron: "0 0 * * *".into(),
        block_size: 1_048_576,
        subtask_count: 4,
        memory_limit_mb: 512,
        retention_kind: "by_count".into(),
        retention_value: 7,
        aggregate_config: None,
        created_at: String::new(),
        updated_at: String::new(),
    });

    Ok(AssetResponse {
        id: a.id.clone(),
        name: a.name.clone(),
        kind: a.kind.clone(),
        config,
        sla_policy: sla_response,
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
        .route("/{id}", get(get_asset).put(update_asset).delete(delete_asset))
        .route("/{id}/test", post(test_asset))
}
