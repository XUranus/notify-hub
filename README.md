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
- ⌨️ **CLI** — Rust CLI for quick sending and status checks
- 🔐 **Secure** — AES-256 encrypted credential storage, JWT auth, bcrypt passwords
- 🐳 **Docker** — One-command deployment

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
cd rust-server
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
cd rust-server
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

### Push Clients

**Desktop (Tauri):**
- Supports SSE, WebSocket, and long-polling connection modes
- System tray with connection status, unread count, and reconnect
- Desktop notifications with sound
- Auto-download image attachments
- Auto-reconnect with JWT refresh on expiry

**Android:**
- Supports SSE, WebSocket, and long-polling
- Firebase Cloud Messaging (FCM) for background delivery
- Material Design 3 UI with dark mode
- i18n support (English, Chinese)
- Auto-download image attachments

## Project Structure

```
notifyhub/
├── rust-server/               # Rust workspace
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
└── .env.example               # Environment variable template
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
| GET | `/api/v1/messages/:id` | Get message status |
| POST | `/api/auth/login` | Admin login (returns JWT) |
| GET | `/api/v1/push/poll` | Poll for push messages |
| GET | `/api/v1/push/stream` | SSE stream for push messages |
| GET | `/api/v1/push/ws` | WebSocket for push messages |
| POST | `/api/v1/push/register` | Register a push client |
| POST | `/api/v1/push/ack` | Acknowledge received messages |
| GET | `/api/admin/stats/overview` | Get statistics |
| CRUD | `/api/admin/channels` | Manage channels |
| CRUD | `/api/admin/tokens` | Manage API tokens |
| CRUD | `/api/admin/templates` | Manage templates |

### Send Request

```json
{
  "channel": "email | sms | push",
  "to": "recipient",
  "subject": "optional subject",
  "body": "message body",
  "template": "template_name",
  "variables": { "key": "value" },
  "idempotency_key": "unique-key",
  "scheduled_at": "2026-06-20T10:00:00Z",
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

## License

MIT
