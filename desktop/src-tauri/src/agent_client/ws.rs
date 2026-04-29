//! WebSocket client for real-time agent events.

use tauri::AppHandle;
use tokio_tungstenite::connect_async;
use futures_util::StreamExt;

/// Connect to the agent's WebSocket event stream and emit Tauri events.
pub async fn connect_ws(
    agent_url: &str,
    token: &str,
    app_handle: AppHandle,
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

    let handle = app_handle.clone();
    read.for_each(|message| {
        let handle = handle.clone();
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

/// Required for tokio_tungstenite's connect_async.
mod http {
    pub use http::*;
}
