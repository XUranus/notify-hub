# NotifyHub

Self-hosted notification push service. A unified API for email, SMS, and push notifications.

## Features

- 📧 **Email** — SMTP support with multiple provider fallback
- 📱 **SMS** — Twilio, Aliyun, Tencent Cloud SMS
- 🔔 **Push** — Real-time push via SSE, WebSocket, or long-polling
- 🖥️ **Desktop** — Tauri desktop client with system tray, notifications, and auto-reconnect
- 📲 **Android** — Native Android client with Firebase Cloud Messaging support
- 🔄 **Retry** — Exponential backoff with dead letter queue
- 📊 **Admin Panel** — React-based web UI for management
- ⌨️ **CLI** — Rust CLI for quick sending and listening
- 🔐 **Secure** — AES-256 encrypted credential storage, JWT auth, bcrypt passwords, dual auth (JWT + API Key)
- 🐳 **Docker** — One-command deployment
- 📎 **Attachments** — File upload/download with image preview
- 🌐 **i18n** — English, Chinese, Japanese, Korean

## Architecture

```
┌─────────────┐     ┌─────────────────────────────────────┐
│  Web Admin  │────▶│                                     │
│  (React)    │     │     Rust Server (Axum + SQLite)     │
├─────────────┤     │                                     │
│  CLI (Rust) │────▶│  ┌─────────┐  ┌──────────────────┐  │
├─────────────┤     │  │  Queue   │  │  Channel Workers │  │
│  Desktop    │────▶│  │  Worker  │─▶│  - SMTP (Email)  │  │
│  (Tauri)    │     │  └─────────┘  │  - Twilio (SMS)  │  │
├─────────────┤     │               │  - Aliyun (SMS)   │  │
│  Android    │────▶│               │  - Push (SSE/WS)  │  │
└─────────────┘     └───────────────┴──────────────────┘  │
                                                │         │
                    ┌───────────────────────────┘         │
                    ▼                                      │
              ┌──────────┐     ┌──────────┐               │
              │ SMTP/SDK │     │ Push DB  │◀──────────────┘
              └──────────┘     └──────────┘
```

**Push delivery** supports three modes:
- **SSE** (Server-Sent Events) — Real-time, unidirectional stream
- **WebSocket** — Real-time, bidirectional
- **Long-Polling** — Compatible fallback for restricted networks

## Quick Start

### Docker (Recommended)

```bash
cd deploy
cp .env.docker .env
# Edit .env to configure port, storage paths, and admin credentials
docker-compose up -d
```

Open `http://localhost:9527` and login with `admin` / `admin123`.

**Configuration** (edit `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9527` | Server listen port |
| `DB_PATH` | `notifyhub-data` | Database storage (volume or host path) |
| `LOG_PATH` | `notifyhub-logs` | Logs storage (volume or host path) |
| `ADMIN_USERNAME` | `admin` | Admin username |
| `ADMIN_PASSWORD` | `admin123` | Admin password |
| `JWT_SECRET` | *(auto)* | Secret for signing JWT tokens |

See [deploy/README.md](deploy/README.md) for detailed documentation.

### Manual Installation

**Prerequisites:** Rust 1.75+, pnpm 9+

```bash
# Build the Rust server + CLI
cd crates
cargo build --release

# Start the server
./target/release/notifyhub-server

# In another terminal, build the web frontend
cd web
pnpm install && pnpm build
# Serve from the server's static files directory, or use a reverse proxy
```

### Development

```bash
# Start the Rust server with hot-reload
cd crates
cargo watch -x run

# Start the web frontend dev server (proxies API to :9527)
cd web
pnpm dev
# Open http://localhost:4321
```

## Usage

### Web Admin Panel

After starting the server, open `http://localhost:9527` (or `http://localhost:4321` in dev mode) to access the admin panel.

1. **Configure a channel** — Add your SMTP server or SMS provider credentials
2. **Create an API token** — Generate a token for API access
3. **Send notifications** — Use the API or CLI to send messages
4. **Register push clients** — Install the desktop or Android app to receive push notifications

### API

```bash
# Send an email
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "to": "user@example.com",
    "subject": "Hello",
    "body": "<h1>Welcome!</h1>"
  }'

# Send a push notification with extended fields
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "push",
    "to": "device-uuid",
    "subject": "Deploy Alert",
    "body": "**Build #1234** deployed successfully.",
    "tags": ["deploy", "production"],
    "priority": 80,
    "url": "https://dashboard.example.com/deploy/1234",
    "format": "markdown"
  }'

# Send using template
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "to": "user@example.com",
    "template": "order_shipped",
    "variables": {
      "order_id": "12345",
      "name": "John"
    }
  }'
```

### CLI

```bash
# Configure
notify-hub config set server http://localhost:9527
notify-hub config set token nh_your_token_here

# Send
notify-hub send --channel email --to user@example.com --body "Hello!"

# Send with extended fields
notify-hub send --channel push --to device-uuid \
  --subject "Alert" --body "CPU at 95%" \
  --tags alert,cpu --priority 90 \
  --url "https://monitor.example.com" --format markdown

# Check status
notify-hub status 1
```

### Topics

Topics categorize messages. Preset topics (claudecode, codex, openclaw, opencode) come with icons.

```bash
# List topics
curl http://localhost:9527/api/v1/topic \
  -H "Authorization: Bearer nh_your_token_here"

# Create a topic (fork from preset)
curl -X POST http://localhost:9527/api/v1/topic \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-alerts",
    "displayName": "My Alerts",
    "description": "Custom alert topic",
    "forkFrom": "<preset-topic-id>"
  }'

# Send to a topic
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "push",
    "to": "*",
    "subject": "Alert",
    "body": "CPU at 95%",
    "topic": "my-alerts"
  }'
```

### Push Clients

**Desktop (Tauri):**
- Supports SSE, WebSocket, and long-polling connection modes
- System tray with connection status, unread count, and reconnect
- Desktop notifications with sound
- Auto-download image attachments
- Auto-reconnect with JWT refresh on expiry
- Image attachment preview with lightbox zoom
- Debounced notification batching (3s silence window)
- Backup & restore messages

**Android:**
- Supports SSE, WebSocket, and long-polling
- Firebase Cloud Messaging (FCM) for background delivery
- Material Design 3 UI with dark mode
- i18n support (English, Chinese, Japanese, Korean)
- Auto-download image attachments
- Notification debouncing and grouping
- Keep-alive strategies (WorkManager, boot receiver, task removed)
- Configurable connection mode and FCM settings

## Project Structure

```
notifyhub/
├── crates/               # Rust workspace
│   ├── common/                # Shared types, constants, error types
│   ├── server/                # API server (Axum + SQLite + sqlx)
│   │   └── src/
│   │       ├── auth/          # JWT, password hashing, middleware
│   │       ├── routes/        # API route handlers
│   │       ├── worker/        # Queue worker, channel dispatchers
│   │       └── main.rs        # Server entry point
│   └── cli/                   # CLI tool (clap)
│       └── src/
│           ├── commands/      # send, status, config commands
│           └── main.rs        # CLI entry point
│
├── web/                       # Admin dashboard (React + Vite + Tailwind)
│   └── src/
│       ├── components/        # Reusable UI components (shadcn/ui)
│       ├── lib/               # API client, utilities, i18n
│       └── pages/             # Dashboard, Channels, Tokens, Messages, etc.
│
├── desktop/                   # Desktop client (Tauri + Rust)
│   ├── src/
│   │   ├── api.rs             # API client
│   │   ├── poll.rs            # Long-polling connection
│   │   ├── sse.rs             # SSE connection
│   │   ├── ws.rs              # WebSocket connection
│   │   ├── messages.rs        # Local message store
│   │   ├── notify.rs          # Desktop notifications
│   │   └── main.rs            # Tauri app + system tray
│   └── ui/                    # Frontend (React + Vite)
│
├── android/                   # Android client (Kotlin + Jetpack Compose)
│   └── app/src/main/java/com/notifyhub/client/
│       ├── data/              # API client, models, message store
│       ├── service/           # PollService (SSE/WS/poll), FCM
│       └── ui/                # Compose UI screens
│
├── docs/                      # Documentation site (Docusaurus)
├── deploy/                    # Docker deployment configs

```

## API Documentation

### Authentication

**JWT** — Used by web admin and push clients:
```
Authorization: Bearer <jwt_token>
```

**API Token** — Used by external integrations:
```
Authorization: Bearer nh_<token>
```

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/send` | Send a notification |
| POST | `/api/v1/send/batch` | Send multiple notifications |
| GET | `/api/v1/messages` | List messages |
| GET | `/api/v1/messages/:id` | Get message status |
| GET | `/api/v1/topic` | List topics |
| POST | `/api/v1/topic` | Create topic (supports `forkFrom`) |
| GET | `/api/v1/topic/:id` | Get topic |
| PUT | `/api/v1/topic/:id` | Update topic |
| DELETE | `/api/v1/topic/:id` | Delete topic |
| POST | `/api/auth/login` | Login (returns JWT) |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/user/push/poll` | Poll for push messages |
| GET | `/api/user/push/stream` | SSE stream for push messages |
| GET | `/api/user/push/ws` | WebSocket for push messages |
| POST | `/api/user/push/register` | Register a push client |
| POST | `/api/user/push/ack` | Acknowledge received messages |
| GET | `/api/user/stats/overview` | Get statistics |
| CRUD | `/api/user/tokens` | Manage API tokens |
| CRUD | `/api/user/topics` | Manage topics (with fork) |
| CRUD | `/api/admin/channels` | Manage channels |
| CRUD | `/api/admin/templates` | Manage templates |
| CRUD | `/api/admin/users` | Manage users |

### Send Request

```json
{
  "channel": "email | sms | push",
  "to": "recipient",
  "subject": "optional subject",
  "body": "message body",
  "template": "template_name",
  "variables": { "key": "value" },
  "idempotencyKey": "unique-key",
  "scheduledAt": "2026-06-20T10:00:00Z",
  "tags": ["deploy", "production"],
  "priority": 80,
  "url": "https://example.com",
  "delay": "30m",
  "attachment": { "name": "file.txt", "url": "https://example.com/file.txt" },
  "format": "text | markdown | html | json"
}
```

## Configuration

Server configuration via environment variables or `.env` file:

```env
PORT=9527
HOST=0.0.0.0
DATA_DIR=./data
DATABASE_URL=./data/notifyhub.db
JWT_SECRET=your-secret-key
CORS_ORIGIN=*
FCM_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

## What's New in v0.2.0

### 🔐 DualAuth — API Key + JWT
All `/api/v1/*` endpoints now accept both JWT and API Key (`nh_...` prefix) in the `Authorization: Bearer` header. External integrations can use long-lived API keys without JWT refresh.

### 📎 Attachments & Image Preview
- File upload/download support with quota management
- Desktop: inline image preview in message detail with lightbox zoom
- Batch delete with ownership validation

### 🛡️ Security Hardening
- `/uploads/*` routes now support token-based authentication
- Download endpoints enforce ownership checks
- Defense-in-depth path traversal protection
- Error messages no longer leak internal details
- CORS respects configured `CORS_ORIGIN`

### 📲 Android Improvements
- FCM data message push with keep-alive strategies
- Notification debouncing and grouping
- Configurable connection mode (SSE/WS/Poll)
- 4-language i18n (EN, ZH, JA, KO)

### 🖥️ Desktop Improvements
- Image attachment preview with full-screen lightbox
- Skeleton loading states for all tables
- Responsive table layouts
- Notification debounce batching

### 📊 Web Admin
- Responsive tables with horizontal scroll
- Skeleton loading states
- Extracted shared components (PushClients, ChannelForm, QR dialog)
- Accessibility improvements (aria-labels, keyboard navigation)

### 📚 Documentation
- Push channel architecture documentation (EN/ZH)
- Multi-language API examples (curl, JS, Python, Go, PHP, Rust)
- Complete `/api/v1` conventions and error codes

## License

MIT
