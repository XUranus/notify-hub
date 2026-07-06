---
sidebar_position: 2
sidebar_label: 'Getting Started'
---

# Getting Started

This guide walks you through installing NotifyHub, running it locally, and sending your first notification message.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Rust 1.75+** -- Install via [rustup.rs](https://rustup.rs/).
- **pnpm 9+** -- For the web frontend. Install with `corepack enable` or `npm install -g pnpm`.

:::tip
You can verify your versions by running:
```bash
rustc --version   # Should be 1.75.0 or higher
pnpm --version    # Should be 9.0.0 or higher
```
:::

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub
```

### 2. Build the Rust server and CLI

```bash
cd rust-server
cargo build --release
```

This produces two binaries:
- `target/release/notifyhub-server` -- The API server
- `target/release/notifyhub` -- The CLI tool

### 3. Build the web frontend

```bash
cd web
pnpm install
pnpm build
```

The built frontend files go to `web/dist/`. In production, the Rust server serves these as static files.

### 4. Configure environment variables

Create a `.env` file in the `rust-server/` directory:

```bash
cd rust-server
cat > .env << 'EOF'
PORT=9527
HOST=0.0.0.0
DATA_DIR=./data
JWT_SECRET=your-secret-key-change-me
CORS_ORIGIN=*
EOF
```

:::warning
In production, always set an explicit `JWT_SECRET`. If left empty, NotifyHub generates a random secret on each restart, which invalidates all existing tokens.
:::

## First Run

### Start the API server

```bash
cd rust-server
./target/release/notifyhub-server
```

You should see output like:

```
2026-07-06T12:00:00Z  INFO notifyhub_server: Starting NotifyHub server on 0.0.0.0:9527
2026-07-06T12:00:00Z  INFO notifyhub_server::db: Database initialized at ./data/notifyhub.db
2026-07-06T12:00:00Z  INFO notifyhub_server::db: Applied 18 database migrations
2026-07-06T12:00:00Z  INFO notifyhub_server: Server ready
```

The database is created automatically on first run.

### Start the frontend (development mode)

```bash
cd web
pnpm dev
```

The admin dashboard starts on `http://localhost:4321` (Vite dev server). In development, the Vite dev server proxies API requests to the Rust backend on port 9527.

### Log in to the dashboard

Open `http://localhost:4321` (or `http://localhost:9527` in production) in your browser and log in with the default admin credentials:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

:::warning
Change the default admin password immediately after your first login, especially in production.
:::

## Send Your First Message

### Step 1: Create an API token

From the admin dashboard, navigate to **Tokens** and create a new API token. Alternatively, use the CLI:

```bash
# Configure the CLI
./target/release/notifyhub config set server http://localhost:9527
./target/release/notifyhub config set username admin
./target/release/notifyhub config set password admin123

# Login and save JWT
./target/release/notifyhub login
```

Or use the API directly:

```bash
# Log in and get a JWT
TOKEN=$(curl -s -X POST http://localhost:9527/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"admin","password":"admin123"}' \
  | jq -r '.data.token')

# Create an API token
curl -s -X POST http://localhost:9527/api/admin/tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app","scopes":["email","sms","push"]}'
```

The response includes the token string (prefixed with `nh_`). Save it -- you will need it to send messages.

### Step 2: Create a channel

Create an email channel with your SMTP credentials:

```bash
curl -s -X POST http://localhost:9527/api/admin/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "name": "my-smtp",
    "config": {
      "provider": "smtp",
      "host": "smtp.example.com",
      "port": 587,
      "secure": false,
      "username": "your@email.com",
      "password": "your-password",
      "fromAddress": "noreply@example.com",
      "fromName": "NotifyHub"
    },
    "isDefault": true
  }'
```

:::tip
Channel credentials are encrypted with AES-256-GCM before being stored in the database. Your SMTP password is never stored in plaintext.
:::

### Step 3: Send a message

Use your API token to send a notification:

```bash
curl -s -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "to": "recipient@example.com",
    "subject": "Hello from NotifyHub",
    "body": "<h1>Welcome!</h1><p>This is your first notification.</p>"
  }'
```

A successful response:

```json
{
  "success": true,
  "data": {
    "messageId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued"
  }
}
```

The message enters the queue and the background worker picks it up within seconds. You can monitor its status through the dashboard or via the messages API.

## Docker Quick Start

If you prefer to run NotifyHub in a container without installing Rust locally:

### Using Docker Compose (recommended)

```bash
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub

# Start the service
docker compose -f deploy/docker-compose.yml up -d
```

The server starts on port 9527. The admin dashboard is served from the same port.

### Using Docker directly

```bash
# Build the image
docker build -f deploy/Dockerfile -t notifyhub .

# Run the container
docker run -d \
  --name notifyhub \
  -p 9527:9527 \
  -v notifyhub-data:/app/data \
  -e ADMIN_PASSWORD=your-secure-password \
  -e JWT_SECRET=your-jwt-secret \
  notifyhub
```

### Environment variables for Docker

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9527` | Server listen port |
| `ADMIN_USERNAME` | `admin` | Default admin username |
| `ADMIN_PASSWORD` | `changeme` | Default admin password |
| `JWT_SECRET` | *(auto-generated)* | Secret for signing JWT tokens |
| `DATA_DIR` | `/app/data` | Data directory (database, uploads) |

## Development Setup

For development with hot-reload:

```bash
# Terminal 1: Rust server with hot-reload
cd rust-server
cargo install cargo-watch
cargo watch -x run

# Terminal 2: Web frontend with API proxy
cd web
pnpm dev
# Opens http://localhost:4321, proxies API to :9527

# Terminal 3: Desktop client (optional)
cd desktop
cargo run
```

## Next Steps

- **[Architecture](./architecture.md)** -- Understand how NotifyHub works under the hood.
- **[Channels](./channels/overview.md)** -- Set up email and SMS providers.
- **[Templates](./templates.md)** -- Create reusable message templates with variables.
- **[API Reference](./api/v1/send.md)** -- Explore the full REST API.
- **[Deployment](./deployment/docker.md)** -- Deploy NotifyHub to production.
