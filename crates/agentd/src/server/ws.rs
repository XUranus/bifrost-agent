use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};

use crate::server::router::AppState;

/// Handle WebSocket upgrade requests.
pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let progress = state.progress.clone();
    ws.on_upgrade(move |socket| handle_ws(socket, progress))
}

async fn handle_ws(socket: WebSocket, progress: std::sync::Arc<crate::progress::ProgressBus>) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to progress events
    let mut rx = progress.subscribe();

    // Send a welcome message
    let welcome = serde_json::json!({
        "event": "connected",
        "message": "WebSocket connection established"
    });
    let _ = sender
        .send(Message::Text(serde_json::to_string(&welcome).unwrap_or_default()))
        .await;

    // Spawn task that forwards progress events to the WebSocket
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let json = serde_json::to_string(&event).unwrap_or_default();
                    if sender.send(Message::Text(json)).await.is_err() {
                        break; // Client disconnected
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("WS client lagged by {n} messages");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Read loop: handle incoming messages (ping/pong, client close)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Close(_) = msg {
                break;
            }
        }
    });

    // If either task exits, abort the other
    tokio::select! {
        _ = (&mut send_task) => { recv_task.abort(); }
        _ = (&mut recv_task) => { send_task.abort(); }
    }
}
