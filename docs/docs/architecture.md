---
sidebar_position: 3
sidebar_label: 'Architecture'
---

# Architecture

This document describes NotifyHub's system architecture, database schema, message lifecycle, and key design decisions. It is intended for developers who want to understand how the system works internally or plan to extend it.

## High-Level Architecture

NotifyHub is a monorepo containing several components that work together:

```mermaid
flowchart TB
    subgraph Clients
        Web[React Admin Dashboard]
        CLI[Rust CLI]
        Ext[External Applications]
        Android[Android Client]
        Tauri[Tauri Desktop Client]
    end

    subgraph Server ["API Server (Rust + Axum)"]
        API[REST API Routes]
        Auth[Auth Middleware]
        Queue[Message Queue]
        Worker[Background Worker]
        Push[Push State (broadcast)]
    end

    subgraph Storage
        SQLite[(SQLite DB)]
        Files[data/uploads/]
    end

    subgraph Providers
        SMTP[SMTP Server]
        Twilio[Twilio API]
        Aliyun[Aliyun SMS API]
        Tencent[Tencent SMS API]
    end

    Web -->|JWT Auth| API
    CLI -->|API Key / JWT| API
    Ext -->|API Key| API
    Android -->|SSE/WS/Poll + JWT| API
    Tauri -->|SSE/WS/Poll + JWT| API
    API --> Auth
    Auth --> Queue
    Queue --> SQLite
    SQLite --> Worker
    Worker --> SMTP
    Worker --> Twilio
    Worker --> Aliyun
    Worker --> Tencent
    Worker --> Push
    Push --> Android
    Push --> Tauri
    API --> Files
```

## Request Flow

When a client sends a notification, the request passes through several stages before the message is delivered:

```mermaid
sequenceDiagram
    participant Client
    participant API as Axum API
    participant Auth as Auth Middleware
    participant Queue as Queue Manager
    participant DB as SQLite
    participant Worker as Queue Worker
    participant Adapter as Channel Adapter
    participant Provider as External Provider

    Client->>API: POST /api/v1/send
    API->>Auth: Validate API key
    Auth->>Auth: Check scopes, rate limit, IP whitelist
    Auth-->>API: Key valid
    API->>Queue: enqueue(message)
    Queue->>DB: INSERT INTO messages
    Queue-->>API: { messageId, status: "queued" }
    API-->>Client: 200 OK

    Note over Worker,DB: Background polling (every 1s)
    Worker->>DB: UPDATE ... RETURNING (atomic claim)
    DB-->>Worker: Claimed messages
    Worker->>DB: Get channel config (decrypted)
    Worker->>Adapter: adapter.send(config, payload)
    Adapter->>Provider: HTTP/SMTP request
    Provider-->>Adapter: Response
    Adapter-->>Worker: SendResult

    alt Success
        Worker->>DB: UPDATE status = 'sent'
    else Failure (retries remaining)
        Worker->>DB: UPDATE status = 'failed', nextRetryAt = ...
    else Failure (max retries exceeded)
        Worker->>DB: UPDATE status = 'dead'
    end
```

## Push Delivery Flow

When a message is sent to the `push` channel, the worker creates push messages and broadcasts them to connected clients in real-time. On Android, FCM provides an additional parallel delivery path.

```mermaid
sequenceDiagram
    participant Sender as API Client
    participant API as Axum API
    participant DB as SQLite
    participant Worker as Queue Worker
    participant PushState as PushState (broadcast)
    participant FCM as Firebase FCM
    participant Client as Push Client (SSE/WS/Poll)

    Sender->>API: POST /api/v1/send (channel: push)
    API->>DB: INSERT INTO messages (status="queued")

    Worker->>DB: Claim message (batch)
    Worker->>DB: Find target push_clients
    Worker->>DB: INSERT INTO push_messages (delivered=0)
    Worker->>FCM: Send data message (if fcm_token)
    Worker->>PushState: broadcast(msg) per client

    alt SSE/WS connected
        PushState-->>Client: Real-time via broadcast
    else Poll mode
        Client->>API: GET /api/user/push/poll
        API->>DB: SELECT undelivered push_messages
        API-->>Client: Messages array (auto-ACK)
    end

    Client->>API: POST /api/user/push/ack
    API->>DB: UPDATE delivered = 1
```

### Connection Modes

| Mode | Endpoint | Auth | Real-time | Notes |
|------|----------|------|-----------|-------|
| **SSE** | `GET /api/user/push/stream?uuid=&token=` | Query param or header | Yes | Unidirectional, 30s keep-alive |
| **WebSocket** | `GET /api/user/push/ws?uuid=&token=` | Query param | Yes | Bidirectional, ping/pong keepalive |
| **Poll** | `GET /api/user/push/poll?uuid=` | Header | No (5s interval) | Auto-ACK, compatible fallback |

JWT is validated at connection time. SSE/WS connections flush all undelivered messages on establishment before entering the real-time stream. On disconnect, clients reconnect with exponential backoff (5s → 120s).

:::tip Detailed docs
For the complete push delivery architecture including FCM integration, error handling, reconnection strategies, and client-specific behavior, see [Push Channel](/channels/push).
:::

## Message Lifecycle

Every message moves through a state machine from creation to terminal state:

```mermaid
stateDiagram-v2
    [*] --> queued : enqueue()
    queued --> sending : Worker claims batch
    sending --> sent : Delivery succeeded
    sending --> failed : Delivery error (retries left)
    sending --> dead : Delivery error (max retries exceeded)
    failed --> sending : Retry (nextRetryAt reached)
    failed --> dead : Max retries exceeded
    sent --> delivered : Provider confirms delivery
    sent --> [*]
    delivered --> [*]
    dead --> [*]
    dead --> queued : Manual retry
```

| Status | Description |
|--------|-------------|
| `queued` | Message is waiting to be processed. |
| `sending` | Worker has claimed the message and is attempting delivery. |
| `sent` | Message was successfully handed off to the provider. |
| `delivered` | Provider confirmed final delivery (not all providers support this). |
| `failed` | Delivery failed. Will be retried according to the backoff schedule. |
| `dead` | All retry attempts exhausted. Requires manual intervention. |

### Retry Strategy

Failed messages are retried with exponential backoff:

| Attempt | Delay | Cumulative Wait |
|---------|-------|-----------------|
| 1 | 1 second | 1s |
| 2 | 5 seconds | 6s |
| 3 | 30 seconds | 36s |
| 4 | 5 minutes | ~5.5 min |
| 5 | 30 minutes | ~35.5 min |

After 5 failed attempts, the message moves to the dead letter queue (`status = 'dead'`). You can manually retry dead messages from the dashboard or via the API.

## Database Schema

NotifyHub uses SQLite with sqlx. The database runs in WAL (Write-Ahead Logging) mode for better concurrent read performance. Migrations are applied automatically on server startup.

### Entity Relationship Diagram

```mermaid
erDiagram
    users {
        integer id PK
        text email UK
        text username
        text password "argon2/bcrypt hash"
        text role "admin | user"
        timestamp created_at
    }

    api_tokens {
        integer id PK
        integer user_id FK
        text name
        text token UK "nfkey_ prefixed"
        text scopes "JSON array"
        integer rate_limit "requests/min"
        text ip_whitelist "JSON array or null"
        boolean enabled
        timestamp last_used_at
        timestamp created_at
        timestamp expires_at
    }

    channels {
        integer id PK
        text type "email | sms"
        text name
        text config "AES-256-GCM encrypted JSON"
        boolean enabled
        boolean is_default
        timestamp created_at
        timestamp updated_at
    }

    templates {
        integer id PK
        text name UK
        text channel_type
        text subject
        text body "{{variable}} syntax"
        text variables "JSON descriptions"
        timestamp created_at
    }

    messages {
        text id PK "UUID"
        integer user_id FK
        text channel_type
        integer channel_id FK
        text to_address
        text subject
        text body
        integer template_id FK
        text template_vars "JSON"
        text status "queued|sending|sent|delivered|failed|dead"
        integer retry_count
        integer max_retries
        timestamp next_retry_at
        text error_message
        text idempotency_key UK
        timestamp scheduled_at
        timestamp sent_at
        timestamp created_at
        text tags "JSON array"
        integer priority "0-99"
        text url "optional link"
        text attachment "JSON {name,url?,data?}"
        text format "text|markdown|html|json"
    }

    users ||--o{ api_tokens : "owns"
    users ||--o{ messages : "sends"
    channels ||--o{ messages : "delivers"
    templates ||--o{ messages : "renders"
    users ||--o{ push_clients : "owns"
    push_clients ||--o{ push_messages : "receives"
    messages ||--o{ push_messages : "creates"

    push_clients {
        integer id PK
        integer user_id FK
        text uuid UK "client UUID"
        text name "display name"
        text os "android|windows|macos|linux"
        text arch "x86_64|aarch64"
        text desktop "GNOME|KDE|Windows|macOS"
        text app_version
        text fcm_token "Firebase Cloud Messaging token"
        text connection_mode "sse|ws|poll"
        timestamp last_seen_at
        timestamp registered_at
    }

    push_messages {
        integer id PK
        text source_message_id FK "original message"
        text client_uuid "target client UUID"
        integer user_id FK
        text title
        text body
        text level "info|warning|error|critical"
        boolean delivered
        text tags "JSON array"
        integer priority "0-99"
        text url "optional link"
        text attachment "JSON {name,url?,data?}"
        text format "text|markdown|html|json"
        text topic_id "optional topic grouping"
        timestamp created_at
    }
```

### Table Descriptions

**users** -- Stores admin and regular user accounts. Passwords are hashed with argon2 or bcrypt. The `role` field controls access: `admin` users can manage channels, tokens, and templates; `user` users have limited access.

**api_tokens** -- API tokens for the public send API. Each token has a set of scopes (channel types it can send to), a rate limit (requests per minute), and an optional IP whitelist. Tokens are prefixed with `nfkey_`.

**channels** -- Channel configurations (SMTP servers, SMS provider credentials). The `config` field stores JSON encrypted with AES-256-GCM. Each channel has a `type` (email, sms) and can be marked as the default for its type.

**templates** -- Reusable message templates. The `body` field supports `{{variable}}` syntax with optional default values (`{{name | default:"Guest"}}`). Templates are scoped to a channel type.

**messages** -- The message queue table. Messages are inserted with `status = 'queued'`, claimed atomically by the worker, and progress through the lifecycle states. Each message can carry extended metadata: `tags` (JSON array of labels), `priority` (0--99, higher = processed first), `url` (an associated link), `attachment` (JSON object with file name and URL or base64 data), and `format` (body rendering hint: text, markdown, html, json).

**push_clients** -- Registered push notification clients. Each client has a UUID, display name, OS info, and belongs to a user. The `fcm_token` field stores the Firebase Cloud Messaging token for Android devices. The `connection_mode` tracks the client's preferred transport (sse, ws, poll).

**push_messages** -- Queued push notifications. Created by the queue worker when a message targets the push channel. The `source_message_id` links back to the original message. `delivered` is set to `true` when the client acknowledges receipt via `POST /api/v1/push/ack` or when the poll endpoint returns the message.

## Directory Structure

```
notifyhub/
├── crates/               # Rust workspace
│   ├── common/                # Shared types, constants, error types
│   │   └── src/
│   │       ├── constants.rs   # Channel types, retry delays, JWT expiry
│   │       ├── schemas.rs     # Request/response schemas
│   │       ├── types.rs       # Shared types (ApiResponse, etc.)
│   │       └── error.rs       # AppError type
│   │
│   ├── server/                # API server (Axum + SQLite + sqlx)
│   │   └── src/
│   │       ├── auth/          # JWT, password hashing, middleware
│   │       ├── routes/        # API route handlers
│   │       │   ├── push.rs    # Push endpoints (poll, SSE, WS)
│   │       │   ├── send.rs    # Send API
│   │       │   ├── messages.rs # Message query API
│   │       │   └── admin.rs   # Admin routes
│   │       ├── worker/        # Queue worker, channel dispatchers
│   │       ├── db/            # Database init, migrations
│   │       ├── config.rs      # Environment config
│   │       └── main.rs        # Server entry point
│   │
│   └── cli/                   # CLI tool (clap)
│       └── src/
│           ├── commands/      # send, status, config commands
│           └── main.rs        # CLI entry point
│
├── web/                       # Admin dashboard (React + Vite + Tailwind)
│   └── src/
│       ├── components/        # Reusable UI components (shadcn/ui)
│       ├── lib/               # API client, utilities, i18n
│       └── pages/             # Dashboard, Channels, Tokens, Messages, etc.
│
├── desktop/                   # Desktop client (Tauri + Rust)
│   ├── src/
│   │   ├── api.rs             # API client (reqwest)
│   │   ├── config.rs          # Config file management
│   │   ├── messages.rs        # Local message store (JSON file)
│   │   ├── notify.rs          # Desktop notification bridge
│   │   ├── poll.rs            # Long-polling connection mode
│   │   ├── sse.rs             # SSE connection mode
│   │   ├── ws.rs              # WebSocket connection mode
│   │   └── main.rs            # Tauri app, tray menu, commands
│   └── ui/                    # Frontend (React + Vite)
│
├── android/                   # Android client (Kotlin + Jetpack Compose)
│   └── app/src/main/java/com/notifyhub/client/
│       ├── data/              # API client, models, message store, i18n
│       ├── service/           # PollService (SSE/WS/poll), FCM service
│       └── ui/                # Compose UI screens
│
├── docs/                      # Documentation site (Docusaurus)
├── deploy/                    # Docker deployment configs

```

## Key Design Decisions

### SQLite as Queue and Database

NotifyHub uses a single SQLite database for both application data and the message queue. This eliminates the need for a separate message broker (Redis, RabbitMQ) and simplifies deployment to a single process with a single data file.

SQLite in WAL mode handles concurrent reads efficiently. The worker uses a write transaction only when claiming messages and updating status, keeping lock contention minimal.

### Atomic Message Claiming

The worker claims messages using an `UPDATE ... RETURNING` pattern. This atomically transitions messages from `queued` (or `failed` with retry due) to `sending` in a single statement, preventing duplicate processing even if multiple workers were running.

### Rust Server with Axum

The server is built with Axum, a high-performance async HTTP framework for Rust. Benefits include:
- **Memory safety** without garbage collection
- **Zero-cost abstractions** for request handling
- **Compile-time SQL verification** via sqlx
- **Async I/O** with tokio for efficient concurrency
- **Single binary deployment** with no runtime dependencies

### Push State with Broadcast Channels

Real-time push delivery uses `tokio::sync::broadcast` channels. Each client UUID has a dedicated broadcast channel. When the queue worker creates a push message, it broadcasts to the target client's channel. SSE and WebSocket handlers subscribe to the channel and forward messages to connected clients.

This design decouples message production from delivery -- the worker doesn't need to know which clients are connected or how they're connected.

### Encrypted Channel Credentials

Channel configurations (SMTP passwords, API keys) are encrypted at the application level using AES-256-GCM before being written to the database. The encryption key is derived from the `JWT_SECRET` environment variable. This means that even if the SQLite file is compromised, the credentials remain protected.

### In-Memory Rate Limiting

Rate limiting uses an in-memory sliding window per API token. This is fast and sufficient for single-instance deployments. The rate limit is configured per token (default: 100 requests per minute) and enforced before the request reaches the handler.

:::note
If you scale NotifyHub to multiple instances, you would need to replace the in-memory rate limiter with a shared store (e.g., Redis). The current design assumes a single process.
:::

### Template Variable Syntax

The template engine uses `{{variable}}` double-brace syntax with optional default values:

```
Hello {{name | default:"Guest"}}, your order #{{orderId}} is ready.
```

Variables that are not provided and have no default value are left as-is (`{{variableName}}`), making it easy to spot unresolved placeholders during debugging.

### Client JWT with Long Expiry

Push client JWTs use a 90-day expiry (vs 24 hours for admin web login). This minimizes re-authentication for long-running desktop and Android clients. When a client's JWT expires, it automatically re-logs in using stored credentials and re-registers.
