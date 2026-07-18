# NotifyHub Docker Deployment

## Architecture

Production deployment uses **nginx as reverse proxy** with a single public-facing port:

```
                          ┌──────────────────────────┐
                          │      Public Internet      │
                          └────────────┬─────────────┘
                                       │ :80 (or 443)
                          ┌────────────▼─────────────┐
                          │         Nginx             │
                          │  • Static frontend files  │
                          │  • /api/* → backend       │
                          │  • /ws    → backend       │
                          └──┬───────────────────┬────┘
                             │ /api, /ws         │ /
                       ┌─────▼─────┐      ┌─────▼──────┐
                       │  Backend   │      │  Frontend   │
                       │  (Rust)   │      │  (React)    │
                       │  :9527    │      │  static     │
                       │ internal  │      │  files      │
                       └─────┬─────┘      └────────────┘
                             │
                       ┌─────▼─────┐
                       │  SQLite    │
                       │ Host Path  │
                       │ /opt/.../  │
                       └───────────┘
```

**Key rule:** Only nginx exposes a port to the host. The backend (Rust) is internal-only, accessed via Docker's internal network.

## Quick Start

```bash
cd deploy

# Copy and edit configuration
cp .env.docker .env
# Edit .env with your preferred settings

# Full deploy (build frontend + Docker images + start)
./deploy.sh

# Or step by step:
./deploy.sh build    # Build frontend + Docker images
./deploy.sh start    # Start containers
```

## Commands

| Command | Description |
|---------|-------------|
| `./deploy.sh` | Full deploy (build + start) |
| `./deploy.sh build` | Build frontend and Docker images only |
| `./deploy.sh start` | Start containers |
| `./deploy.sh stop` | Stop containers |
| `./deploy.sh restart` | Restart containers |
| `./deploy.sh logs` | Tail logs |
| `./deploy.sh status` | Show container status |

## Configuration

Environment variables (edit `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `NGINX_PORT` | `80` | Public-facing port (nginx) |
| `DB_PATH` | `/opt/notifyhub/data` | Data directory on host (database, uploads, attachments) |
| `JWT_SECRET` | *(auto-generated)* | Secret for signing JWT tokens. **Must set explicitly for production.** |

## Configuration Reference

### Items You Must / Should Configure

| Item | File | What to Change |
|------|------|----------------|
| **Public port** | `.env` | `NGINX_PORT` — the only exposed port. Default `80`, change to `8080`, `443`, etc. as needed |
| **JWT secret** | `.env` | `JWT_SECRET` — **required for production**. Set a strong random string. Auto-generated if omitted (not safe for multi-instance) |
| **Data storage path** | `.env` | `DB_PATH` — host directory for database, uploads, attachments. Default `/opt/notifyhub/data` |
| **Domain name** | `nginx.conf` | `server_name` — change from `_` (match all) to your actual domain (e.g. `notify.example.com`) |
| **Firewall** | VPS provider | Open `NGINX_PORT` in your firewall / security group |
| **HTTPS** (optional) | `nginx.conf` | Add SSL certificate paths and redirect HTTP → HTTPS |

### Items with Sensible Defaults (No Changes Needed)

| Item | Default | Description |
|------|---------|-------------|
| Backend internal port | `9527` | Not exposed. Nginx proxies to it via Docker network |
| API proxy | `/api/*` → `backend:9527` | Handled by Docker internal DNS |
| WebSocket proxy | `/ws` → `backend:9527` | Upgrade headers + 24h timeout configured |
| Uploaded files proxy | `/uploads/*` → `backend:9527` | 7-day cache |
| Static asset caching | JS/CSS/images 30 days | `Cache-Control: public, immutable` |
| Gzip compression | Enabled | Text, JSON, JS, CSS, SVG |
| Health checks | 30s interval, 3 retries | Both nginx and backend have health checks |
| Auto-restart | `unless-stopped` | Containers restart on crash or reboot |
| SPA fallback | `try_files $uri /index.html` | All routes fall back to React router |

## Nginx Configuration

The nginx config (`nginx.conf`) handles:

- **`/`** → Serves frontend static files (React SPA)
- **`/api/*`** → Proxies to Rust backend
- **`/ws`** → WebSocket proxy (with upgrade headers)
- **`/uploads/*`** → Proxies uploaded file access
- **`/nginx-health`** → Nginx health check

### Adding HTTPS

1. Obtain SSL certificates (Let's Encrypt, etc.)
2. Mount certificates into nginx container
3. Update `nginx.conf` with SSL server block
4. Change `NGINX_PORT` to `443`

```yaml
# In docker-compose.yml, add to nginx volumes:
- /path/to/cert.pem:/etc/ssl/cert.pem:ro
- /path/to/key.pem:/etc/ssl/key.pem:ro
```

## Docker Compose Services

| Service | Description | Exposed Port |
|---------|-------------|-------------|
| `nginx` | Reverse proxy + static files | `80` (configurable) |
| `backend` | Rust API server | **None** (internal only) |

## Development vs Production

| | Development | Production |
|---|---|---|
| Frontend | Vite dev server (`:4321`) | Nginx static files (`:80`) |
| Backend | `cargo run` (`:3000`) | Docker container (internal `:9527`) |
| API proxy | Vite dev proxy | Nginx reverse proxy |
| Hot reload | ✅ | ❌ (rebuild required) |

## Data Persistence

All data is stored on the host filesystem (not inside the container):

| Data | Host Path | Container Path |
|------|-----------|----------------|
| Database | `${DB_PATH}/notifyhub.db` | `/app/data/notifyhub.db` |
| Uploads | `${DB_PATH}/uploads/` | `/app/data/uploads/` |
| Attachments | `${DB_PATH}/` | `/app/data/` |

Default `DB_PATH` is `/opt/notifyhub/data`. This makes backup and migration straightforward — just copy the directory.

## Backup & Migration

### Backup

```bash
# Backup everything (database + uploads + attachments)
tar czf notifyhub-backup-$(date +%Y%m%d).tar.gz -C /opt/notifyhub/data .

# Or just the database
cp /opt/notifyhub/data/notifyhub.db ./notifyhub-backup.db
```

### Restore

```bash
# Extract backup to data directory
tar xzf notifyhub-backup-YYYYMMDD.tar.gz -C /opt/notifyhub/data/

# Restart to pick up restored data
cd /opt/notifyhub/deploy && docker compose restart backend
```

### Migrate to New Server

```bash
# ── Old server ──
# 1. Stop the backend (optional, ensures clean DB state)
ssh old-server "cd /opt/notifyhub/deploy && docker compose stop backend"

# 2. Backup
ssh old-server "tar czf /tmp/notifyhub-data.tar.gz -C /opt/notifyhub/data ."
scp old-server:/tmp/notifyhub-data.tar.gz .

# ── New server ──
# 3. Install
git clone <repo> /opt/notifyhub
cd /opt/notifyhub/deploy
cp .env.docker .env   # Edit as needed

# 4. Restore data
mkdir -p /opt/notifyhub/data
tar xzf notifyhub-data.tar.gz -C /opt/notifyhub/data/

# 5. Deploy
./deploy.sh
```

## Troubleshooting

```bash
# Check container status
docker compose ps

# View backend logs
docker compose logs backend

# View nginx logs
docker compose logs nginx

# Health check
curl http://localhost:80/api/health

# Rebuild after code changes
./deploy.sh
```
