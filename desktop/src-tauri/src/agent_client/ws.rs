//! WebSocket client for real-time agent events.

use tauri::Emitter;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::http;
use futures_util::StreamExt;

/// Connect to the agent's WebSocket event stream and emit Tauri events.
pub async fn connect_ws(
    agent_url: &str,
    token: &str,
    app_handle: tauri::AppHandle,
) -> Result<(), anyhow::Error> {
    let ws_url = agent_url
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        .trim_end_matches('/')
        .to_string()
        + "/ws/events";

    let request = http::Request::builder()
        .uri(&ws_url)
        .header("Authorization", format!("Bearer {token}"))
        .body(())
        .map_err(|e| anyhow::anyhow!("Failed to build WS request: {e}"))?;

    let (ws_stream, _) = connect_async(request).await?;
    let (_, read) = ws_stream.split();

    read.for_each(|message| {
        let handle = app_handle.clone();
        async move {
            match message {
                Ok(msg) if msg.is_text() => {
                    let _ = handle.emit("ws:event", msg.to_text().unwrap_or(""));
                }
                Ok(msg) if msg.is_close() => {
                    let _ = handle.emit("ws:disconnected", ());
                }
                Err(e) => {
                    tracing::warn!("WebSocket error: {e}");
                }
                _ => {}
            }
        }
    })
    .await;

    Ok(())
}
