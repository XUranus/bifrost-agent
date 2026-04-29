use axum::{
    extract::Path,
    routing::get,
    Json, Router,
};
use crate::api::types::DirEntry;
use crate::server::router::AppState;

/// GET /api/v1/browse/:copy_id
async fn browse_copy_root(
    Path(_copy_id): Path<String>,
) -> Json<Vec<DirEntry>> {
    // Stub: browse not yet implemented
    Json(vec![])
}

/// GET /api/v1/browse/:copy_id/*path
async fn browse_copy_path(
    Path((_copy_id, _path)): Path<(String, String)>,
) -> Json<Vec<DirEntry>> {
    // Stub: browse not yet implemented
    Json(vec![])
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{copy_id}", get(browse_copy_root))
        .route("/{copy_id}/{*path}", get(browse_copy_path))
}
