---
sidebar_position: 1
---

# NotifyHub Documentation

**NotifyHub** is a self-hosted notification push service designed for developers who need reliable, multi-channel message delivery without relying on third-party SaaS platforms. It provides a unified API for sending emails, SMS, and push notifications -- all from your own infrastructure.

## Key Features

- **Multi-channel delivery** -- Send notifications via Email (SMTP), SMS (Twilio, Aliyun SMS, Tencent Cloud SMS), and Push (long-polling) through a single API.
- **Push clients** -- Native Android, Tauri (desktop), and web clients that receive notifications in real-time via long-polling. Auto-reconnect, offline mode, and image auto-download.
- **File attachments** -- Upload files via the API, attach them to messages. Clients can preview and download images, PDFs, and other files.
- **Template engine** -- Define message templates with `{{variable}}` syntax and default values. Reuse templates across channels.
- **Reliable queue** -- SQLite-backed message queue with atomic claiming, exponential backoff retry (1s, 5s, 30s, 5min, 30min), and dead letter support.
- **Secure by default** -- AES-256-GCM encryption for channel credentials, bcrypt password hashing, JWT authentication, and per-token rate limiting.
- **Multi-user** -- Role-based access control with admin and user roles. Email-based login with JWT sessions.
- **API token management** -- Create scoped tokens with configurable rate limits and IP whitelists for the public API.
- **Self-hosted** -- SQLite database with WAL mode. No external dependencies beyond your chosen channel providers.
- **Modern web UI** -- React-based admin dashboard with dark mode, built on Tailwind CSS and shadcn/ui.

## Architecture Overview

NotifyHub follows a straightforward architecture: clients send messages through the REST API, the server enqueues them, and a background worker processes the queue by dispatching messages through the appropriate channel adapters.

```mermaid
flowchart LR
    Client([Client / API Consumer]) -->|POST /api/v1/send| API[Hono API Server]
    API -->|Enqueue| Queue[(SQLite Queue)]
    Queue -->|Poll & Claim| Worker[Queue Worker]
    Worker -->|Dispatch| Adapters{Channel Adapters}
    Adapters -->|SMTP| Email[Email Provider]
    Adapters -->|Twilio| SMS1[Twilio SMS]
    Adapters -->|Aliyun| SMS2[Aliyun SMS]
    Adapters -->|Tencent| SMS3[Tencent SMS]
    Adapters -->|Insert| PushDB[(Push Messages)]

    WebUI[React Admin Dashboard] -->|JWT Auth| API
    Android[Android Client] -->|Long-Poll| API
    Tauri[Tauri Desktop Client] -->|Long-Poll| API
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **API Server** | Hono (Node.js) | Lightweight, fast HTTP framework |
| **Database** | SQLite + Drizzle ORM | Embedded database with type-safe queries |
| **Frontend** | React + Vite + Tailwind CSS | Admin dashboard with shadcn/ui components |
| **CLI** | Commander.js | Command-line interface for NotifyHub |
| **Auth** | JWT + bcrypt | Token-based auth with secure password storage |
| **Encryption** | AES-256-GCM | Credential encryption at rest |
| **Email** | Nodemailer | SMTP transport for email delivery |
| **SMS** | Twilio / Aliyun / Tencent SDKs | Multi-provider SMS delivery |
| **Validation** | Zod | Runtime schema validation |
| **Logging** | Pino | Structured JSON logging |

## Quick Links

- **[Getting Started](./getting-started.md)** -- Install and run NotifyHub in 5 minutes.
- **[Architecture](./architecture.md)** -- Deep dive into system design, database schema, and message lifecycle.
- **[API Reference](./api/v1/send.md)** -- REST API documentation for sending messages.
- **[Channels](./channels/overview.md)** -- Configure email and SMS channel providers.
- **[Templates](./templates.md)** -- Create reusable message templates.
- **[Deployment](./deployment/docker.md)** -- Deploy NotifyHub with Docker or on a VPS.
- **[Development](./development.md)** -- Contribute to the project or extend its functionality.
