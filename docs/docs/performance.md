---
sidebar_position: 15
---

# Performance & Capacity Planning

## Stress Test Results

### Test Environment

- Single-node deployment, SQLite backend
- Server: 4-core x86_64 Linux, 2GB RAM
- Worker: batch_size=100, poll_interval=200ms

### API Write Throughput

| Test | Messages | Concurrency | Success | Duration | Rate |
|------|----------|-------------|---------|----------|------|
| Sequential Burst | 100 | 1 | 100% | 257ms | **388 msg/s** |
| Concurrent Burst | 200 | 20 | 100% | 588ms | **343 msg/s** |
| Rapid Fire | 500 | 30 | 100% | 1401ms | **337 msg/s** |
| Sustained Load | 1000 | 1 (rate-limited) | 100% | 20s | **50 msg/s** |

**API write capacity: ~350 msg/s with zero failures.**

### Delivery Reliability

| Metric | Value |
|--------|-------|
| Messages sent | 2,800 |
| Delivered | **2,800 (100%)** |
| Failed | 0 |
| Push undelivered | 0 |
| Queue backlog | 0 |

**Zero message loss under full load.**

### Per-Mode Delivery (SSE / Poll / WS)

Each mode tested with 500 messages, 20 concurrent senders:

| Mode | API Rate | Delivery | Listener Receive | Backlog |
|------|----------|----------|-----------------|---------|
| SSE | 410 msg/s | 100% | 100% | 0 |
| Poll | 419 msg/s | 100% | 100% | 0 |
| WS | 392 msg/s | 100% | 100% | 0 |

All three transport modes achieve identical reliability after worker optimization.

### Processing Latency

| Metric | Before Optimization | After Optimization |
|--------|--------------------|--------------------|
| Worker throughput | 10 msg/s | **500 msg/s** |
| Average latency | 67.3s | **< 1s** |
| Max latency | 131s | **< 5s** |
| Queue backlog (1800 msgs) | 1460 (81%) | **0 (0%)** |

---

## Memory Usage

### Per-Connection Cost (Measured)

| Connection Type | Persistent Memory | Notes |
|----------------|------------------|-------|
| SSE | ~100 KB | Stream state + TCP buffer + broadcast receiver |
| WebSocket | ~100 KB | WS frame state + TCP buffer + broadcast receiver |
| Poll | ~0 KB | Stateless, memory released after response |
| PushState channel | ~12 KB | Per client_uuid, shared across connections |

### Base Server Memory

| Component | Memory |
|-----------|--------|
| Tokio runtime (4 cores) | 8-20 MB |
| SQLite pool (10 conns) | 20 MB |
| Router + middleware | ~100 KB |
| LogBroadcaster | 24 KB |
| **Total base** | **~28 MB** |

### 2GB Server Capacity

| Scenario | Max Clients | Memory Used |
|----------|------------|-------------|
| Pure SSE/WS | **12,000** | 1.2 GB |
| Pure Poll | **100,000+** | ~300 MB |
| Mixed (30% long-lived) | **40,000** | ~700 MB |
| Mixed (10% long-lived) | **100,000+** | ~400 MB |

### Broadcast Throughput vs Connection Count

| Connections | Single Broadcast | Max msg/s |
|-------------|-----------------|-----------|
| 1,000 | < 5ms | 200+ |
| 5,000 | < 20ms | 100+ |
| 10,000 | < 50ms | 50+ |
| 15,000 | < 100ms | 30+ |

---

## Optimization Guide

### P0: SQLite Page Cache

Reduce per-connection page cache to save memory:

```sql
-- In db/mod.rs or at server startup
PRAGMA cache_size = -500;  -- 500 KB per connection (default: 2000 KB)
```

Saves **15 MB** with 10 connections.

### P0: Connection Limit

Prevent OOM by limiting concurrent SSE/WS connections:

```rust
// Add to AppState
pub connection_semaphore: Arc<tokio::sync::Semaphore>,
```

Recommended: 15,000 for 2GB server.

### P1: Broadcast Channel Capacity

Reduce from 256 to 64 slots:

```rust
let (tx, _) = broadcast::channel(64);  // was 256
```

Saves ~9 KB per connected client_uuid. For 10,000 clients: **90 MB saved**.

### P1: Config Clone Elimination

Replace per-request Config clone with Arc:

```rust
// Before: req.extensions_mut().insert(cfg.as_ref().clone());
// After:
req.extensions_mut().insert(Arc::clone(&cfg));
```

Saves ~300 bytes per HTTP request.

### System Tuning

```bash
# Increase file descriptor limit
ulimit -n 65535

# /etc/sysctl.conf
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
```

---

## Worker Tuning

The worker processes queued messages in batches. Key parameters in `crates/common/src/constants.rs`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `WORKER_BATCH_SIZE` | 100 | Messages per batch |
| `WORKER_POLL_INTERVAL_MS` | 200 | Sleep between batches when idle |
| `RETRY_DELAYS` | [1, 5, 30, 300, 1800] | Exponential backoff (seconds) |

When a full batch is processed, the worker immediately checks for more (no sleep).

### Tuning for Higher Throughput

```rust
// For high-throughput scenarios (1000+ msg/s)
pub const WORKER_BATCH_SIZE: i64 = 500;
pub const WORKER_POLL_INTERVAL_MS: u64 = 100;
```

### Tuning for Lower Latency

```rust
// For low-latency scenarios (< 100ms delivery)
pub const WORKER_BATCH_SIZE: i64 = 50;
pub const WORKER_POLL_INTERVAL_MS: u64 = 50;
```

---

## Benchmarks Summary

| Metric | Value |
|--------|-------|
| API write throughput | **350 msg/s** |
| Worker processing | **500 msg/s** |
| Delivery reliability | **100%** |
| Memory per connection | **~100 KB** |
| Max connections (2GB) | **12,000 SSE/WS** |
| Max poll clients (2GB) | **100,000+** |
| Single broadcast (10K conns) | **< 50ms** |
