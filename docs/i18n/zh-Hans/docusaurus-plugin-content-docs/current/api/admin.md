---
title: 管理 API
sidebar_position: 3
description: 通过 NotifyHub 管理 API 管理渠道、令牌、模板、消息、用户和统计信息。
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 管理 API

管理 API 为你的 NotifyHub 实例提供完整的管理功能——认证、渠道、API 令牌、模板、消息、统计和用户管理。

## 基础 URL

```text
http://<your-host>:9527/api/admin
```

## 认证

所有管理 API 端点（登录和注册除外）都需要在 `Authorization` 请求头中携带 **JWT** 令牌：

```text
Authorization: Bearer <jwt-token>
```

JWT 通过[登录](#登录)端点获取，包含以下载荷：

```json
{
  "userId": 1,
  "email": "admin@example.com",
  "role": "admin"
}
```

- **有效期：** 24 小时
- **角色：** `admin`（完全访问权限）或 `user`（有限访问权限）

:::note
用户管理端点（`/api/admin/users`）需要 `admin` 角色。所有其他管理端点对任何已认证用户开放。
:::

---

## 认证端点

### 登录

<span className="method-badge method-post">POST</span> `/api/admin/login`

使用邮箱和密码进行认证，返回 JWT 令牌。

**请求体：**

| 字段       | 类型     | 必填 | 描述             |
| ---------- | -------- | ---- | ---------------- |
| `email`    | `string` | 是   | 账户邮箱。       |
| `password` | `string` | 是   | 账户密码。       |

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/admin/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@example.com",
    password: "your-password",
  }),
});

const result = await response.json();
if (result.success) {
  const token = result.data.token;
  console.log("JWT:", token);
  console.log("User:", result.data.user);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/admin/login",
    json={"email": "admin@example.com", "password": "your-password"},
)

result = response.json()
if result["success"]:
    token = result["data"]["token"]
    print(f"JWT: {token}")
    print(f"User: {result['data']['user']}")
```

</TabItem>
</Tabs>

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "username": "admin",
      "role": "admin"
    }
  }
}
```

**错误：**

| HTTP 状态码 | 错误信息               | 描述                               |
| ----------- | ---------------------- | ---------------------------------- |
| `400`       | Validation error       | 邮箱或密码缺失或格式无效。         |
| `401`       | `Invalid credentials`  | 邮箱或密码不正确。                 |

---

### 注册

<span className="method-badge method-post">POST</span> `/api/admin/register`

创建新的用户账户。新注册用户默认分配 `user` 角色。

**请求体：**

| 字段       | 类型     | 必填 | 描述                             |
| ---------- | -------- | ---- | -------------------------------- |
| `email`    | `string` | 是   | 邮箱地址（必须唯一）。           |
| `password` | `string` | 是   | 密码（最少 6 个字符）。          |

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 2,
      "email": "newuser@example.com",
      "username": "newuser",
      "role": "user"
    }
  }
}
```

**错误：**

| HTTP 状态码 | 错误信息                   | 描述                          |
| ----------- | -------------------------- | ----------------------------- |
| `400`       | Validation error           | 字段缺失或格式无效。          |
| `409`       | `Email already registered` | 该邮箱已注册账户。            |

---

### 修改密码

<span className="method-badge method-post">POST</span> `/api/admin/change-password`

修改当前已认证用户的密码。需要 JWT 认证。

**请求体：**

| 字段              | 类型     | 必填 | 描述                       |
| ----------------- | -------- | ---- | -------------------------- |
| `currentPassword` | `string` | 是   | 当前密码。                 |
| `newPassword`     | `string` | 是   | 新密码（最少 6 个字符）。  |

**响应 -- 200 OK：**

```json
{ "success": true }
```

**错误：**

| HTTP 状态码 | 错误信息                                        | 描述                           |
| ----------- | ----------------------------------------------- | ------------------------------ |
| `400`       | Validation error                                | 字段缺失。                     |
| `400`       | `New password must be at least 6 characters`    | 密码太短。                     |
| `401`       | `Current password is incorrect`                 | 当前密码不匹配。               |

---

## 渠道管理

渠道是在你的 NotifyHub 实例中配置的投递供应商（例如用于邮件的 SMTP 服务器、用于短信的 Twilio）。渠道配置以加密形式存储。

### 获取渠道列表

<span className="method-badge method-get">GET</span> `/api/admin/channels`

获取所有已配置的渠道。敏感字段（密码、密钥、密钥）以 `***` 掩码显示。

**查询参数：**

| 参数   | 类型     | 描述                                        |
| ------ | -------- | ------------------------------------------- |
| `type` | `string` | 按渠道类型筛选：`email`、`sms`、`push`。    |

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "email",
      "name": "Production SMTP",
      "config": {
        "host": "smtp.example.com",
        "port": 587,
        "secure": true,
        "username": "noreply@example.com",
        "password": "***",
        "fromAddress": "noreply@example.com",
        "fromName": "NotifyHub"
      },
      "enabled": true,
      "isDefault": true,
      "createdAt": 1719849600000,
      "updatedAt": 1719849600000
    }
  ]
}
```

---

### 获取渠道详情

<span className="method-badge method-get">GET</span> `/api/admin/channels/:id`

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 渠道 ID。  |

---

### 创建渠道

<span className="method-badge method-post">POST</span> `/api/admin/channels`

创建新渠道。`config` 对象会根据渠道类型的 schema 进行验证，并以加密形式存储。

**请求体：**

| 字段        | 类型      | 必填 | 描述                                                                       |
| ----------- | --------- | ---- | -------------------------------------------------------------------------- |
| `type`      | `string`  | 是   | 渠道类型：`email`、`sms` 或 `push`。                                       |
| `name`      | `string`  | 是   | 可读名称（1--100 个字符）。                                                |
| `config`    | `object`  | 是   | 渠道特定配置。参见[渠道配置](#渠道配置)。                    |
| `enabled`   | `boolean` | 否   | 渠道是否启用。默认值：`true`。                                             |
| `isDefault` | `boolean` | 否   | 是否为该渠道类型的默认渠道。默认值：`false`。                              |

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/admin/channels \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "name": "Production SMTP",
    "config": {
      "host": "smtp.example.com",
      "port": 587,
      "secure": true,
      "username": "noreply@example.com",
      "password": "smtp-password",
      "fromAddress": "noreply@example.com",
      "fromName": "NotifyHub"
    },
    "enabled": true,
    "isDefault": true
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/admin/channels", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "email",
    name: "Production SMTP",
    config: {
      host: "smtp.example.com",
      port: 587,
      secure: true,
      username: "noreply@example.com",
      password: "smtp-password",
      fromAddress: "noreply@example.com",
      fromName: "NotifyHub",
    },
    enabled: true,
    isDefault: true,
  }),
});

const result = await response.json();
console.log("Created channel ID:", result.data.id);
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/admin/channels",
    headers={"Authorization": f"Bearer {jwt}"},
    json={
        "type": "email",
        "name": "Production SMTP",
        "config": {
            "host": "smtp.example.com",
            "port": 587,
            "secure": True,
            "username": "noreply@example.com",
            "password": "smtp-password",
            "fromAddress": "noreply@example.com",
            "fromName": "NotifyHub",
        },
        "enabled": True,
        "isDefault": True,
    },
)

print(f"Created channel ID: {response.json()['data']['id']}")
```

</TabItem>
</Tabs>

**响应 -- 201 Created：**

```json
{
  "success": true,
  "data": { "id": 3 }
}
```

---

### 更新渠道

<span className="method-badge method-put">PUT</span> `/api/admin/channels/:id`

更新现有渠道。所有字段都是可选的——只有提供的字段会被更新。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 渠道 ID。  |

**请求体：** 与[创建渠道](#创建渠道)相同的字段，均为可选。

**响应 -- 200 OK：**

```json
{ "success": true }
```

---

### 删除渠道

<span className="method-badge method-delete">DELETE</span> `/api/admin/channels/:id`

永久删除渠道。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 渠道 ID。  |

**响应 -- 200 OK：**

```json
{ "success": true }
```

---

### 测试渠道

<span className="method-badge method-post">POST</span> `/api/admin/channels/:id/test`

测试与渠道投递供应商的连通性。执行轻量级检查（例如 SMTP 连接测试、API 凭据验证），不会发送实际消息。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 渠道 ID。  |

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": { "connected": true }
}
```

如果连接失败：

```json
{
  "success": false,
  "error": "Connection refused"
}
```

### 渠道配置

每种渠道类型需要特定的 `config` 对象结构：

**邮件（Email）：**

| 字段          | 类型      | 必填 | 描述                          |
| ------------- | --------- | ---- | ----------------------------- |
| `host`        | `string`  | 是   | SMTP 服务器主机名。           |
| `port`        | `number`  | 是   | SMTP 端口（1--65535）。       |
| `secure`      | `boolean` | 否   | 使用 TLS。默认值：`true`。    |
| `username`    | `string`  | 是   | SMTP 用户名。                 |
| `password`    | `string`  | 是   | SMTP 密码。                   |
| `fromAddress` | `string`  | 是   | 发件人邮箱地址。              |
| `fromName`    | `string`  | 否   | 发件人显示名称。              |

**短信（Twilio）：**

| 字段          | 类型       | 必填 | 描述                    |
| ------------- | ---------- | ---- | ----------------------- |
| `provider`    | `"twilio"` | 是   | 必须为 `"twilio"`。     |
| `accountSid`  | `string`   | 是   | Twilio Account SID。    |
| `authToken`   | `string`   | 是   | Twilio Auth Token。     |
| `fromNumber`  | `string`   | 是   | Twilio 电话号码。       |

**短信（阿里云）：**

| 字段             | 类型       | 必填 | 描述                                       |
| ---------------- | ---------- | ---- | ------------------------------------------ |
| `provider`       | `"aliyun"` | 是   | 必须为 `"aliyun"`。                        |
| `accessKeyId`    | `string`   | 是   | 阿里云 AccessKey ID。                      |
| `accessKeySecret` | `string`  | 是   | 阿里云 AccessKey Secret。                  |
| `signName`       | `string`   | 是   | 短信签名名称。                             |
| `endpoint`       | `string`   | 否   | API 端点。默认值：`dysmsapi.aliyuncs.com`。|

**短信（腾讯云）：**

| 字段        | 类型         | 必填 | 描述                                            |
| ----------- | ------------ | ---- | ----------------------------------------------- |
| `provider`  | `"tencent"`  | 是   | 必须为 `"tencent"`。                            |
| `secretId`  | `string`     | 是   | 腾讯云 Secret ID。                              |
| `secretKey` | `string`     | 是   | 腾讯云 Secret Key。                             |
| `signName`  | `string`     | 是   | 短信签名名称。                                  |
| `sdkAppId`  | `string`     | 是   | 腾讯短信 SDK App ID。                           |
| `endpoint`  | `string`     | 否   | API 端点。默认值：`sms.tencentcloudapi.com`。   |

---

## 令牌管理

API 令牌用于应用程序向[发送 API](./send) 和[消息 API](./messages) 进行认证。每个令牌都有作用域、速率限制和可选的 IP 白名单。

### 获取令牌列表

<span className="method-badge method-get">GET</span> `/api/admin/tokens`

获取所有 API 令牌。管理员用户可以看到所有令牌；普通用户只能看到自己的令牌。在列表视图中令牌值会被掩码处理。

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": 1,
      "name": "Production App",
      "token": "nh_aBcDe***",
      "scopes": ["email", "sms"],
      "rateLimit": 100,
      "ipWhitelist": null,
      "enabled": true,
      "lastUsedAt": 1719849600000,
      "createdAt": 1719800000000
    }
  ]
}
```

---

### 获取令牌详情

<span className="method-badge method-get">GET</span> `/api/admin/tokens/:id`

获取单个令牌的**完整值**。普通用户只能查看自己的令牌。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 令牌 ID。  |

---

### 创建令牌

<span className="method-badge method-post">POST</span> `/api/admin/tokens`

创建新的 API 令牌。完整令牌值**仅在创建时返回**——之后无法再获取。

**请求体：**

| 字段           | 类型       | 必填 | 描述                                                          |
| -------------- | ---------- | ---- | ------------------------------------------------------------- |
| `name`         | `string`   | 是   | 可读名称（1--100 个字符）。                                   |
| `scopes`       | `string[]` | 否   | 渠道类型数组。默认值：`["email", "sms", "push"]`。            |
| `rateLimit`    | `number`   | 否   | 每分钟最大请求数。默认值：`100`。范围：1--10,000。            |
| `ipWhitelist`  | `string[]` | 否   | 允许的 IP 地址数组。`null` 或空表示无限制。                   |

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/admin/tokens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI Pipeline",
    "scopes": ["email"],
    "rateLimit": 50,
    "ipWhitelist": ["10.0.0.1", "192.168.1.0/24"]
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/admin/tokens", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "CI Pipeline",
    scopes: ["email"],
    rateLimit: 50,
    ipWhitelist: ["10.0.0.1", "192.168.1.0/24"],
  }),
});

const result = await response.json();
// IMPORTANT: Save this token -- it cannot be retrieved again
console.log("New token:", result.data.token);
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/admin/tokens",
    headers={"Authorization": f"Bearer {jwt}"},
    json={
        "name": "CI Pipeline",
        "scopes": ["email"],
        "rateLimit": 50,
        "ipWhitelist": ["10.0.0.1", "192.168.1.0/24"],
    },
)

result = response.json()
# IMPORTANT: Save this token -- it cannot be retrieved again
print(f"New token: {result['data']['token']}")
```

</TabItem>
</Tabs>

**响应 -- 201 Created：**

```json
{
  "success": true,
  "data": {
    "id": 5,
    "name": "CI Pipeline",
    "token": "nh_xK9mNb2pQr4sTu6vWy8xAz0bCd1eFg3h",
    "scopes": ["email"],
    "rateLimit": 50
  }
}
```

:::warning
创建后请立即保存令牌值。出于安全原因，完整令牌值仅显示一次，**无法**在之后获取。列表端点只显示掩码前缀。
:::

---

### 更新令牌

<span className="method-badge method-put">PUT</span> `/api/admin/tokens/:id`

更新令牌设置。所有字段都是可选的。普通用户只能更新自己的令牌。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 令牌 ID。  |

**请求体：**

| 字段          | 类型               | 必填 | 描述                                       |
| ------------- | ------------------ | ---- | ------------------------------------------ |
| `name`        | `string`           | 否   | 新名称。                                   |
| `scopes`      | `string[]`         | 否   | 新的作用域数组。                           |
| `rateLimit`   | `number`           | 否   | 新的速率限制（1--10,000）。                |
| `ipWhitelist` | `string[] \| null` | 否   | 新的 IP 白名单。`null` 表示移除限制。      |
| `enabled`     | `boolean`          | 否   | 启用或禁用令牌。                           |

**响应 -- 200 OK：**

```json
{ "success": true }
```

---

### 删除令牌

<span className="method-badge method-delete">DELETE</span> `/api/admin/tokens/:id`

永久删除 API 令牌。使用该令牌的请求将立即开始返回 `401` 错误。普通用户只能删除自己的令牌。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 令牌 ID。  |

**响应 -- 200 OK：**

```json
{ "success": true }
```

---

## 模板管理

模板允许你定义可复用的消息内容，使用 `{{variable}}` 占位符。它们在入队时由[发送 API](./send#模板用法) 解析。

### 获取模板列表

<span className="method-badge method-get">GET</span> `/api/admin/templates`

**查询参数：**

| 参数          | 类型     | 描述                                              |
| ------------- | -------- | ------------------------------------------------- |
| `channelType` | `string` | 按渠道类型筛选：`email`、`sms` 或 `push`。       |

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "welcome-email",
      "channelType": "email",
      "subject": "Welcome, {{userName}}!",
      "body": "Hi {{userName}}, your account is ready.",
      "variables": {
        "userName": "The user's display name"
      },
      "createdAt": 1719849600000
    }
  ]
}
```

---

### 获取模板详情

<span className="method-badge method-get">GET</span> `/api/admin/templates/:id`

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 模板 ID。  |

---

### 创建模板

<span className="method-badge method-post">POST</span> `/api/admin/templates`

**请求体：**

| 字段          | 类型     | 必填 | 描述                                                               |
| ------------- | -------- | ---- | ------------------------------------------------------------------ |
| `name`        | `string` | 是   | 模板名称（1--100 个字符）。每种渠道类型下必须唯一。                |
| `channelType` | `string` | 是   | 渠道类型：`email`、`sms` 或 `push`。                               |
| `subject`     | `string` | 否   | 主题模板（支持 `{{variable}}` 占位符）。主要用于邮件。             |
| `body`        | `string` | 是   | 正文模板，包含 `{{variable}}` 占位符。                             |
| `variables`   | `object` | 否   | 描述预期变量的键值对（键为变量名，值为变量描述）。                 |

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/admin/templates \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "order-confirmation",
    "channelType": "email",
    "subject": "Order #{{orderId}} Confirmed",
    "body": "Hi {{customerName}},\n\nYour order #{{orderId}} for {{amount}} has been confirmed.\n\nEstimated delivery: {{deliveryDate | default:\"3-5 business days\"}}",
    "variables": {
      "orderId": "The order identifier",
      "customerName": "Customer display name",
      "amount": "Order total with currency",
      "deliveryDate": "Estimated delivery date"
    }
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/admin/templates", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "order-confirmation",
    channelType: "email",
    subject: "Order #{{orderId}} Confirmed",
    body: "Hi {{customerName}},\n\nYour order #{{orderId}} for {{amount}} has been confirmed.",
    variables: {
      orderId: "The order identifier",
      customerName: "Customer display name",
      amount: "Order total with currency",
    },
  }),
});

const result = await response.json();
console.log("Created template ID:", result.data.id);
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/admin/templates",
    headers={"Authorization": f"Bearer {jwt}"},
    json={
        "name": "order-confirmation",
        "channelType": "email",
        "subject": "Order #{{orderId}} Confirmed",
        "body": "Hi {{customerName}},\n\nYour order #{{orderId}} for {{amount}} has been confirmed.",
        "variables": {
            "orderId": "The order identifier",
            "customerName": "Customer display name",
            "amount": "Order total with currency",
        },
    },
)

print(f"Created template ID: {response.json()['data']['id']}")
```

</TabItem>
</Tabs>

**响应 -- 201 Created：**

```json
{
  "success": true,
  "data": { "id": 3 }
}
```

---

### 更新模板

<span className="method-badge method-put">PUT</span> `/api/admin/templates/:id`

更新现有模板。所有字段都是可选的。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 模板 ID。  |

**请求体：** 与[创建模板](#创建模板)相同的字段，均为可选。

**响应 -- 200 OK：**

```json
{ "success": true }
```

---

### 删除模板

<span className="method-badge method-delete">DELETE</span> `/api/admin/templates/:id`

永久删除模板。已使用该模板创建的现有消息**不受影响**。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 模板 ID。  |

**响应 -- 200 OK：**

```json
{ "success": true }
```

---

## 消息管理

管理员消息端点提供与[消息 API](./messages) 相同的查询功能，并增加了重试失败/死亡消息和删除消息的能力。

### 获取消息列表（管理员）

<span className="method-badge method-get">GET</span> `/api/admin/messages`

获取分页消息列表。参数和响应格式与[获取消息列表](./messages#获取消息列表)相同。

**查询参数：**

| 参数       | 类型     | 默认值 | 描述                                        |
| ---------- | -------- | ------ | ------------------------------------------- |
| `page`     | `number` | `1`    | 页码（从 1 开始）。                         |
| `pageSize` | `number` | `20`   | 每页条数（最多 100）。                      |
| `status`   | `string` | --     | 按状态筛选。                                |
| `channel`  | `string` | --     | 按渠道类型筛选：`email`、`sms`、`push`。    |

---

### 获取消息详情（管理员）

<span className="method-badge method-get">GET</span> `/api/admin/messages/:id`

根据 ID 获取单条消息。响应格式与[获取单条消息](./messages#获取单条消息)相同。

---

### 重试消息

<span className="method-badge method-post">POST</span> `/api/admin/messages/:id/retry`

手动重试 `failed` 或 `dead` 状态的消息。这会重置重试计数器并将消息重新入队以立即投递。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 消息 ID。  |

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/admin/messages/42/retry \
  -H "Authorization: Bearer <jwt>"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const messageId = 42;
const response = await fetch(
  `http://localhost:9527/api/admin/messages/${messageId}/retry`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  }
);

const result = await response.json();
if (result.success) {
  console.log("Message re-queued for retry");
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

message_id = 42
response = requests.post(
    f"http://localhost:9527/api/admin/messages/{message_id}/retry",
    headers={"Authorization": f"Bearer {jwt}"},
)

if response.json()["success"]:
    print("Message re-queued for retry")
```

</TabItem>
</Tabs>

**响应 -- 200 OK：**

```json
{ "success": true }
```

**错误：**

| HTTP 状态码 | 错误信息                                            | 描述                                          |
| ----------- | --------------------------------------------------- | --------------------------------------------- |
| `400`       | `Cannot retry message with status '<status>'`       | 只有 `failed` 或 `dead` 状态的消息可以重试。  |
| `400`       | `Message not found`                                 | 指定的消息不存在。                            |

---

### 删除消息

<span className="method-badge method-delete">DELETE</span> `/api/admin/messages/:id`

永久删除消息。

**路径参数：**

| 参数 | 类型     | 描述       |
| ---- | -------- | ---------- |
| `id` | `number` | 消息 ID。  |

**响应 -- 200 OK：**

```json
{ "success": true }
```

---

## 统计

### 总览统计

<span className="method-badge method-get">GET</span> `/api/admin/stats/overview`

获取整个实例的汇总消息统计信息。

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": {
    "totalMessages": 15234,
    "sentMessages": 14800,
    "failedMessages": 434,
    "queuedMessages": 12,
    "successRate": 97.15,
    "messagesLast24h": 523,
    "messagesLast7d": 3412
  }
}
```

| 字段               | 类型     | 描述                                        |
| ------------------ | -------- | ------------------------------------------- |
| `totalMessages`    | `number` | 历史创建的消息总数。                        |
| `sentMessages`     | `number` | 状态为 `sent` 的消息数。                    |
| `failedMessages`   | `number` | 状态为 `failed` 或 `dead` 的消息数。        |
| `queuedMessages`   | `number` | 当前处于 `queued` 状态的消息数。            |
| `successRate`      | `number` | `sent` 状态消息占总消息数的百分比。         |
| `messagesLast24h`  | `number` | 最近 24 小时内创建的消息数。                |
| `messagesLast7d`   | `number` | 最近 7 天内创建的消息数。                   |

---

### 每日统计

<span className="method-badge method-get">GET</span> `/api/admin/stats/daily`

获取最近 7 天的每日消息计数。

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-06-14",
      "total": 487,
      "sent": 475,
      "failed": 12
    },
    {
      "date": "2025-06-15",
      "total": 523,
      "sent": 510,
      "failed": 13
    }
  ]
}
```

| 字段     | 类型     | 描述                                          |
| -------- | -------- | --------------------------------------------- |
| `date`   | `string` | 日期，`YYYY-MM-DD` 格式（UTC）。              |
| `total`  | `number` | 当天创建的消息总数。                          |
| `sent`   | `number` | 达到 `sent` 状态的消息数。                    |
| `failed` | `number` | 达到 `failed` 或 `dead` 状态的消息数。        |

<Tabs>
<TabItem value="curl" label="curl">

```bash
# Overview
curl http://localhost:9527/api/admin/stats/overview \
  -H "Authorization: Bearer <jwt>"

# Daily breakdown
curl http://localhost:9527/api/admin/stats/daily \
  -H "Authorization: Bearer <jwt>"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
// Overview
const overviewRes = await fetch(
  "http://localhost:9527/api/admin/stats/overview",
  { headers: { Authorization: `Bearer ${jwt}` } }
);
const overview = await overviewRes.json();
console.log(`Success rate: ${overview.data.successRate}%`);

// Daily breakdown
const dailyRes = await fetch(
  "http://localhost:9527/api/admin/stats/daily",
  { headers: { Authorization: `Bearer ${jwt}` } }
);
const daily = await dailyRes.json();
for (const day of daily.data) {
  console.log(`${day.date}: ${day.total} total, ${day.sent} sent`);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

headers = {"Authorization": f"Bearer {jwt}"}

# Overview
overview = requests.get(
    "http://localhost:9527/api/admin/stats/overview", headers=headers
).json()["data"]
print(f"Success rate: {overview['successRate']}%")

# Daily breakdown
daily = requests.get(
    "http://localhost:9527/api/admin/stats/daily", headers=headers
).json()["data"]
for day in daily:
    print(f"{day['date']}: {day['total']} total, {day['sent']} sent")
```

</TabItem>
</Tabs>

---

## 用户管理

用户管理端点仅限具有 `admin` 角色的用户访问。普通用户将收到 `403 Forbidden` 响应。

### 获取用户列表

<span className="method-badge method-get">GET</span> `/api/admin/users`

获取所有注册用户。

**响应 -- 200 OK：**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "admin@example.com",
      "username": "admin",
      "role": "admin",
      "createdAt": 1719800000000
    },
    {
      "id": 2,
      "email": "user@example.com",
      "username": "user",
      "role": "user",
      "createdAt": 1719849600000
    }
  ]
}
```

---

### 获取用户详情

<span className="method-badge method-get">GET</span> `/api/admin/users/:id`

**路径参数：**

| 参数 | 类型     | 描述      |
| ---- | -------- | --------- |
| `id` | `number` | 用户 ID。 |

---

### 创建用户

<span className="method-badge method-post">POST</span> `/api/admin/users`

创建具有指定角色的新用户。

**请求体：**

| 字段       | 类型     | 必填 | 描述                              |
| ---------- | -------- | ---- | --------------------------------- |
| `email`    | `string` | 是   | 邮箱地址（必须唯一）。            |
| `username` | `string` | 是   | 显示名称（1--50 个字符）。        |
| `password` | `string` | 是   | 密码（最少 6 个字符）。           |
| `role`     | `string` | 否   | `admin` 或 `user`。默认值：`user`。|

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/admin/users \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newadmin@example.com",
    "username": "newadmin",
    "password": "secure-password",
    "role": "admin"
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/admin/users", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "newadmin@example.com",
    username: "newadmin",
    password: "secure-password",
    role: "admin",
  }),
});

const result = await response.json();
console.log("Created user ID:", result.data.id);
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/admin/users",
    headers={"Authorization": f"Bearer {jwt}"},
    json={
        "email": "newadmin@example.com",
        "username": "newadmin",
        "password": "secure-password",
        "role": "admin",
    },
)

print(f"Created user ID: {response.json()['data']['id']}")
```

</TabItem>
</Tabs>

**响应 -- 201 Created：**

```json
{
  "success": true,
  "data": {
    "id": 3,
    "email": "newadmin@example.com",
    "username": "newadmin",
    "role": "admin",
    "createdAt": 1719890000000
  }
}
```

**错误：**

| HTTP 状态码 | 错误信息                   | 描述                          |
| ----------- | -------------------------- | ----------------------------- |
| `400`       | Validation error           | 字段缺失或格式无效。          |
| `409`       | `Email already registered` | 该邮箱已注册账户。            |

---

### 更新用户

<span className="method-badge method-put">PUT</span> `/api/admin/users/:id`

更新用户的个人资料或角色。所有字段都是可选的。

**路径参数：**

| 参数 | 类型     | 描述      |
| ---- | -------- | --------- |
| `id` | `number` | 用户 ID。 |

**请求体：**

| 字段       | 类型     | 必填 | 描述                    |
| ---------- | -------- | ---- | ----------------------- |
| `email`    | `string` | 否   | 新邮箱（必须唯一）。    |
| `username` | `string` | 否   | 新显示名称。            |
| `role`     | `string` | 否   | 新角色：`admin` 或 `user`。|

**响应 -- 200 OK：**

```json
{ "success": true }
```

**错误：**

| HTTP 状态码 | 错误信息               | 描述                             |
| ----------- | ---------------------- | -------------------------------- |
| `404`       | `User not found`       | 指定的用户不存在。               |
| `409`       | `Email already in use` | 其他用户已使用该邮箱。           |

---

### 删除用户

<span className="method-badge method-delete">DELETE</span> `/api/admin/users/:id`

永久删除用户账户。

:::caution
不能删除最后一个管理员用户。此保护措施可防止你被锁定在管理界面之外。
:::

**路径参数：**

| 参数 | 类型     | 描述      |
| ---- | -------- | --------- |
| `id` | `number` | 用户 ID。 |

**响应 -- 200 OK：**

```json
{ "success": true }
```

**错误：**

| HTTP 状态码 | 错误信息                                 | 描述                                       |
| ----------- | ---------------------------------------- | ------------------------------------------ |
| `400`       | `Cannot delete the last admin user`      | 至少需要保留一个管理员账户。               |
| `404`       | `User not found`                         | 指定的用户不存在。                         |
