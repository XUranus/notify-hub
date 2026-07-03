---
sidebar_position: 2
title: 快速开始
description: 安装、配置并发送第一条通知
---

# 快速开始

本指南帮助你在 5 分钟内启动 NotifyHub 并发送第一条通知。

## 前置要求

- Node.js 20+
- pnpm 9+

```bash
node --version  # v20.x.x
pnpm --version  # 9.x.x
```

## 安装

```bash
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub
pnpm install
```

## 配置

复制环境变量模板并编辑：

```bash
cp .env.example .env
```

关键配置项：

```bash
# 管理员账号（首次启动自动创建）
ADMIN_EMAIL=admin@notifyhub.local
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 安全密钥（不设置会自动生成，但重启后失效）
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-encryption-key-here
```

## 启动

```bash
# 运行数据库迁移
pnpm db:migrate

# 启动后端（端口 9527）
pnpm --filter @notify-hub/server dev

# 启动前端（端口 4321）
pnpm --filter @notify-hub/web dev
```

打开浏览器访问 `http://localhost:4321`，使用 `admin@notifyhub.local` / `admin123` 登录。

## 第一次发送

### 1. 创建 API 令牌

登录后进入 **API 令牌** 页面，点击 **创建令牌**，复制生成的令牌。

### 2. 创建邮件渠道

进入 **渠道管理** 页面，添加一个 SMTP 渠道：

```json
{
  "name": "我的 SMTP",
  "host": "smtp.gmail.com",
  "port": 587,
  "secure": false,
  "username": "your-email@gmail.com",
  "password": "your-app-password",
  "fromAddress": "your-email@gmail.com"
}
```

### 3. 发送通知

```bash
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "to": "recipient@example.com",
    "subject": "Hello from NotifyHub",
    "body": "这是一条测试通知！"
  }'
```

响应：

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued"
  }
}
```

## Docker 快速启动

```bash
git clone https://github.com/notifyhub/notifyhub.git
cd notifyhub
cp .env.example .env
# 编辑 .env 设置管理员密码和密钥

docker compose -f deploy/docker-compose.yml up -d
```

服务将在 `http://localhost:9527` 启动。

:::tip
首次使用建议先用本地开发模式熟悉功能，再部署到生产环境。
:::
