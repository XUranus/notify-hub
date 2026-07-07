# ── Stage 1: Build frontend ──
FROM node:20-alpine AS frontend-builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @notify-hub/web...
COPY web web/
RUN cd web && pnpm build

# ── Stage 2: Build Rust server ──
FROM rust:1.88-bookworm AS server-builder
WORKDIR /app
COPY crates/ crates/
RUN cd crates && cargo build --release --bin notifyhub-server

# ── Stage 3: Production ──
FROM debian:bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/web/dist ./public

# Copy server binary
COPY --from=server-builder /app/crates/target/release/notifyhub-server ./notifyhub-server

# Data volume for database
VOLUME /app/data

# Environment variables
ENV DATA_DIR=/app/data
ENV PORT=9527
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:9527/api/health || exit 1

EXPOSE 9527
CMD ["./notifyhub-server"]
