# NotifyHub

Self-hosted notification push service. A unified API for email, SMS, and (coming soon) app push notifications.

## Features

- 📧 **Email** — SMTP support with multiple provider fallback
- 📱 **SMS** — Twilio, Aliyun, Tencent Cloud SMS
- 🔔 **App Push** — Coming soon
- 🔄 **Retry** — Exponential backoff with dead letter queue
- 📊 **Admin Panel** — React-based web UI for management
- ⌨️ **CLI** — Command-line tool for quick sending
- 🔐 **Secure** — AES-256 encrypted credential storage
- 🐳 **Docker** — One-command deployment

## Quick Start

### Docker (Recommended)

```bash
cd deploy
cp .env.docker .env
# Edit .env to configure port, storage paths, and admin credentials
docker-compose up -d
```

Open `http://localhost:3000` and login with `admin` / `admin123`.

**Configuration** (edit `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Frontend port (exposed to host) |
| `DB_PATH` | `notifyhub-data` | Database storage (volume or host path) |
| `LOG_PATH` | `notifyhub-logs` | Logs storage (volume or host path) |
| `ADMIN_USERNAME` | `admin` | Admin username |
| `ADMIN_PASSWORD` | `admin123` | Admin password |

See [deploy/README.md](deploy/README.md) for detailed documentation.

### Manual Installation

```bash
# Install dependencies
pnpm install

# Build everything
pnpm build

# Start the server
cd packages/server
cp ../../.env.example .env
pnpm start
```

## Usage

### Web Admin Panel

After starting the server, open `http://localhost:3000` to access the admin panel.

1. **Configure a channel** — Add your SMTP server or SMS provider credentials
2. **Create an API token** — Generate a token for API access
3. **Send notifications** — Use the API or CLI to send messages

### API

```bash
# Send an email
curl -X POST http://localhost:3000/api/v1/send \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "to": "user@example.com",
    "subject": "Hello",
    "body": "<h1>Welcome!</h1>"
  }'

# Send a push notification with extended fields
curl -X POST http://localhost:3000/api/v1/send \
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
curl -X POST http://localhost:3000/api/v1/send \
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

# Check message status
curl http://localhost:3000/api/v1/messages/1 \
  -H "Authorization: Bearer nh_your_token_here"
```

### CLI

```bash
# Configure
npx notify-hub config set server http://localhost:3000
npx notify-hub config set token nh_your_token_here

# Send
npx notify-hub send --channel email --to user@example.com --body "Hello!"

# Send with extended fields
npx notify-hub send --channel push --to device-uuid \
  --subject "Alert" --body "CPU at 95%" \
  --tags alert,cpu --priority 90 \
  --url "https://monitor.example.com" --format markdown

# Check status
npx notify-hub status 1

# Start server
npx notify-hub serve --port 3000
```

## API Documentation

### Authentication

All API requests require a Bearer token:
```
Authorization: Bearer nh_your_token_here
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/send` | Send a notification |
| POST | `/api/v1/send/batch` | Send multiple notifications |
| GET | `/api/v1/messages/:id` | Get message status |
| GET | `/api/v1/messages` | List messages |
| POST | `/api/admin/login` | Admin login |
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

Create a `.env` file or set environment variables:

```env
PORT=3000
HOST=0.0.0.0
DATABASE_URL=./data/notify-hub.db
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-encryption-key
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (backend)
pnpm dev

# Start dev server (frontend)
pnpm dev:web

# Type check
pnpm typecheck

# Build all
pnpm build
```

## License

MIT
