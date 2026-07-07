mod auth;
mod config;
mod db;
mod log_broadcast;
mod routes;
mod worker;

use axum::extract::Request;
use axum::middleware::{self, Next};
use axum::Router;
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::prelude::*;

use config::Config;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub config: Arc<Config>,
    pub push_state: routes::push::PushState,
    pub log_broadcaster: log_broadcast::LogBroadcaster,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing with broadcast layer for SSE log streaming
    let log_broadcaster = log_broadcast::LogBroadcaster::new();
    let broadcast_layer = log_broadcast::BroadcastLayer::new(log_broadcaster.clone());

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| "notifyhub_server=info,tower_http=info".into()),
                ),
        )
        .with(broadcast_layer)
        .init();

    let config = Config::from_env();
    let bind_addr = config.bind_addr();
    tracing::info!("Starting NotifyHub server on {bind_addr}");

    // Initialize database
    let pool = db::init(&config).await?;

    // Seed default admin user
    seed_admin(&pool).await?;

    let state = AppState {
        pool,
        config: Arc::new(config),
        push_state: routes::push::PushState::new(),
        log_broadcaster,
    };

    // Middleware to inject Config into request extensions for auth extractors
    let config_clone = state.config.clone();
    let app = Router::new()
        .merge(routes::admin::router())
        .merge(routes::send::router())
        .merge(routes::messages::router())
        .merge(routes::push::router())
        .merge(routes::clients::router())
        .merge(routes::topics::router())
        .merge(routes::channels::router())
        .merge(routes::templates::router())
        .merge(routes::tokens::router())
        .merge(routes::users::router())
        .merge(routes::stats::router())
        .merge(routes::upload::router())
        .merge(routes::attachments::router())
        .merge(routes::user_settings::router())
        .merge(routes::system_settings::router())
        .merge(routes::cleanup_logs::router())
        .merge(routes::logs::router())
        .merge(routes::health::router())
        .layer(middleware::from_fn(move |mut req: Request, next: Next| {
            let cfg = config_clone.clone();
            async move {
                req.extensions_mut().insert(cfg.as_ref().clone());
                next.run(req).await
            }
        }))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    // Start background workers
    let pool_clone = state.pool.clone();
    let config_clone2 = state.config.clone();
    let push_state_clone = state.push_state.clone();
    tokio::spawn(async move {
        worker::queue::start(pool_clone, config_clone2, push_state_clone).await;
    });

    let pool_clone = state.pool.clone();
    let config_clone3 = state.config.clone();
    tokio::spawn(async move {
        worker::cleanup::start(pool_clone, config_clone3).await;
    });

    // Periodically clean up stale push broadcast channels
    {
        let push_state = state.push_state.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                push_state.cleanup_stale().await;
            }
        });
    }

    // Start server
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("Listening on {bind_addr}");
    axum::serve(listener, app).await?;

    Ok(())
}

/// Seed default admin user if none exists
async fn seed_admin(pool: &SqlitePool) -> anyhow::Result<()> {
    use notifyhub_common::constants::{DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD};

    // Seed admin_users table (legacy)
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM admin_users")
        .fetch_one(pool)
        .await?;

    if count.0 == 0 {
        let hash = auth::password::hash_password(DEFAULT_ADMIN_PASSWORD)?;
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO admin_users (username, password, created_at) VALUES (?, ?, ?)",
        )
        .bind(DEFAULT_ADMIN_USERNAME)
        .bind(&hash)
        .bind(now)
        .execute(pool)
        .await?;
        tracing::info!("[init] Created default admin user (admin_users): {DEFAULT_ADMIN_USERNAME}");
    }

    // Also seed users table (used for JWT login)
    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(pool)
        .await?;

    if user_count.0 == 0 {
        let hash = auth::password::hash_password(DEFAULT_ADMIN_PASSWORD)?;
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO users (id, email, username, password, role, created_at) VALUES (99999999, ?, ?, ?, 'admin', ?)",
        )
        .bind("admin@notifyhub.local")
        .bind(DEFAULT_ADMIN_USERNAME)
        .bind(&hash)
        .bind(now)
        .execute(pool)
        .await?;
        tracing::info!("[init] Created default admin user (users): {DEFAULT_ADMIN_USERNAME}");
    }

    Ok(())
}
