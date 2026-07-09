#!/bin/bash
# NotifyHub Production Deployment Script
# Usage: ./deploy.sh [build|start|stop|restart|logs|status]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIST="$SCRIPT_DIR/frontend-dist"

cmd="${1:-deploy}"

build_frontend() {
    echo "→ Building frontend..."
    cd "$PROJECT_ROOT"
    docker run --rm -v "$(pwd):/app" -w /app node:20-alpine sh -c \
        "corepack enable && corepack prepare pnpm@9 --activate && pnpm install --frozen-lockfile --filter @notify-hub/web... && cd web && pnpm build"
    rm -rf "$FRONTEND_DIST"
    cp -r "$PROJECT_ROOT/web/dist" "$FRONTEND_DIST"
    echo "→ Frontend built → $FRONTEND_DIST"
}

build_docker() {
    echo "→ Building Docker images..."
    cd "$SCRIPT_DIR"
    docker compose build backend
    docker compose build nginx
    echo "→ Docker images built"
}

deploy() {
    build_frontend
    build_docker
    cd "$SCRIPT_DIR"
    docker compose up -d
    echo "→ Deployed! Checking health..."
    sleep 3
    docker compose ps
}

case "$cmd" in
    build)
        build_frontend
        build_docker
        ;;
    deploy|"")
        deploy
        ;;
    start)
        cd "$SCRIPT_DIR" && docker compose up -d
        ;;
    stop)
        cd "$SCRIPT_DIR" && docker compose down
        ;;
    restart)
        cd "$SCRIPT_DIR" && docker compose restart
        ;;
    logs)
        cd "$SCRIPT_DIR" && docker compose logs -f
        ;;
    status)
        cd "$SCRIPT_DIR" && docker compose ps
        ;;
    *)
        echo "Usage: $0 {build|deploy|start|stop|restart|logs|status}"
        exit 1
        ;;
esac
