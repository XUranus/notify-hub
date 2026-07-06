# NotifyHub Docker Deployment

## Quick Start

```bash
# From the repository root
cd deploy

# Copy and edit configuration
cp .env.docker .env
# Edit .env with your preferred settings

# Start with Docker Compose
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

The server starts on port **9527** by default. Open `http://localhost:9527` to access the admin dashboard.

## Configuration

Environment variables (edit `.env` or set directly):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9527` | Server listen port |
| `DB_PATH` | `notifyhub-data` | Database storage (Docker volume name or host path) |
| `JWT_SECRET` | *(auto-generated)* | Secret for signing JWT tokens. Set explicitly for production. |

### Using Host Paths for Storage

To store data on the host filesystem instead of Docker volumes:

```env
DB_PATH=/path/to/your/data
```

### Using Docker Volumes (Default)

By default, a Docker volume named `notifyhub-data` is used.

## Commands

```bash
# Start
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f

# Restart
docker compose restart

# Rebuild and start (after code changes)
docker compose up -d --build

# Backup database
docker compose exec notifyhub cp /app/data/notifyhub.db /app/data/backup.db
```

## Architecture

```
┌─────────────────────────────────┐
│         Docker Container        │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Rust Server (Axum)      │  │
│  │   - Serves API + static   │  │
│  │   - SQLite database       │  │
│  └───────────────────────────┘  │
│                                 │
│  /app/public/  ← Web frontend   │
│  /app/data/    ← SQLite + uploads│
└─────────────────────────────────┘
         │ port 9527
```

- **Frontend**: React SPA served as static files by the Rust server
- **Backend**: Rust API server (Axum)
- **Database**: SQLite (stored in `/app/data`)

Only port 9527 is exposed. The backend API and frontend are served on the same port.

## Data Persistence

- **Database**: Stored in `/app/data/notifyhub.db`
- **Uploads**: Stored in `/app/data/uploads/`

Both are mounted as a Docker volume for persistence.

## Security Notes

1. Set a strong `JWT_SECRET` for production
2. Use HTTPS in production (add a reverse proxy like Nginx or Caddy)
3. Restrict port access to trusted networks
