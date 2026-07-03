---
title: 发送 API
sidebar_position: 1
description: 通过 NotifyHub 发送 API 发送单条或批量通知。
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 发送 API

发送 API 让你通过任何已配置的渠道（邮件、短信或推送）向一个或多个接收者发送通知。所有发送端点都需要一个具有相应渠道权限的 **API 令牌**。

## 基础 URL

```text
http://<your-host>:9527/api/v1/send
```

## 认证

每个请求都必须在 `Authorization` 头中包含有效的 API 令牌：

```text
Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

令牌通过[管理 API](./admin#令牌管理) 创建，并带有一个或多个**权限范围**，用于确定该令牌允许通过哪些渠道类型发送消息。可用的权限范围如下：

| 范围   | 描述                      |
| ------ | ------------------------- |
| `email` | 通过邮件渠道发送消息 |
| `sms`   | 通过短信渠道发送消息   |
| `push`  | 通过推送渠道发送消息  |
| `*`     | 通配符 — 所有渠道类型    |

如果令牌的权限范围不包含请求体中指定的渠道类型，API 将返回 `403 Forbidden` 响应。

令牌还可以配置以下内容：

- **速率限制** — 每分钟最大请求数（默认：100）
- **IP 白名单** — 仅允许来自特定 IP 地址的请求

---

## 发送单条消息

<span className="method-badge method-post">POST</span> `/api/v1/send`

将单条通知入队等待投递。

### 请求体

| 字段              | 类型              | 是否必填               | 描述                                                                                                              |
| ----------------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `channel`         | `string`          | 是                    | 渠道类型：`email`、`sms` 或 `push`。                                                                                 |
| `to`              | `string`          | 是                    | 接收者地址。根据渠道不同，可以是邮箱地址、手机号或设备令牌。                             |
| `subject`         | `string`          | 否                     | 消息主题（主要用于邮件）。如果未使用带主题的模板，则为必填项。                                     |
| `body`            | `string`          | 视情况而定            | 消息正文。如果未提供 `template`，则为必填项。                                                               |
| `template`        | `string`          | 否                     | 预配置模板的名称。提供后，`body` 为可选项（将使用模板正文）。                        |
| `variables`       | `Record<string, string>` | 否            | 用于替换模板中占位符的键值对。参见[模板用法](#模板用法)。                                  |
| `idempotencyKey`  | `string`          | 否                     | 用于防止重复发送的唯一键。参见[幂等键](#幂等键)。                                           |
| `scheduledAt`     | `string`          | 否                     | ISO 8601 日期时间字符串。消息在此时间之前不会被投递。示例：`2025-07-01T09:00:00Z`。           |
| `channelId`       | `number`          | 否                     | 要使用的特定渠道实例 ID。如果省略，将自动选择给定类型的默认渠道。       |
| `tags`            | `string[]`        | 否                     | 消息的分类标签。默认为 `[]`。示例：`["deploy", "production"]`。                           |
| `priority`        | `number`          | 否                     | 优先级，从 `0`（最低，默认）到 `99`（最高）。优先级高的消息先投递。               |
| `url`             | `string`          | 否                     | 与消息关联的 URL。客户端可用于可点击链接或深度跳转。                             |
| `delay`           | `string`          | 否                     | 相对延迟时间。覆盖 `scheduledAt`。参见[延迟语法](#延迟语法)。                              |
| `attachment`      | `object`          | 否                     | 文件附件。参见[附件](#附件)。                                                                        |
| `format`          | `string`          | 否                     | 正文格式：`text`（默认）、`markdown`、`html` 或 `json`。客户端据此渲染富文本内容。              |

### 响应

**成功 -- 201 Created**

```json
{
  "success": true,
  "data": {
    "messageId": 42,
    "status": "queued"
  }
}
```

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "to": "user@example.com",
    "subject": "Welcome to NotifyHub",
    "body": "Your account has been created successfully."
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/v1/send", {
  method: "POST",
  headers: {
    Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    channel: "email",
    to: "user@example.com",
    subject: "Welcome to NotifyHub",
    body: "Your account has been created successfully.",
  }),
});

const result = await response.json();
console.log(result);
// { success: true, data: { messageId: 42, status: "queued" } }
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/v1/send",
    headers={
        "Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "Content-Type": "application/json",
    },
    json={
        "channel": "email",
        "to": "user@example.com",
        "subject": "Welcome to NotifyHub",
        "body": "Your account has been created successfully.",
    },
)

print(response.json())
# {"success": True, "data": {"messageId": 42, "status": "queued"}}
```

</TabItem>
</Tabs>

---

## 批量发送消息

<span className="method-badge method-post">POST</span> `/api/v1/send/batch`

在单个请求中最多入队 **100 条消息**。批量中的每条消息独立处理 — 如果某条消息未通过权限范围或模板验证，批量中其余消息仍会被处理。

### 请求体

| 字段       | 类型         | 是否必填 | 描述                                          |
| ---------- | ----------- | -------- | ---------------------------------------------------- |
| `messages` | `Message[]` | 是      | 消息对象数组（1--100）。每条消息使用与[单条发送](#请求体)端点相同的 schema。 |

### 响应

**成功 -- 200 OK**

`data` 数组包含批量中每条消息的一个条目。每个条目要么是成功对象，要么是错误对象。

```json
{
  "success": true,
  "data": [
    { "messageId": 42, "status": "queued" },
    { "messageId": 43, "status": "queued" },
    { "error": "Token does not have 'sms' scope" }
  ]
}
```

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/v1/send/batch \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "channel": "email",
        "to": "alice@example.com",
        "subject": "Batch Notification",
        "body": "Hello Alice!"
      },
      {
        "channel": "email",
        "to": "bob@example.com",
        "subject": "Batch Notification",
        "body": "Hello Bob!"
      },
      {
        "channel": "sms",
        "to": "+1234567890",
        "body": "SMS alert"
      }
    ]
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/v1/send/batch", {
  method: "POST",
  headers: {
    Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [
      {
        channel: "email",
        to: "alice@example.com",
        subject: "Batch Notification",
        body: "Hello Alice!",
      },
      {
        channel: "email",
        to: "bob@example.com",
        subject: "Batch Notification",
        body: "Hello Bob!",
      },
      {
        channel: "sms",
        to: "+1234567890",
        body: "SMS alert",
      },
    ],
  }),
});

const result = await response.json();
console.log(result.data);
// [
//   { messageId: 42, status: "queued" },
//   { messageId: 43, status: "queued" },
//   { messageId: 44, status: "queued" }
// ]
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/v1/send/batch",
    headers={
        "Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "Content-Type": "application/json",
    },
    json={
        "messages": [
            {
                "channel": "email",
                "to": "alice@example.com",
                "subject": "Batch Notification",
                "body": "Hello Alice!",
            },
            {
                "channel": "email",
                "to": "bob@example.com",
                "subject": "Batch Notification",
                "body": "Hello Bob!",
            },
            {
                "channel": "sms",
                "to": "+1234567890",
                "body": "SMS alert",
            },
        ],
    },
)

print(response.json()["data"])
# [{"messageId": 42, "status": "queued"}, {"messageId": 43, "status": "queued"}, ...]
```

</TabItem>
</Tabs>

---

## 模板用法

你可以通过名称引用**模板**，而不是为每条消息提供原始 `body`（以及可选的 `subject`）。模板通过[管理 API](./admin#模板管理) 创建和管理。

### 工作原理

1. 通过管理 API 创建模板，包含名称、渠道类型以及含有 `{{variable}}` 占位符的正文。
2. 发送消息时，将 `template` 字段设置为模板名称，并传入 `variables` 作为替换值。

### 模板语法

模板使用 `{{variableName}}` 占位符。你还可以使用管道语法提供默认值：

```text
Hello {{userName | default:"there"}}, your order #{{orderId}} is ready.
```

- 如果 `variables.userName` 为 `"Alice"`，结果为 `Hello Alice, your order #12345 is ready.`
- 如果未提供 `userName`，结果为 `Hello there, your order #12345 is ready.`
- 如果变量没有值也没有默认值，占位符将保持原样（`{{variableName}}`）。

### 示例

假设你有一个名为 `welcome-email` 的 `email` 渠道模板：

**模板定义：**
- **name:** `welcome-email`
- **channelType:** `email`
- **subject:** `Welcome, {{userName}}!`
- **body:** `Hi {{userName}},\n\nYour account ({{userEmail}}) is ready. Start exploring at {{appUrl | default:"https://app.example.com"}}.`

**发送请求：**

```json
{
  "channel": "email",
  "to": "newuser@example.com",
  "template": "welcome-email",
  "variables": {
    "userName": "Alice",
    "userEmail": "newuser@example.com"
  }
}
```

**最终消息：**
- **subject:** `Welcome, Alice!`
- **body:** `Hi Alice,\n\nYour account (newuser@example.com) is ready. Start exploring at https://app.example.com.`

:::note
如果同时提供了 `body` 和 `template`，正文内容将以 `template` 为准。模板的 subject（如果已定义）同样会覆盖 `subject` 字段。
:::

:::tip
模板解析发生在**入队时**，而非投递时。如果你在消息入队后更新了模板，已入队的消息将使用原始模板内容。
:::

---

## 幂等键

幂等键确保即使请求被重试（例如由于网络超时），同一条通知也不会被多次发送。

在 `idempotencyKey` 字段中传入一个唯一字符串：

```json
{
  "channel": "email",
  "to": "user@example.com",
  "subject": "Order Confirmation",
  "body": "Your order #12345 has been confirmed.",
  "idempotencyKey": "order-12345-confirmation"
}
```

**行为：**

- 如果系统中已存在具有相同 `idempotencyKey` 的消息（无论状态如何），API 将返回已有消息的 ID，而不是创建新消息。
- 响应与正常发送完全相同 — 你无法区分消息是新创建的还是已存在的。
- 幂等键在整个系统中是唯一的，而非按令牌或按渠道唯一。

:::caution
幂等键在模板解析**之前**检查。如果你需要向同一接收者使用不同变量发送同一模板，请为每次使用不同的幂等键。
:::

---

## 定时发送

要延迟消息投递，请在 `scheduledAt` 字段中包含 ISO 8601 日期时间：

```json
{
  "channel": "email",
  "to": "user@example.com",
  "subject": "Scheduled Report",
  "body": "Your weekly report is attached.",
  "scheduledAt": "2025-07-01T09:00:00Z"
}
```

**行为：**

- 消息会立即入队，状态为 `queued`，但 Worker 在预定时间到达之前不会处理它。
- 如果 `scheduledAt` 在过去，消息将被视为可立即投递。
- 时间以 UTC 解释。

也可以使用 `delay` 字段进行相对延迟。参见[延迟语法](#延迟语法)。

---

## 延迟语法

`delay` 字段提供了一种便捷的方式，使用相对时间或绝对日期时间来调度消息。当同时提供 `delay` 和 `scheduledAt` 时，`delay` 优先。

### 相对时间

格式：`<数字><单位>`，单位如下：

| 单位 | 含义 |
| ---- | ---- |
| `s`  | 秒   |
| `m`  | 分钟 |
| `h`  | 小时 |
| `d`  | 天   |
| `w`  | 周   |

示例：`30s`、`5m`、`1h`、`2d`、`1w`

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "提醒",
  "body": "会议将在 30 分钟后开始。",
  "delay": "30m"
}
```

### 绝对日期时间

格式：`yyyy-mm-dd hh:mm:ss`（按服务器本地时区解释）。

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "维护窗口",
  "body": "计划维护现在开始。",
  "delay": "2025-12-31 23:59:59"
}
```

:::caution
如果 `delay` 格式无效，API 将返回 `400 Bad Request` 并附带验证错误信息。
:::

---

## 附件

可以使用 `attachment` 字段为消息附加文件。附件支持两种模式：**基于 URL**（客户端从 URL 下载文件）和 **Base64 编码**（文件数据直接嵌入）。

### 附件结构

| 字段   | 类型     | 必填条件          | 描述                          |
| ------ | -------- | ----------------- | ----------------------------- |
| `name` | `string` | 是                | 文件名（如 `report.pdf`）。   |
| `url`  | `string` | url/data 二选一   | 下载文件的 URL。              |
| `data` | `string` | url/data 二选一   | Base64 编码的文件内容。       |

### 基于 URL 的附件

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "构建产物",
  "body": "最新的构建产物已附加。",
  "attachment": {
    "name": "build-output.zip",
    "url": "https://ci.example.com/builds/1234/artifacts.zip"
  }
}
```

### Base64 附件

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "配置导出",
  "body": "您的配置导出已附加。",
  "attachment": {
    "name": "config.json",
    "data": "eyJoZWxsbyI6IndvcmxkIn0="
  }
}
```

:::note
必须提供 `url` 或 `data` 之一。如果两者都缺失，API 将返回 `400 Bad Request`。
:::

---

## 消息格式

`format` 字段告诉客户端如何渲染 `body` 内容。这纯粹是信息性的——服务器按原样存储和投递正文。

| 值         | 描述                                                      |
| ---------- | --------------------------------------------------------- |
| `text`     | 纯文本（默认）。无渲染。                                  |
| `markdown` | Markdown 内容。客户端可渲染加粗、链接、列表等。           |
| `html`     | HTML 内容。客户端可渲染内联 HTML。                        |
| `json`     | 结构化 JSON 数据。客户端可渲染为键值对。                  |

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "告警摘要",
  "body": "<h2>状态</h2><p>所有系统<b>运行正常</b>。</p>",
  "format": "html"
}
```

---

## 标签与优先级

### 标签

标签是用于分类和筛选消息的字符串标签。它们以 JSON 数组的形式存储在消息记录上。

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "告警",
  "body": "CPU 使用率超过 95%。",
  "tags": ["alert", "cpu", "production"]
}
```

### 优先级

优先级是从 `0`（最低，默认）到 `99`（最高）的整数。消息队列优先处理高优先级消息。

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "严重告警",
  "body": "数据库连接池已耗尽。",
  "priority": 90,
  "tags": ["critical", "database"]
}
```

建议的优先级范围：

| 范围   | 级别   | 用途                              |
| ------ | ------ | --------------------------------- |
| `0`    | 普通   | 大多数消息的默认值。              |
| `1-33` | 低     | 信息性，非紧急。                  |
| `34-66`| 中     | 警告，需要注意。                  |
| `67-99`| 高     | 严重告警，需立即处理。            |

---

## 错误码

| HTTP 状态码 | 错误                              | 描述                                                             |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `400`       | 验证错误                   | 请求体未通过 schema 验证。请检查 `error` 字段。     |
| `400`       | `Invalid delay format`             | `delay` 字段不符合相对时间（`30m`、`1h`）或绝对日期时间（`yyyy-mm-dd hh:mm:ss`）格式。 |
| `400`       | `Either body or template is required` | 未提供 `body` 或 `template`。                           |
| `401`       | `Missing or invalid authorization header` | `Authorization` 头缺失或格式错误。              |
| `401`       | `Invalid API token`                | 令牌在数据库中不存在。                               |
| `403`       | `API token is disabled`            | 令牌已被管理员禁用。                                |
| `403`       | `IP address not allowed`           | 请求 IP 不在令牌的 IP 白名单中。                   |
| `403`       | `Token does not have '<channel>' scope` | 令牌的权限范围不包含请求的渠道类型。    |
| `404`       | `Template '<name>' not found for channel '<type>'` | 指定的模板在给定渠道中不存在。 |
| `429`       | `Rate limit exceeded`              | 令牌已超出其每分钟请求限制。                    |
| `500`       | `Failed to enqueue`                | 消息入队时发生内部错误。                   |

---

## 速率限制

速率限制**按 API 令牌**强制执行，使用滑动窗口算法，窗口为 1 分钟。

- 每个令牌有可配置的速率限制（默认：每分钟 100 次请求）。
- 超出限制时，API 返回 `429 Too Many Requests`，并附带 `Retry-After` 头，指示需要等待多少秒。
- 速率限制计数器在单条发送和批量发送端点之间共享。

**429 响应示例：**

```json
{
  "success": false,
  "error": "Rate limit exceeded"
}
```

**响应头：**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 34
```

:::tip
使用 `Retry-After` 头的值在客户端代码中实现自动退避。
:::
