use tauri::State;
use crate::agent_client::AgentClient;
use crate::agent_client::types::*;
use crate::AppState;

fn get_client(state: &AppState) -> Result<AgentClient, String> {
    let url = state.agent_url.lock().unwrap().clone()
        .ok_or_else(|| "No agent connected".to_string())?;
    let token = state.agent_token.lock().unwrap().clone()
        .ok_or_else(|| "No agent token configured".to_string())?;
    AgentClient::new(url, token).map_err(|e| e.to_string())
}

// --- Agent Connection ---

#[tauri::command]
pub async fn connect_agent(
    state: State<'_, AppState>,
    url: String,
    token: String,
) -> Result<(), String> {
    // Validate the connection by calling health
    let client = AgentClient::new(url.clone(), token.clone()).map_err(|e| e.to_string())?;
    client.get::<HealthResponse>("/api/v1/health").await.map_err(|e| e.to_string())?;

    // Store the connection details
    *state.agent_url.lock().unwrap() = Some(url);
    *state.agent_token.lock().unwrap() = Some(token);

    // Persist to settings
    let mut settings = state.settings.lock().unwrap().clone();
    settings.agent_url = state.agent_url.lock().unwrap().clone();
    settings.agent_token = state.agent_token.lock().unwrap().clone();
    crate::settings::save_settings(&settings).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn disconnect_agent(state: State<'_, AppState>) -> Result<(), String> {
    *state.agent_url.lock().unwrap() = None;
    *state.agent_token.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn get_agent_info(state: State<'_, AppState>) -> Result<AgentInfoResponse, String> {
    let client = get_client(&state)?;
    client.get("/api/v1/agent/info").await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_health(state: State<'_, AppState>) -> Result<HealthResponse, String> {
    let client = get_client(&state)?;
    client.get("/api/v1/health").await.map_err(|e| e.to_string())
}

// --- Assets ---

#[tauri::command]
pub async fn list_assets(state: State<'_, AppState>) -> Result<Vec<AssetResponse>, String> {
    let client = get_client(&state)?;
    client.get("/api/v1/assets").await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_asset(
    state: State<'_, AppState>,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.post("/api/v1/assets", &body).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_asset(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.get(&format!("/api/v1/assets/{id}")).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset(
    state: State<'_, AppState>,
    id: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.put(&format!("/api/v1/assets/{id}"), &body).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_asset(
    state: State<'_, AppState>,
    id: String,
    keep_copies: Option<bool>,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    let path = format!("/api/v1/assets/{id}?keep_copies={}", keep_copies.unwrap_or(false));
    client.delete(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_asset(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.post(&format!("/api/v1/assets/{id}/test"), &serde_json::json!({}))
        .await.map_err(|e| e.to_string())
}

// --- SLA Policies ---

#[tauri::command]
pub async fn list_sla_policies(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.get("/api/v1/sla-policies").await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sla_policy(
    state: State<'_, AppState>,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.post("/api/v1/sla-policies", &body).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sla_policy(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.get(&format!("/api/v1/sla-policies/{id}")).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_sla_policy(
    state: State<'_, AppState>,
    id: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.put(&format!("/api/v1/sla-policies/{id}"), &body).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_sla_policy(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.delete(&format!("/api/v1/sla-policies/{id}")).await.map_err(|e| e.to_string())
}

// --- Jobs ---

#[tauri::command]
pub async fn list_jobs(
    state: State<'_, AppState>,
    asset_id: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<JobResponse>, String> {
    let client = get_client(&state)?;
    let mut path = "/api/v1/jobs?".to_string();
    if let Some(a) = asset_id { path.push_str(&format!("asset_id={a}&")); }
    if let Some(s) = status { path.push_str(&format!("status={s}&")); }
    if let Some(l) = limit { path.push_str(&format!("limit={l}&")); }
    if let Some(o) = offset { path.push_str(&format!("offset={o}&")); }
    client.get(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_job(
    state: State<'_, AppState>,
    id: String,
) -> Result<JobResponse, String> {
    let client = get_client(&state)?;
    client.get(&format!("/api/v1/jobs/{id}")).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_job(
    state: State<'_, AppState>,
    asset_id: String,
    operation: String,
) -> Result<JobResponse, String> {
    let client = get_client(&state)?;
    client.post("/api/v1/jobs", &serde_json::json!({
        "asset_id": asset_id,
        "operation": operation,
    })).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_job(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.post(&format!("/api/v1/jobs/{id}/cancel"), &serde_json::json!({}))
        .await.map_err(|e| e.to_string())
}

// --- Backup Copies ---

#[tauri::command]
pub async fn list_backup_copies(
    state: State<'_, AppState>,
    asset_id: String,
) -> Result<Vec<BackupCopyResponse>, String> {
    let client = get_client(&state)?;
    client.get(&format!("/api/v1/backup-copies?asset_id={asset_id}"))
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_backup_copy(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state)?;
    client.delete(&format!("/api/v1/backup-copies/{id}")).await.map_err(|e| e.to_string())
}

// --- Restore ---

#[tauri::command]
pub async fn start_restore(
    state: State<'_, AppState>,
    body: serde_json::Value,
) -> Result<JobResponse, String> {
    let client = get_client(&state)?;
    client.post("/api/v1/restore", &body).await.map_err(|e| e.to_string())
}

// --- Browse ---

#[tauri::command]
pub async fn browse_copy(
    state: State<'_, AppState>,
    copy_id: String,
    path: Option<String>,
) -> Result<Vec<DirEntry>, String> {
    let client = get_client(&state)?;
    let url = match path {
        Some(p) => format!("/api/v1/browse/{copy_id}/{p}"),
        None => format!("/api/v1/browse/{copy_id}"),
    };
    client.get(&url).await.map_err(|e| e.to_string())
}
