# ── Stage 1: Build frontend ──
FROM node:20-alpine AS frontend-builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY web/package.json web/
COPY shared/package.json shared/
RUN pnpm install --frozen-lockfile --filter @notify-hub/web...
COPY shared shared/
COPY web web/
RUN cd web && pnpm build

# ── Stage 2: Build backend ──
FROM node:20-alpine AS backend-builder
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN apk add --no-cache python3 make g++ # for better-sqlite3
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY server/package.json server/
COPY shared/package.json shared/
RUN pnpm install --frozen-lockfile --filter @notify-hub/server...
COPY shared shared/
COPY server server/
RUN cd shared && pnpm build
RUN cd server && pnpm build

# ── Stage 3: Production ──
FROM node:20-alpine AS production
WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/web/dist ./public

# Copy the full node_modules (with workspace symlinks) and server artifacts
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/server ./server
COPY --from=backend-builder /app/shared ./shared
COPY --from=backend-builder /app/package.json ./
COPY --from=backend-builder /app/pnpm-workspace.yaml ./
COPY --from=backend-builder /app/pnpm-lock.yaml ./
COPY --from=backend-builder /app/server/drizzle ./drizzle

# Data volume for database
VOLUME /app/data

# Logs volume
VOLUME /app/logs

# Environment variables
ENV DATABASE_URL=/app/data/notify-hub.db
ENV NODE_ENV=production
ENV PORT=9527

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9527/health || exit 1

EXPOSE 9527
CMD ["node", "server/dist/index.js"]
