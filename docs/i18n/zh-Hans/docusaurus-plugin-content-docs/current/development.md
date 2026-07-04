---
sidebar_position: 4
sidebar_label: '开发指南'
---

# 开发指南

本指南涵盖本地开发 NotifyHub、扩展功能以及遵循项目规范所需的一切信息。

## 开发环境搭建

### 前置要求

- **Node.js 18+**（推荐 20+）
- **pnpm 9+**
- 支持 TypeScript 的代码编辑器（推荐 VS Code）

### 快速开始

```bash
# 克隆并安装依赖
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub
pnpm install

# 复制环境配置文件
cp .env.example .env

# 运行数据库迁移
pnpm db:migrate

# 启动 API 服务器（支持热重载）
pnpm dev

# 在另一个终端启动前端
pnpm dev:web
```

API 服务器运行在 `http://localhost:9527`，使用 `tsx watch` 实现文件更改后自动重启。前端运行在 `http://localhost:5173`，使用 Vite HMR。

## 项目结构

NotifyHub 是一个包含四个包（package）的 pnpm monorepo：

| 包 | 路径 | 说明 |
|---------|------|-------------|
| `@notify-hub/shared` | `shared` | 共享类型、Zod schema 和常量，被所有其他包使用。 |
| `@notify-hub/server` | `server` | Hono API 服务器、SQLite 数据库、消息队列和渠道适配器。 |
| `@notify-hub/web` | `web` | 基于 Vite、Tailwind CSS 和 shadcn/ui 构建的 React 管理面板。 |
| `@notify-hub/cli` | `cli` | 用于发送消息和管理 NotifyHub 的命令行工具。 |

### 依赖关系

```
shared  <--  server
shared  <--  web
shared  <--  cli
```

`shared` 包没有运行时依赖（仅有 `zod` 作为 peer dependency）。所有其他包依赖于 `shared`，但彼此之间没有依赖关系。

## 常用命令

所有命令在仓库根目录下运行：

| 命令 | 说明 |
|---------|-------------|
| `pnpm dev` | 启动 API 服务器并支持热重载（`tsx watch`） |
| `pnpm dev:web` | 启动前端开发服务器（Vite） |
| `pnpm build` | 构建所有包 |
| `pnpm build:server` | 仅构建服务端包 |
| `pnpm build:web` | 仅构建前端包 |
| `pnpm build:cli` | 仅构建 CLI 包 |
| `pnpm lint` | 对所有包运行代码检查 |
| `pnpm typecheck` | 对所有包运行 TypeScript 类型检查 |
| `pnpm db:generate` | 根据 schema 变更生成 Drizzle 迁移文件 |
| `pnpm db:migrate` | 应用待处理的数据库迁移 |
| `pnpm db:push` | 将 schema 直接推送到数据库（仅用于开发阶段） |

### 数据库工作流

当您修改 Drizzle schema（`server/src/db/schema.ts`）时：

```bash
# 1. 生成迁移文件
pnpm db:generate

# 2. 检查 server/drizzle/ 中生成的 SQL

# 3. 应用迁移
pnpm db:migrate
```

:::tip
在快速原型开发阶段，可以使用 `pnpm db:push` 直接应用 schema 变更而无需生成迁移文件。在提交代码前，请切换到 `db:generate` + `db:migrate` 流程。
:::

## 添加新渠道适配器

渠道适配器（channel adapter）实现了来自 `@notify-hub/shared` 的 `ChannelAdapter` 接口。每个适配器处理一种投递方式（例如特定的短信服务提供商）。

### 第一步：定义适配器

在 `server/src/channel/` 下创建新文件。例如，添加一个新的短信提供商：

```typescript
// server/src/channel/sms/myprovider.ts

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

### 第二步：注册适配器

将适配器添加到 `server/src/channel/index.ts`：

```typescript
import { myProviderAdapter } from './sms/myprovider.js'

export function registerBuiltinAdapters() {
  // ... existing adapters
  registerAdapter(myProviderAdapter)
}
```

### 第三步：更新共享常量

在 `shared/src/constants.ts` 中添加提供商名称：

```typescript
export const SMS_PROVIDERS = ['twilio', 'aliyun', 'tencent', 'myprovider'] as const
```

### 第四步：更新校验 schema

如果您的适配器需要特定的配置字段，请更新 `shared/src/schemas.ts` 中的渠道创建 schema 以进行校验。

### ChannelAdapter 接口

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

`config` 参数包含从数据库解密后的渠道配置。`test` 方法用于验证配置是否有效（例如凭证是否可用），管理面板中的"测试连接"功能会调用该方法。

## 添加新 API 端点

### 第一步：创建路由处理器

在 `server/src/api/` 下创建新文件（如需管理员权限路由则放在 `server/src/api/admin/` 下）：

```typescript
// server/src/api/admin/myresource.ts

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

### 第二步：注册路由

在 `server/src/api/index.ts` 中将路由添加到 API 路由器：

```typescript
import { myResource } from './admin/myresource.js'

export function createApiRouter(): Hono {
  const api = new Hono()

  // ... existing routes
  api.route('/admin/myresource', myResource)

  return api
}
```

该路由现在可通过 `http://localhost:9527/api/admin/myresource` 访问。

### 认证中间件参考

| 中间件 | 说明 | 适用场景 |
|-----------|-------------|---------|
| `authMiddleware` | 验证 `Authorization: Bearer <jwt>` 头中的 JWT。在上下文中设置 `currentUser`。 | 任何需要认证的路由 |
| `requireAdmin` | 检查已认证用户是否具有 `role = 'admin'`。必须在 `authMiddleware` 之后使用。 | 仅限管理员的路由 |
| `apiAuth` | 验证 `Authorization: Bearer <token>` 头中的 API 令牌。检查启用状态、IP 白名单和速率限制。在上下文中设置 `apiToken`。 | 公共 API 路由 |
| `requireScope(scope)` | 检查 API 令牌是否具有所需的作用域。必须在 `apiAuth` 之后使用。 | 作用域受限的路由 |

## 代码规范

### TypeScript

- 所有代码使用 TypeScript 编写，启用严格模式（strict mode）。
- 对对象形状使用 `type`，对可扩展的契约使用 `interface`。
- 优先使用 `const` 断言和字面量类型，而非枚举（enum）。
- 全部使用 ESM（`import`/`export`）。所有 `package.json` 文件中均设置了 `type: "module"`。

### 命名规范

| 元素 | 规范 | 示例 |
|---------|-----------|---------|
| 文件 | kebab-case | `rate-limit.ts`、`my-provider.ts` |
| 函数 | camelCase | `enqueue()`、`processMessage()` |
| 类型/接口 | PascalCase | `ChannelAdapter`、`MessagePayload` |
| 常量 | SCREAMING_SNAKE_CASE | `RETRY_DELAYS`、`WORKER_BATCH_SIZE` |
| 数据库表 | snake_case（SQL），camelCase（Drizzle） | `api_tokens` / `apiTokens` |

### 错误处理

- 在异步函数中使用 `try/catch`。不要让未处理的 rejection 逃逸。
- API 路由返回结构化的错误响应：`{ success: false, error: "message" }`。
- 使用 `console.error()` 记录带上下文的错误（生产环境中项目使用 Pino 进行结构化日志记录）。

### 数据校验

- 使用 `shared/src/schemas.ts` 中定义的 Zod schema 校验所有外部输入（API 请求体）。
- 在路由处理器中使用 `safeParse()` 而非 `parse()`，以避免在输入无效时抛出异常。

### 数据库

- 使用 Drizzle ORM 进行所有数据库操作。对于复杂查询可以使用原生 SQL，但应使用 Drizzle 的 `sql` 模板字符串进行包装。
- 始终使用参数化查询。不要将用户输入直接拼接到 SQL 字符串中。
- 在需要获取受影响行数据时，对 INSERT 和 UPDATE 操作使用 `returning()`。

### 测试

- 为纯函数（模板引擎、加密模块、速率限制器）编写单元测试。
- 使用 Hono 测试客户端为 API 端点编写集成测试。
- 使用模拟 HTTP 服务器测试渠道适配器。
