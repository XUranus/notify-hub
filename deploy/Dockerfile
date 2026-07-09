# ── Build Rust server ──
FROM rust:1.88-bookworm AS builder
WORKDIR /app
COPY crates/ crates/
RUN cd crates && cargo build --release --bin notifyhub-server

# ── Production server (internal, no exposed port) ──
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/crates/target/release/notifyhub-server ./notifyhub-server
VOLUME /app/data
ENV DATA_DIR=/app/data
ENV PORT=9527
ENV HOST=0.0.0.0
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:9527/api/health || exit 1
# Not exposed — nginx proxies to this container internally
CMD ["./notifyhub-server"]
