---
sidebar_position: 2
sidebar_label: 'Getting Started'
---

# Getting Started

This guide walks you through installing NotifyHub, running it locally, and sending your first notification message.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js 18+** -- We recommend using the latest LTS release (Node.js 20+).
- **pnpm 9+** -- NotifyHub uses pnpm as its package manager. Install it with `corepack enable` or `npm install -g pnpm`.

:::tip
You can verify your versions by running:
```bash
node --version   # Should be v18.0.0 or higher
pnpm --version   # Should be 9.0.0 or higher
```
:::

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub
```

### 2. Install dependencies

```bash
pnpm install
```

This installs all dependencies for every package in the monorepo (`packages/shared`, `packages/server`, `packages/web`, `packages/cli`).

### 3. Configure environment variables

Copy the example environment file and edit it to suit your setup:

```bash
cp .env.example .env
```

Open `.env` in your editor. The key settings are:

```bash
# Server
PORT=9527
HOST=0.0.0.0
NODE_ENV=development

# Database (SQLite file path)
DATABASE_URL=./data/notify-hub.db

# Admin credentials (used on first run to create the admin user)
ADMIN_EMAIL=admin@notifyhub.local
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Security (auto-generated if left empty, but set them for persistence)
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-encryption-key-here

# CORS (use * for development, restrict in production)
CORS_ORIGIN=*
```

:::warning
In production, always set explicit `JWT_SECRET` and `ENCRYPTION_KEY` values. If left empty, NotifyHub generates random secrets on each restart, which invalidates all existing tokens and encrypted channel credentials.
:::

### 4. Run database migrations

```bash
pnpm db:migrate
```

This creates the SQLite database file and applies all schema migrations.

## First Run

### Start the API server

```bash
pnpm dev
```

You should see output like:

```
╔═══════════════════════════════════════════╗
║          NotifyHub v0.1.0                 ║
║───────────────────────────────────────────║
║  Server:  http://0.0.0.0:9527            ║
║  Mode:    development                     ║
║  API:     http://0.0.0.0:9527/api        ║
║  Health:  http://0.0.0.0:9527/health      ║
╚═══════════════════════════════════════════╝
```

### Start the frontend (in a separate terminal)

```bash
pnpm dev:web
```

The admin dashboard starts on `http://localhost:4321` (Vite dev server). In development, use port **4321** (not 9527) to access the web UI -- the Vite dev server proxies API requests to the backend.

### Log in to the dashboard

Open `http://localhost:4321` in your browser and log in with the default admin credentials:

| Field | Value |
|-------|-------|
| Email | `admin@notifyhub.local` |
| Password | `admin123` |

:::warning
Change the default admin password immediately after your first login, especially in production.
:::

## Send Your First Message

### Step 1: Create an API token

From the admin dashboard, navigate to **Tokens** and create a new API token. Alternatively, use the API directly:

```bash
# Log in and get a JWT
TOKEN=$(curl -s -X POST http://localhost:9527/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@notifyhub.local","password":"admin123"}' \
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

If you prefer to run NotifyHub in a container without installing Node.js locally:

### Using Docker Compose (recommended)

```bash
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub

# Start the service
docker compose -f deploy/docker-compose.yml up -d
```

The server starts on port 9527. The admin dashboard is served from the same port in production mode.

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
  -e ENCRYPTION_KEY=your-encryption-key \
  notifyhub
```

:::note
The Docker image uses a multi-stage build: it compiles the frontend and backend separately, then serves both from a single Node.js process. The SQLite database is stored in the `/app/data` volume.
:::

### Environment variables for Docker

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9527` | Server listen port |
| `NODE_ENV` | `production` | Runtime environment |
| `ADMIN_USERNAME` | `admin` | Default admin username |
| `ADMIN_PASSWORD` | `changeme` | Default admin password |
| `JWT_SECRET` | *(auto-generated)* | Secret for signing JWT tokens |
| `ENCRYPTION_KEY` | *(auto-generated)* | Key for encrypting channel credentials |
| `DATABASE_URL` | `/app/data/notify-hub.db` | SQLite database path |

## Next Steps

- **[Architecture](./architecture.md)** -- Understand how NotifyHub works under the hood.
- **[Channels](./channels/overview.md)** -- Set up email and SMS providers.
- **[Templates](./templates.md)** -- Create reusable message templates with variables.
- **[API Reference](./api/v1/send.md)** -- Explore the full REST API.
- **[Deployment](./deployment/docker.md)** -- Deploy NotifyHub to production.
