# NotifyHub Docker Deployment

## Quick Start

```bash
# Clone the repository
git clone <your-repo-url>
cd notifier/deploy

# Copy and edit configuration
cp .env.docker .env
# Edit .env with your preferred settings

# Start with Docker Compose
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

## Configuration

Edit `.env` file before starting:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Frontend port (exposed to host) |
| `DB_PATH` | `notifyhub-data` | Database storage (volume name or host path) |
| `LOG_PATH` | `notifyhub-logs` | Logs storage (volume name or host path) |
| `ADMIN_USERNAME` | `admin` | Admin username (first run only) |
| `ADMIN_PASSWORD` | `admin123` | Admin password (first run only) |
| `ADMIN_EMAIL` | `admin@notifyhub.local` | Admin email (first run only) |
| `JWT_SECRET` | (auto) | JWT secret (auto-generated if not set) |

### Using Host Paths for Storage

To store data on the host filesystem instead of Docker volumes:

```env
DB_PATH=/path/to/your/data
LOG_PATH=/path/to/your/logs
```

### Using Docker Volumes (Default)

By default, Docker volumes are used:

```env
DB_PATH=notifyhub-data
LOG_PATH=notifyhub-logs
```

## Access

- **Web UI**: http://localhost:3000
- **API**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/health

## Commands

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Rebuild and start
docker-compose up -d --build

# Backup database
docker-compose exec notifyhub cp /app/data/notify-hub.db /app/data/backup.db
```

## Architecture

- **Frontend**: React SPA served as static files
- **Backend**: Hono API server
- **Database**: SQLite (stored in `/app/data`)
- **Logs**: Console output (collected by Docker)

Only port 3000 is exposed. The backend API and frontend are served on the same port.

## Data Persistence

- **Database**: Stored in `/app/data/notify-hub.db`
- **Logs**: Stored in `/app/logs/`

Both are mounted as Docker volumes or host paths for persistence.

## Security Notes

1. Change `ADMIN_PASSWORD` before first run
2. Set a strong `JWT_SECRET` for production
3. Use HTTPS in production (add a reverse proxy like Nginx)
4. Restrict port access to trusted networks
