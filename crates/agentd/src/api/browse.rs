use axum::{
    extract::Path,
    routing::get,
    Json, Router,
};
use crate::api::types::DirEntry;
use crate::server::router::AppState;

/// GET /api/v1/browse/:copy_id and /api/v1/browse/:copy_id/*path
///
/// Uses a wildcard route that captures the copy_id from the path segments.
async fn browse_copy(
    Path(path): Path<String>,
) -> Json<Vec<DirEntry>> {
    // path is either "copy_id" or "copy_id/rest/of/path"
    let (_copy_id, _sub_path) = match path.split_once('/') {
        Some((id, sub)) => (id.to_string(), Some(sub.to_string())),
        None => (path, None),
    };
    // Stub: browse not yet implemented
    Json(vec![])
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/*path", get(browse_copy))
}
