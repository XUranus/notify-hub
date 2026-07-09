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
                       │  Volume    │
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
| `DB_PATH` | `notifyhub-data` | Database storage (Docker volume name or host path) |
| `JWT_SECRET` | *(auto-generated)* | Secret for signing JWT tokens. Set explicitly for production. |

### Using Host Paths for Storage

```env
DB_PATH=/path/to/your/data
```

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

- **Database**: `/app/data/notifyhub.db` (Docker volume `notifyhub-data`)
- **Uploads**: `/app/data/uploads/`

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
