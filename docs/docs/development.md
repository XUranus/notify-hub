---
sidebar_position: 4
sidebar_label: 'Development'
---

# Development

This guide covers everything you need to know to develop NotifyHub locally, extend its functionality, and follow project conventions.

## Development Setup

### Prerequisites

- **Rust 1.75+** -- Install via [rustup.rs](https://rustup.rs/)
- **pnpm 9+** -- For the web frontend and docs
- **cargo-watch** -- For hot-reload during development (`cargo install cargo-watch`)

### Getting started

```bash
# Clone
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub

# Copy environment config
cd crates
# Create .env with your settings

# Start the API server with hot reload
cargo watch -x run

# In another terminal, start the frontend
cd web
pnpm install
pnpm dev
```

The API server runs on `http://localhost:9527`. The frontend runs on `http://localhost:4321` with Vite HMR and proxies API requests to the backend.

:::info Port Architecture
- **9527** -- Rust API server (Axum)
- **4321** -- Vite dev server (frontend), proxies `/api`, `/uploads`, and WebSocket/SSE to port 9527

When accessing the web dashboard in development, always use port **4321**. The Vite dev server proxies API requests to the backend.
:::

## Project Structure

NotifyHub is organized as a multi-component monorepo:

| Component | Path | Language | Description |
|-----------|------|----------|-------------|
| Server | `crates/server/` | Rust | Axum API server, SQLite database, message queue, channel workers |
| Common | `crates/common/` | Rust | Shared types, constants, error types |
| CLI | `crates/cli/` | Rust | Command-line tool for sending messages |
| Web | `web/` | TypeScript/React | Admin dashboard (Vite + Tailwind + shadcn/ui) |
| Desktop | `desktop/` | Rust + TypeScript | Tauri desktop client with system tray |
| Android | `android/` | Kotlin | Native Android client with Jetpack Compose |
| Docs | `docs/` | TypeScript | Documentation site (Docusaurus) |

### Rust workspace

The `crates/` directory is a Cargo workspace with three crates:

```toml
[workspace]
members = ["common", "server", "cli"]
default-members = ["server"]
```

- **common** -- Shared types used by both server and CLI (`ChannelType`, `MessageStatus`, `ApiResponse`, etc.)
- **server** -- The main API server binary
- **cli** -- The CLI binary

## Key Commands

### Rust server

```bash
cd crates

# Run the server
cargo run

# Run with hot-reload
cargo watch -x run

# Build release binary
cargo build --release

# Run tests
cargo test

# Check compilation without building
cargo check

# Run the CLI
cargo run --bin notifyhub -- --help
```

### Web frontend

```bash
cd web

# Install dependencies
pnpm install

# Start dev server (port 4321, proxies to :9527)
pnpm dev

# Build for production
pnpm build

# Type check
pnpm tsc --noEmit
```

### Desktop client

```bash
cd desktop

# Run in development mode
cargo tauri dev

# Build release binary
cargo tauri build
```

## Adding a New Channel Adapter

Channel adapters implement the `send` function in `crates/server/src/worker/channels.rs`. Each adapter handles one delivery method.

### Step 1: Add the provider module

Create a new function in `channels.rs` (or a new file in `worker/`) for your provider:

```rust
// crates/server/src/worker/channels.rs

async fn send_myprovider(
    config: &serde_json::Value,
    to: &str,
    body: &str,
) -> Result<SendResult, String> {
    let api_key = config["apiKey"].as_str().ok_or("missing apiKey")?;
    let sender = config["sender"].as_str().ok_or("missing sender")?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.myprovider.com/v1/sms")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "to": to,
            "from": sender,
            "text": body,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }

    Ok(SendResult { success: true, external_id: None })
}
```

### Step 2: Register in the dispatch logic

Add a match arm for your provider in the channel dispatch function:

```rust
"myprovider" => send_myprovider(&config, &to, &body).await,
```

### Step 3: Update the web UI

Add your provider to the channel configuration form in `web/src/pages/Channels.tsx` so users can configure it through the dashboard.

## Adding a New API Route

### Step 1: Create the route handler

Create a new file in `crates/server/src/routes/`:

```rust
// crates/server/src/routes/myresource.rs

use axum::{Json, Router, routing::get};
use crate::AppState;
use crate::auth::middleware::AuthUser;
use notifyhub_common::error::AppError;
use notifyhub_common::types::ApiResponse;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/myresource", get(list_myresource))
}

async fn list_myresource(
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, AppError> {
    // ... fetch and return resources
    Ok(Json(ApiResponse::ok(vec![])))
}
```

### Step 2: Register the router

Add the module and register its router in `crates/server/src/routes/mod.rs`:

```rust
mod myresource;

// In the combined router function:
.merge(myresource::router())
```

### Auth middleware reference

| Middleware | Description | Use for |
|-----------|-------------|---------|
| `AuthUser` | Extracts and validates JWT from `Authorization: Bearer <jwt>` header. Provides `claims` with user info. | Any authenticated route |
| `DualAuth` | Accepts both JWT and API tokens. For routes accessible by both admin users and external integrations. | Public API routes |
| `extract_auth()` | Helper that tries Authorization header, then `?token=` query param. Used for SSE/WS endpoints. | Long-lived connections |

## Code Style and Conventions

### Rust

- Use `rustfmt` for formatting (`cargo fmt`).
- Use `clippy` for linting (`cargo clippy`).
- Prefer `impl Trait` over boxed trait objects for return types.
- Use `thiserror` for error types, `anyhow` for application-level error handling in the CLI.
- Use `serde` with `#[serde(rename_all = "camelCase")]` for JSON serialization.
- Use `sqlx` compile-time checked queries where possible.

### TypeScript (web frontend)

- Use `type` for object shapes and `interface` for contracts that may be extended.
- Prefer `const` assertions and literal types over enums.
- Use ESM (`import`/`export`) throughout.

### Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Rust files | snake_case | `rate_limit.rs`, `my_resource.rs` |
| Rust functions | snake_case | `enqueue()`, `process_message()` |
| Rust types | PascalCase | `ChannelAdapter`, `MessagePayload` |
| Rust constants | SCREAMING_SNAKE_CASE | `RETRY_DELAYS`, `WORKER_BATCH_SIZE` |
| JSON fields | camelCase | `clientUuid`, `createdAt` |
| Database tables | snake_case | `push_clients`, `api_tokens` |
| API paths | kebab-case | `/api/v1/push/register` |

### Error handling

- Use `AppError` enum for API errors. It implements `IntoResponse` and returns structured JSON.
- Use `Result<T, AppError>` as the return type for all route handlers.
- Log errors with `tracing::error!()` with context.

### Validation

- Validate request bodies using serde deserialization with `#[serde(default)]` for optional fields.
- Use `validator` crate for complex validation rules.
- Return `AppError::BadRequest` for validation failures.

## Client Development

### Desktop (Tauri)

The desktop client is a Tauri app with a Rust backend and React frontend:

- `desktop/src/` -- Rust code: API client, connection modes (poll/sse/ws), message store, notifications, tray menu
- `desktop/ui/` -- React frontend: message list, settings, compose

**Connection modes**: The desktop supports SSE, WebSocket, and long-polling. The mode is persisted in the config file and can be changed at runtime via `set_connection_mode`.

**System tray**: Shows connection status, unread count, and provides Show/Reconnect/Quit actions. Status and unread count are updated dynamically from the frontend.

**JWT handling**: Client JWTs expire after 90 days. When a 401 is received, the client automatically re-logs in with stored credentials and re-registers.

### Android

The Android client is a Kotlin app with Jetpack Compose:

- `android/app/src/main/java/com/notifyhub/client/data/` -- API client, models, message store, i18n
- `android/app/src/main/java/com/notifyhub/client/service/` -- PollService (SSE/WS/poll), FCM service
- `android/app/src/main/java/com/notifyhub/client/ui/` -- Compose screens

**Firebase Cloud Messaging**: The Android client supports FCM for background push delivery. Configure `google-services.json` and the server's `FCM_SERVICE_ACCOUNT_PATH` environment variable.

**Connection modes**: Same as desktop -- SSE, WebSocket, or long-polling. Mode is persisted in SharedPreferences.

## Common Pitfalls

### Vite Proxy and WebSocket/SSE

The Vite dev server proxies WebSocket and SSE connections to the backend. Ensure `ws: true` is set in the proxy config:

```typescript
// web/vite.config.ts
proxy: {
  '/api': {
    target: 'http://localhost:9527',
    changeOrigin: true,
    ws: true,  // Required for WebSocket proxy
  },
},
```

### SQLite WAL Mode

The server enables WAL mode on the SQLite database for better concurrent read performance. If you encounter "database is locked" errors, ensure no other process has the database open in exclusive mode.

### JWT Secret Persistence

If `JWT_SECRET` is not set, the server generates a random secret on each restart. This invalidates all existing tokens. Always set `JWT_SECRET` in production or when you need tokens to persist across restarts.

### Push Message Format

Push messages sent from the server use camelCase JSON fields (`clientUuid`, `createdAt`, `topicId`). The `tags` field is a raw JSON string (e.g., `"[]"`), not a parsed array. Client-side deserialization expects `Option<String>` for these fields.
