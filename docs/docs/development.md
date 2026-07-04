---
sidebar_position: 4
sidebar_label: 'Development'
---

# Development

This guide covers everything you need to know to develop NotifyHub locally, extend its functionality, and follow project conventions.

## Development Setup

### Prerequisites

- **Node.js 18+** (20+ recommended)
- **pnpm 9+**
- A code editor with TypeScript support (VS Code recommended)

### Getting started

```bash
# Clone and install
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub
pnpm install

# Copy environment config
cp .env.example .env

# Run database migrations
pnpm db:migrate

# Start the API server (with hot reload)
pnpm dev

# In another terminal, start the frontend
pnpm dev:web
```

The API server runs on `http://localhost:9527` with `tsx watch` for automatic restarts on file changes. The frontend runs on `http://localhost:4321` with Vite HMR.

:::info Port Architecture
- **9527** — Hono API server (backend)
- **4321** — Vite dev server (frontend), proxies `/api` and `/uploads` to port 9527

When accessing the web dashboard in development, always use port **4321**. The Vite dev server proxies API requests to the backend.
:::

## Project Structure

NotifyHub is a pnpm monorepo with four packages:

| Package | Path | Description |
|---------|------|-------------|
| `@notify-hub/shared` | `packages/shared` | Shared types, Zod schemas, and constants. Used by all other packages. |
| `@notify-hub/server` | `packages/server` | Hono API server, SQLite database, message queue, and channel adapters. |
| `@notify-hub/web` | `packages/web` | React admin dashboard built with Vite, Tailwind CSS, and shadcn/ui. |
| `@notify-hub/cli` | `packages/cli` | Command-line interface for sending messages and managing NotifyHub. |

### Dependency flow

```
shared  <--  server
shared  <--  web
shared  <--  cli
```

The `shared` package has zero runtime dependencies (only `zod` as a peer dependency). All other packages depend on `shared` but not on each other.

## Key Commands

All commands are run from the repository root:

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the API server with hot reload (`tsx watch`) |
| `pnpm dev:web` | Start the frontend dev server (Vite) |
| `pnpm build` | Build all packages |
| `pnpm build:server` | Build the server package only |
| `pnpm build:web` | Build the frontend package only |
| `pnpm build:cli` | Build the CLI package only |
| `pnpm lint` | Run linting across all packages |
| `pnpm typecheck` | Run TypeScript type checking across all packages |
| `pnpm db:generate` | Generate Drizzle migration files from schema changes |
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm db:push` | Push schema directly to the database (development only) |

### Database workflow

When you modify the Drizzle schema (`packages/server/src/db/schema.ts`):

```bash
# 1. Generate a migration file
pnpm db:generate

# 2. Review the generated SQL in packages/server/drizzle/

# 3. Apply the migration
pnpm db:migrate
```

:::tip
Use `pnpm db:push` during rapid prototyping to apply schema changes without generating migration files. Switch to `db:generate` + `db:migrate` before committing.
:::

## Adding a New Channel Adapter

Channel adapters implement the `ChannelAdapter` interface from `@notify-hub/shared`. Each adapter handles one delivery method (e.g., a specific SMS provider).

### Step 1: Define the adapter

Create a new file in `packages/server/src/channel/`. For example, to add a new SMS provider:

```typescript
// packages/server/src/channel/sms/myprovider.ts

import type { ChannelAdapter, SendResult, MessagePayload } from '@notify-hub/shared'

export const myProviderAdapter: ChannelAdapter = {
  type: 'sms',
  name: 'myprovider',

  async send(config: Record<string, unknown>, msg: MessagePayload): Promise<SendResult> {
    try {
      // Use config to authenticate with your provider
      const apiKey = config.apiKey as string
      const sender = config.sender as string

      // Call the provider's API
      const response = await fetch('https://api.myprovider.com/v1/sms', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: msg.to,
          from: sender,
          text: msg.body,
        }),
      })

      const data = await response.json() as { id?: string; error?: string }

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `API error: ${response.status}`,
        }
      }

      return {
        success: true,
        externalId: data.id,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },

  async test(config: Record<string, unknown>): Promise<boolean> {
    // Verify the configuration is valid (e.g., test API key)
    try {
      const apiKey = config.apiKey as string
      const response = await fetch('https://api.myprovider.com/v1/account', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      return response.ok
    } catch {
      return false
    }
  },
}
```

### Step 2: Register the adapter

Add the adapter to `packages/server/src/channel/index.ts`:

```typescript
import { myProviderAdapter } from './sms/myprovider.js'

export function registerBuiltinAdapters() {
  // ... existing adapters
  registerAdapter(myProviderAdapter)
}
```

### Step 3: Update shared constants

Add your provider name to `packages/shared/src/constants.ts`:

```typescript
export const SMS_PROVIDERS = ['twilio', 'aliyun', 'tencent', 'myprovider'] as const
```

### Step 4: Update validation schemas

If your adapter requires specific config fields, update the channel creation schema in `packages/shared/src/schemas.ts` to validate them.

### The ChannelAdapter interface

```typescript
interface ChannelAdapter {
  type: ChannelType      // 'email' | 'sms' | 'push'
  name: string           // Unique name within the type (e.g., 'twilio', 'smtp')
  send(config: Record<string, unknown>, msg: MessagePayload): Promise<SendResult>
  test(config: Record<string, unknown>): Promise<boolean>
}

interface MessagePayload {
  to: string             // Recipient address or phone number
  subject?: string       // Email subject (optional for SMS)
  body: string           // Message body (HTML for email, plain text for SMS)
  tags?: string[]        // Categorization labels
  priority?: number      // 0 (lowest) to 99 (highest)
  url?: string           // Associated URL for client-side linking
  attachment?: { name: string; url?: string; data?: string }  // File attachment
  format?: string        // Body format: 'text' | 'markdown' | 'html' | 'json'
}

interface SendResult {
  success: boolean
  externalId?: string    // Provider's message ID for tracking
  error?: string         // Error message if delivery failed
}
```

The `config` parameter contains the decrypted channel configuration from the database. The `test` method verifies that the configuration is valid (e.g., credentials work) and is used by the "Test Connection" feature in the dashboard.

## Adding a New API Endpoint

### Step 1: Create the route handler

Create a new file in `packages/server/src/api/` (or `packages/server/src/api/admin/` for admin-only routes):

```typescript
// packages/server/src/api/admin/myresource.ts

import { Hono } from 'hono'
import { z } from 'zod'
import { authMiddleware, requireAdmin } from '../../auth/index.js'
import type { HonoEnv } from '../../types.js'

const myResource = new Hono<HonoEnv>()

// Apply auth middleware to all routes in this file
myResource.use('*', authMiddleware)
myResource.use('*', requireAdmin)

// GET /api/admin/myresource
myResource.get('/', async (c) => {
  // ... fetch and return resources
  return c.json({ success: true, data: [] })
})

// POST /api/admin/myresource
myResource.post('/', async (c) => {
  const body = await c.req.json()
  // Validate with Zod, create resource, return result
  return c.json({ success: true, data: {} }, 201)
})

export { myResource }
```

### Step 2: Register the route

Add the route to the API router in `packages/server/src/api/index.ts`:

```typescript
import { myResource } from './admin/myresource.js'

export function createApiRouter(): Hono {
  const api = new Hono()

  // ... existing routes
  api.route('/admin/myresource', myResource)

  return api
}
```

The route is now available at `http://localhost:9527/api/admin/myresource`.

### Auth middleware reference

| Middleware | Description | Use for |
|-----------|-------------|---------|
| `authMiddleware` | Validates JWT from `Authorization: Bearer <jwt>` header. Sets `currentUser` on context. | Any authenticated route |
| `requireAdmin` | Checks that the authenticated user has `role = 'admin'`. Must be used after `authMiddleware`. | Admin-only routes |
| `apiAuth` | Validates API token from `Authorization: Bearer <token>` header. Checks enabled status, IP whitelist, and rate limit. Sets `apiToken` on context. | Public API routes |
| `requireScope(scope)` | Checks that the API token has the required scope. Must be used after `apiAuth`. | Scope-restricted routes |

## Code Style and Conventions

### TypeScript

- All code is written in TypeScript with strict mode enabled.
- Use `type` for object shapes and `interface` for contracts that may be extended.
- Prefer `const` assertions and literal types over enums.
- Use ESM (`import`/`export`) throughout. The `type: "module"` field is set in all `package.json` files.

### Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `rate-limit.ts`, `my-provider.ts` |
| Functions | camelCase | `enqueue()`, `processMessage()` |
| Types/Interfaces | PascalCase | `ChannelAdapter`, `MessagePayload` |
| Constants | SCREAMING_SNAKE_CASE | `RETRY_DELAYS`, `WORKER_BATCH_SIZE` |
| Database tables | snake_case (SQL), camelCase (Drizzle) | `api_tokens` / `apiTokens` |

### Error handling

- Use `try/catch` in async functions. Never let unhandled rejections escape.
- Return structured error responses from API routes: `{ success: false, error: "message" }`.
- Log errors with context using `console.error()` (the project uses Pino for structured logging in production).

### Validation

- Validate all external input (API request bodies) with Zod schemas defined in `packages/shared/src/schemas.ts`.
- Use `safeParse()` rather than `parse()` in route handlers to avoid throwing on invalid input.

### Database

- Use Drizzle ORM for all database operations. Raw SQL is acceptable for complex queries but should be wrapped in Drizzle's `sql` template literal.
- Always use parameterized queries. Never interpolate user input into SQL strings.
- Use `returning()` for INSERT and UPDATE operations when you need the affected row.

### Testing

- Write unit tests for pure functions (template engine, crypto, rate limiter).
- Write integration tests for API endpoints using the Hono test client.
- Test channel adapters with mock HTTP servers.

## Common Pitfalls

### Vite Proxy and `/uploads/` File Serving

The Vite dev server (port 4321) only proxies specific paths to the backend. If a path is not configured in the proxy, Vite treats it as a frontend route and returns `index.html` instead of forwarding to the backend.

**Symptom**: Requesting `/uploads/<uuid>.jpg` returns `Content-Type: text/html` with the Vite dev page HTML instead of the image.

**Root Cause**: `packages/web/vite.config.ts` proxy config was missing `/uploads`:

```typescript
// packages/web/vite.config.ts
server: {
  port: 4321,
  proxy: {
    '/api': {
      target: 'http://localhost:9527',
      changeOrigin: true,
    },
    '/uploads': {                    // ← Must be present
      target: 'http://localhost:9527',
      changeOrigin: true,
    },
  },
},
```

**How to verify**: Check the response headers when accessing a file URL:

```bash
# Should return Content-Type: image/jpeg (or similar), NOT text/html
curl -sI http://localhost:4321/uploads/<uuid>.jpg
```

### File Upload Path: `process.cwd()` Matters

The upload directory resolves relative to `process.cwd()`:

```typescript
// packages/server/src/storage.ts
const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads')
```

When running via `pnpm dev` from the repo root, `process.cwd()` is the repo root, so files are saved to `data/uploads/`. When running from `packages/server/`, files go to `packages/server/data/uploads/`. Always confirm the actual upload path if files seem missing:

```bash
find . -path "*/uploads/*.jpg" -o -path "*/uploads/*.png" 2>/dev/null
```

### CORS: PATCH Method

The server uses CORS middleware. If a client (web dashboard, Tauri) needs to call `PATCH` endpoints (e.g., `PATCH /api/v1/push/client`), ensure `PATCH` is in the `allowMethods` list:

```typescript
// packages/server/src/app.ts
app.use('*', cors({
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))
```

### Android PollService: Register Retry

When the Android app starts polling, the `register` call to the server may fail due to timing (server not fully ready). PollService retries up to 3 times with 2s delay. If the app shows "Connecting..." forever after login, check server logs for register errors.

### Logout Flow (Android / Tauri)

Logout must:
1. Stop the poll service (`ACTION_STOP`)
2. Clear JWT and credentials from config store
3. Set `configured = false` to force navigation back to the login screen

On Android, failing to null the `pollService` reference or set `configured = false` will leave the app stuck on the main screen.

### File Serving: `c.body()` vs `new Response()`

When serving binary files (images, PDFs) in Hono, use `c.body()` instead of `new Response(buffer, ...)`:

```typescript
// ✅ Correct — Hono's recommended way
return c.body(buffer, 200, {
  'Content-Type': contentType,
  'Content-Length': String(fileStat.size),
})

// ❌ May cause issues — @hono/node-server's Response wrapper
return new Response(buffer, {
  headers: { 'Content-Type': contentType },
})
```

The `@hono/node-server` adapter overrides `global.Response` with a custom class that has a `cacheKey` optimization. While both approaches should work in theory, `c.body()` is the documented Hono pattern and avoids potential edge cases with the Response wrapper.
