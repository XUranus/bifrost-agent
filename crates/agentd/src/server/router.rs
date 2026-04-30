use axum::{
    routing::get,
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tower_http::validate_request::ValidateRequestHeaderLayer;

use crate::api;
use crate::db::Database;
use crate::progress::ProgressBus;
use crate::runner::JobQueue;
use crate::server::ws;

/// Shared application state available to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub progress: Arc<ProgressBus>,
    pub queue: Arc<JobQueue>,
}

/// Build the complete axum Router for the agent.
pub fn build_router(
    db: Arc<Database>,
    progress: Arc<ProgressBus>,
    queue: Arc<JobQueue>,
    token: String,
) -> Router {
    let state = AppState {
        db,
        progress: progress.clone(),
        queue,
    };

    // Authenticated API routes (auth layer applied here, not at top level)
    let api_routes = Router::new()
        .nest("/assets", api::assets::router())
        .nest("/sla-policies", api::slas::router())
        .nest("/jobs", api::jobs::router())
        .nest("/backup-copies", api::copies::router())
        .nest("/browse", api::browse::router())
        .nest("/restore", api::restore::router())
        .nest("/agent", api::agent::router())
        .layer(ValidateRequestHeaderLayer::bearer(&token))
        .with_state(state.clone());

    // WebSocket route (auth applied too)
    let ws_route = Router::new()
        .route("/ws/events", get(ws::ws_upgrade))
        .layer(ValidateRequestHeaderLayer::bearer(&token))
        .with_state(state.clone());

    // Public health route (no auth)
    let health_route = Router::new()
        .route("/api/v1/health", get(api::agent::health))
        .with_state(state.clone());

    // Combine: public health + auth-protected API + WS
    Router::new()
        .merge(health_route)
        .nest("/api/v1", api_routes)
        .merge(ws_route)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}
