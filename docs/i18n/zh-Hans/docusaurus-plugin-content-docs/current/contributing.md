---
sidebar_position: 5
sidebar_label: '贡献指南'
---

# 贡献指南

感谢你有兴趣为 NotifyHub 做出贡献。本文档介绍如何报告问题、提交更改以及遵循项目规范。

## 开始之前

1. 在 GitHub 上 **Fork 仓库**。
2. **克隆你的 Fork** 到本地：
   ```bash
   git clone https://github.com/<your-username>/notifyhub.git
   cd notifyhub
   ```
3. **安装依赖**：
   ```bash
   pnpm install
   ```
4. **创建分支**进行开发：
   ```bash
   git checkout -b feat/my-feature
   ```

## 报告问题

在创建新 issue 之前，请先搜索[已有 issue](https://github.com/notifyhub/notifyhub/issues)，检查是否有人已经报告过该问题。

### Bug 报告

提交 Bug 报告时，请包含：

- **NotifyHub 版本** — 运行 `git rev-parse HEAD` 或查看服务器启动 banner 中的版本号。
- **Node.js 版本** — 运行 `node --version`。
- **操作系统**和架构。
- **复现步骤** — 能触发该 Bug 的最小操作步骤。
- **预期行为** — 你期望发生什么。
- **实际行为** — 实际发生了什么，包括错误消息或堆栈跟踪。
- **相关日志** — 服务器日志、浏览器控制台输出或网络请求。

### 功能请求

请求新功能时，请描述：

- **你要解决的问题**。
- **你建议的解决方案**（如果有的话）。
- **你考虑过的替代方案**。
- **使用场景** — 谁会从中受益，如何受益？

## Pull Request 流程

### 开始之前

- 对于重大更改，请先创建一个 issue 讨论方案。这样可以避免在可能不符合项目方向的 PR 上花费时间。
- 查看[开发指南](./development.md)了解环境搭建说明和项目规范。

### 提交 PR

1. **确保代码能编译通过**：
   ```bash
   pnpm typecheck
   pnpm build
   ```

2. **运行代码检查**：
   ```bash
   pnpm lint
   ```

3. **编写或更新测试**。每个新功能和 Bug 修复都应有测试覆盖。

4. **更新文档**（如果你的更改影响公共 API、配置或用户可见的行为）。文档位于 `docs/` 目录。

5. **编写清晰的提交信息**：
   ```
   feat(channel): add Slack webhook adapter

   - Implement ChannelAdapter for Slack incoming webhooks
   - Add 'slack' to SMS_PROVIDERS constant
   - Include config validation for webhook URL
   ```

6. **推送你的分支**并向 `main` 发起 Pull Request。

7. **填写 PR 描述**，包括：
   - PR 做了什么以及为什么。
   - 相关 issue 编号（例如 `Closes #42`）。
   - 测试步骤。
   - UI 更改的截图。

### PR 审查清单

审查者会检查：

- [ ] 代码编译无错误或警告。
- [ ] TypeScript 类型正确且在需要时显式声明。
- [ ] 输入通过 Zod schema 进行了验证。
- [ ] 数据库操作使用 Drizzle ORM（除非必要，不使用原生 SQL）。
- [ ] 敏感数据（密码、令牌、密钥）不会被记录或在响应中返回。
- [ ] 新的 API 端点有适当的认证中间件。
- [ ] 文档已更新。
- [ ] 提交信息遵循以下规范。

## 代码标准

### 通用规范

- 使用 TypeScript 编写代码，不使用 JavaScript 文件。
- 使用 ESM（`import`/`export`），不使用 `require()`。
- 保持函数小巧且职责单一。如果一个函数做了太多事情，请拆分它。
- 优先使用组合而非继承。

### 格式化和代码检查

项目使用 ESLint 进行代码检查。运行 `pnpm lint` 检查你的代码。大多数格式化问题由代码检查工具捕获；没有单独的 Prettier 步骤。

### 错误处理

- 始终处理异步函数中的错误。使用 `try/catch` 并返回有意义的错误消息。
- API 路由必须返回结构化响应：`{ success: boolean, data?: T, error?: string }`。
- 在生产环境中，绝不在 API 响应中暴露内部细节（堆栈跟踪、数据库错误）。

### 安全

- 绝不以明文存储密钥。渠道凭证在写入数据库前必须使用 `encrypt()` 加密。
- 绝不记录令牌、密码或加密密钥。
- 验证并清理所有用户输入。
- 使用 `bcrypt` 进行密码哈希（cost factor 为 10）。
- 使用 `jsonwebtoken` 并配置密钥（不要硬编码）。

### 数据库

- 所有 schema 变更在 `server/src/db/schema.ts` 中定义。
- 使用 `pnpm db:generate` 生成迁移并提交生成的文件。
- SQL 列名使用 `snake_case`，Drizzle/TypeScript 中使用 `camelCase`（Drizzle 会处理映射）。
- 为 `WHERE` 子句中使用的列添加索引（尤其是 messages 表）。

## 提交规范

NotifyHub 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### 类型

| 类型 | 描述 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 仅文档更改 |
| `style` | 代码风格更改（格式化，无逻辑变更） |
| `refactor` | 既不修复 Bug 也不添加功能的代码变更 |
| `test` | 添加或更新测试 |
| `chore` | 构建流程、CI、依赖、工具 |

### 范围

使用受影响的包或区域：

- `server` — API 服务器更改
- `web` — 前端仪表盘更改
- `cli` — CLI 工具更改
- `shared` — 共享类型/schema/常量
- `channel` — 渠道适配器更改
- `queue` — 消息队列更改
- `auth` — 认证与授权
- `db` — 数据库 schema 和迁移
- `docs` — 文档

### 示例

```
feat(channel): add SendGrid email adapter
fix(queue): prevent duplicate claims with concurrent workers
docs(api): update send endpoint documentation
refactor(auth): extract rate limiter into separate module
test(template): add edge case tests for default values
chore(deps): update hono to v4.6.0
```

## 发布流程

发布由维护者管理。典型流程如下：

1. 功能和修复合并到 `main`。
2. 按照[语义化版本](https://semver.org/)更新 `package.json` 中的版本号。
3. 创建 git 标签（例如 `v0.2.0`）。
4. 构建并发布 Docker 镜像。

## 获取帮助

如果你在贡献过程中需要帮助：

- 在 GitHub 上发起 [Discussion](https://github.com/notifyhub/notifyhub/discussions)。
- 在相关 issue 或 PR 下留言。
- 查看[开发指南](./development.md)了解技术细节。

## 许可证

通过为 NotifyHub 做出贡献，你同意你的贡献将在与项目相同的许可证下发布。
