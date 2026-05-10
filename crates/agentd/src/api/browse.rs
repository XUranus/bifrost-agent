use axum::{
    extract::Path,
    extract::State,
    routing::get,
    Json, Router,
};
use crate::api::types::DirEntry;
use crate::server::router::AppState;
use crate::db;

/// GET /api/v1/browse/:copy_id and /api/v1/browse/:copy_id/*subpath
///
/// Lists files inside a backup copy's data directory.
async fn browse_copy(
    Path(path): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Vec<DirEntry>>, (axum::http::StatusCode, String)> {
    let (copy_id, sub_path) = match path.split_once('/') {
        Some((id, sub)) => (id.to_string(), sub.to_string()),
        None => (path, None::<String>.unwrap_or_default()),
    };

    let copy = state.db.with_conn(|conn| db::copies::get_by_id(conn, &copy_id))
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Backup copy not found".into()))?;

    let data_path = copy.data_path
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Copy has no data path".into()))?;

    let mut dir = std::path::PathBuf::from(&data_path);
    if !sub_path.is_empty() {
        dir = dir.join(&sub_path);
    }

    let entries = read_dir_entries(&dir, &dir)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(entries))
}

/// Read directory entries, producing DirEntry structs with paths relative to the copy root.
fn read_dir_entries(dir: &std::path::Path, root: &std::path::Path) -> Result<Vec<DirEntry>, anyhow::Error> {
    let mut entries = Vec::new();

    if !dir.is_dir() {
        return Ok(entries);
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let full_path = entry.path();

        let relative_path = full_path.strip_prefix(root)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .to_string();

        let (kind, size) = if file_type.is_dir() {
            ("dir".to_string(), 0)
        } else if file_type.is_file() {
            ("file".to_string(), std::fs::metadata(&full_path).map(|m| m.len()).unwrap_or(0))
        } else if file_type.is_symlink() {
            ("symlink".to_string(), 0)
        } else {
            ("other".to_string(), 0)
        };

        let modified = std::fs::metadata(&full_path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                chrono::DateTime::<chrono::Utc>::from_timestamp(duration.as_secs() as i64, 0)
                    .unwrap_or_default()
                    .to_rfc3339()
            })
            .unwrap_or_default();

        let mode = std::fs::metadata(&full_path)
            .ok()
            .map(|_| {
                // On Unix, get the permission bits
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::metadata(&full_path)
                        .ok()
                        .map(|m| m.permissions().mode())
                        .unwrap_or(0)
                }
                #[cfg(not(unix))]
                {
                    0
                }
            })
            .unwrap_or(0);

        entries.push(DirEntry {
            name: file_name,
            path: format!("/{relative_path}"),
            kind,
            size,
            modified,
            mode,
        });
    }

    // Sort: directories first, then files, alphabetical within each group
    entries.sort_by(|a, b| {
        if a.kind == "dir" && b.kind != "dir" {
            std::cmp::Ordering::Less
        } else if a.kind != "dir" && b.kind == "dir" {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/*path", get(browse_copy))
}
