use clap::Parser;
use std::sync::Arc;

use bifrost_agentd::auth;
use bifrost_agentd::config::AgentConfig;
use bifrost_agentd::db::Database;
use bifrost_agentd::progress::ProgressBus;
use bifrost_agentd::runner::JobQueue;
use bifrost_agentd::server::router;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Parse configuration
    let config = AgentConfig::parse();

    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&config.log_level)),
        )
        .init();

    tracing::info!("Bifrost Agent v{} starting", env!("CARGO_PKG_VERSION"));
    tracing::info!("Data directory: {}", config.data_dir.display());
    tracing::info!("Bind address: {}", config.bind_addr());

    // Ensure directories exist
    config.ensure_dirs()?;

    // Initialize database
    let db = Database::open(&config)?;
    tracing::info!("Database opened at {}", config.db_path().display());

    // Get or create auth token
    let token = auth::get_or_create_token(&config.token_path())?;
    if config.token_path().exists() && token.len() == 64 {
        tracing::info!("Agent token loaded from {}", config.token_path().display());
    } else {
        tracing::info!("New agent token generated and saved");
        tracing::info!("Token (first 8 chars): {}...", &token[..8]);
    }

    let db = Arc::new(db);
    let progress = Arc::new(ProgressBus::new(256));
    let queue = Arc::new(JobQueue::new(
        db.clone(),
        progress.clone(),
        config.max_concurrent_jobs,
    ));

    // Build router
    let app = router::build_router(db.clone(), progress.clone(), queue.clone(), token);

    // Bind and serve
    let listener = tokio::net::TcpListener::bind(config.bind_addr()).await?;
    tracing::info!("Agent listening on {}", config.bind_addr());
    tracing::info!("Health check: http://{}/api/v1/health", config.bind_addr());

    axum::serve(listener, app).await?;

    Ok(())
}
