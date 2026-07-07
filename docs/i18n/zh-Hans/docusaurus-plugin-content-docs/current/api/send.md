---
title: 发送 API
sidebar_position: 1
description: "通过 NotifyHub 发送 API 发送单条或批量通知。"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 发送 API

发送 API 让你通过任何已配置的通道（邮件、短信或推送）向一个或多个接收者发送通知。所有发送端点支持 **DualAuth**：JWT 令牌或具有相应通道权限的 API Key。

## 基础 URL

```text
http://<your-host>:9527/api/v1/send
```

## 认证

每个请求必须在 `Authorization` Header 中包含有效的令牌。支持两种认证方式：

| 方式 | Header 值 | 说明 |
|------|----------|------|
| **API Key** | `Bearer nh_xxxxxxxx` | 长期有效的密钥，具有通道权限、速率限制和 IP 白名单。通过 [Admin API](./admin#token-management) 创建。 |
| **JWT** | `Bearer eyJxxxxx.xxxx.xxxx` | 通过[登录](./user#login)获取的短期令牌。无权限范围限制。 |

API Key 携带一个或多个**权限范围**，决定 Key 可以通过哪些通道类型发送：

| 权限 | 说明 |
|------|------|
| `email` | 通过邮件通道发送 |
| `sms` | 通过短信通道发送 |
| `push` | 通过推送通道发送 |
| `*` | 通配符 — 所有通道类型 |

---

## 发送单条消息

<span className="method-badge method-post">POST</span> `/api/v1/send`

入队一条通知进行投递。立即返回消息 ID — 投递是**异步**的。

### 请求体

所有字段名使用 **camelCase**。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `channel` | `string` | **是** | — | 通道类型：`email`、`sms` 或 `push`。 |
| `to` | `string` | **是** | — | 接收地址：邮箱、手机号或推送客户端 UUID（`*` 为广播）。 |
| `subject` | `string` | 否 | `null` | 消息主题（主要用于邮件）。 |
| `body` | `string` | 否* | `null` | 消息正文。*`body` 和 `template` 至少提供一个。 |
| `template` | `string` | 否 | `null` | 模板名称，从模板表中查找。 |
| `variables` | `object` | 否 | `null` | 模板变量键值对，用于 `{{var}}` / `{{var \| default:"value"}}` 替换。 |
| `idempotencyKey` | `string` | 否 | `null` | 幂等键，用于去重。见[幂等性](#幂等性)。 |
| `topic` | `string` | 否 | `null` | 主题名称（解析为当前用户下的主题 ID）。 |
| `tags` | `string[]` | 否 | `[]` | 标签数组。 |
| `priority` | `number` | 否 | `0` | 优先级（越高越先投递）。 |
| `url` | `string` | 否 | `null` | 关联 URL。 |
| `format` | `string` | 否 | `"text"` | 正文格式：`text`、`markdown`、`html` 或 `json`。 |
| `scheduledAt` | `string` | 否 | `null` | 定时投递：`"YYYY-MM-DD HH:MM:SS"` 或 ISO 8601。 |
| `delay` | `string` | 否 | `null` | 延迟投递：`30s`、`5m`、`1h`、`2d`、`1w`。或绝对时间。 |
| `attachment` | `object` | 否 | `null` | 文件附件。见[附件](#附件)。 |

#### 附件对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | **是** | 文件名（如 `report.pdf`）。 |
| `url` | `string` | 否 | 文件下载 URL。 |
| `data` | `string` | 否 | Base64 编码的文件内容。 |

`url` 和 `data` 至少提供一个。

### 校验规则

1. `body` 和 `template` 至少一个非空 → `400 "either body or template is required"`
2. `channel` 必须是 `email`、`sms` 或 `push` → `400 "invalid channel type: <value>"`
3. 指定的模板不存在 → `404 "template '<name>' not found"`
4. `scheduledAt` 格式无效 → `400 "invalid datetime format: <value>"`
5. `delay` 格式无效 → `400 "invalid delay format: <value>"`

### 响应

**200 OK**

```json
{
  "success": true,
  "data": {
    "messageId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `messageId` | `string` | 消息 UUID。 |
| `status` | `string` | 成功时固定为 `"queued"`。 |

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "push",
    "to": "device-uuid-1234",
    "subject": "部署完成",
    "body": "**Build #1234** 已部署到生产环境。",
    "tags": ["deploy", "production"],
    "priority": 80,
    "url": "https://dashboard.example.com/deployments/1234",
    "format": "markdown"
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
    channel: "push",
    to: "device-uuid-1234",
    subject: "部署完成",
    body: "**Build #1234** 已部署到生产环境。",
    tags: ["deploy", "production"],
    priority: 80,
    url: "https://dashboard.example.com/deployments/1234",
    format: "markdown",
  }),
});

const result = await response.json();
console.log(result);
// { success: true, data: { messageId: "550e8400-...", status: "queued" } }
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
        "channel": "push",
        "to": "device-uuid-1234",
        "subject": "部署完成",
        "body": "**Build #1234** 已部署到生产环境。",
        "tags": ["deploy", "production"],
        "priority": 80,
        "url": "https://dashboard.example.com/deployments/1234",
        "format": "markdown",
    },
)

print(response.json())
# {"success": True, "data": {"messageId": "550e8400-...", "status": "queued"}}
```

</TabItem>
<TabItem value="go" label="Go">

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	payload := map[string]interface{}{
		"channel":  "push",
		"to":       "device-uuid-1234",
		"subject":  "部署完成",
		"body":     "**Build #1234** 已部署到生产环境。",
		"tags":     []string{"deploy", "production"},
		"priority": 80,
		"url":      "https://dashboard.example.com/deployments/1234",
		"format":   "markdown",
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "http://localhost:9527/api/v1/send", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	fmt.Println(result)
}
```

</TabItem>
<TabItem value="php" label="PHP">

```php
<?php
$ch = curl_init('http://localhost:9527/api/v1/send');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'channel'  => 'push',
        'to'       => 'device-uuid-1234',
        'subject'  => '部署完成',
        'body'     => '**Build #1234** 已部署到生产环境。',
        'tags'     => ['deploy', 'production'],
        'priority' => 80,
        'url'      => 'https://dashboard.example.com/deployments/1234',
        'format'   => 'markdown',
    ]),
    CURLOPT_RETURNTRANSFER => true,
]);

$response = json_decode(curl_exec($ch), true);
curl_close($ch);
print_r($response);
```

</TabItem>
<TabItem value="rust" label="Rust">

```rust
use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let resp = client
        .post("http://localhost:9527/api/v1/send")
        .header("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        .json(&json!({
            "channel": "push",
            "to": "device-uuid-1234",
            "subject": "部署完成",
            "body": "**Build #1234** 已部署到生产环境。",
            "tags": ["deploy", "production"],
            "priority": 80,
            "url": "https://dashboard.example.com/deployments/1234",
            "format": "markdown"
        }))
        .send()
        .await?;

    let result: serde_json::Value = resp.json().await?;
    println!("{:#?}", result);
    Ok(())
}
```

</TabItem>
</Tabs>

---

## 批量发送

<span className="method-badge method-post">POST</span> `/api/v1/send/batch`

单次请求最多入队 **100 条消息**。每条消息独立处理 — 单条失败不影响其他。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | `SendMessageRequest[]` | **是** | 1–100 条消息数组，每条与[单条发送](#请求体)格式相同。 |

### 响应

**200 OK** — 即使个别消息失败也返回 200。检查每条的 `status`。

```json
{
  "success": true,
  "data": [
    { "messageId": "550e8400-...", "status": "queued" },
    { "messageId": "660e8400-...", "status": "queued" },
    { "messageId": "", "status": "error: template 'xyz' not found" }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `messageId` | `string` | 成功时为 UUID，失败时为空字符串 `""`。 |
| `status` | `string` | 成功为 `"queued"`，失败为 `"error: <message>"`。 |

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/v1/send/batch \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "channel": "email", "to": "alice@example.com", "subject": "批量通知", "body": "你好 Alice！" },
      { "channel": "email", "to": "bob@example.com", "subject": "批量通知", "body": "你好 Bob！" },
      { "channel": "sms", "to": "+1234567890", "body": "短信通知" }
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
      { channel: "email", to: "alice@example.com", subject: "批量通知", body: "你好 Alice！" },
      { channel: "email", to: "bob@example.com", subject: "批量通知", body: "你好 Bob！" },
      { channel: "sms", to: "+1234567890", body: "短信通知" },
    ],
  }),
});

const result = await response.json();
for (const entry of result.data) {
  if (entry.status === "queued") {
    console.log(`✓ ${entry.messageId}`);
  } else {
    console.error(`✗ ${entry.status}`);
  }
}
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
            {"channel": "email", "to": "alice@example.com", "subject": "批量通知", "body": "你好 Alice！"},
            {"channel": "email", "to": "bob@example.com", "subject": "批量通知", "body": "你好 Bob！"},
            {"channel": "sms", "to": "+1234567890", "body": "短信通知"},
        ],
    },
)

for entry in response.json()["data"]:
    if entry["status"] == "queued":
        print(f"✓ {entry['messageId']}")
    else:
        print(f"✗ {entry['status']}")
```

</TabItem>
<TabItem value="go" label="Go">

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	payload := map[string]interface{}{
		"messages": []map[string]interface{}{
			{"channel": "email", "to": "alice@example.com", "subject": "批量通知", "body": "你好 Alice！"},
			{"channel": "email", "to": "bob@example.com", "subject": "批量通知", "body": "你好 Bob！"},
			{"channel": "sms", "to": "+1234567890", "body": "短信通知"},
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "http://localhost:9527/api/v1/send/batch", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
	req.Header.Set("Content-Type", "application/json")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	fmt.Println(result)
}
```

</TabItem>
<TabItem value="php" label="PHP">

```php
<?php
$ch = curl_init('http://localhost:9527/api/v1/send/batch');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'messages' => [
            ['channel' => 'email', 'to' => 'alice@example.com', 'subject' => '批量通知', 'body' => '你好 Alice！'],
            ['channel' => 'email', 'to' => 'bob@example.com', 'subject' => '批量通知', 'body' => '你好 Bob！'],
            ['channel' => 'sms', 'to' => '+1234567890', 'body' => '短信通知'],
        ],
    ]),
    CURLOPT_RETURNTRANSFER => true,
]);

$response = json_decode(curl_exec($ch), true);
curl_close($ch);
foreach ($response['data'] as $entry) {
    echo $entry['status'] === 'queued' ? "✓ {$entry['messageId']}\n" : "✗ {$entry['status']}\n";
}
```

</TabItem>
<TabItem value="rust" label="Rust">

```rust
use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let resp = client
        .post("http://localhost:9527/api/v1/send/batch")
        .header("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        .json(&json!({
            "messages": [
                {"channel": "email", "to": "alice@example.com", "subject": "批量通知", "body": "你好 Alice！"},
                {"channel": "email", "to": "bob@example.com", "subject": "批量通知", "body": "你好 Bob！"},
                {"channel": "sms", "to": "+1234567890", "body": "短信通知"}
            ]
        }))
        .send()
        .await?;

    let result: serde_json::Value = resp.json().await?;
    println!("{:#?}", result);
    Ok(())
}
```

</TabItem>
</Tabs>

---

## 模板使用

可以通过 `template` 字段引用预配置的模板。

### 模板语法

使用 `{{variableName}}` 占位符，支持默认值：

```text
你好 {{userName | default:"用户"}}，订单 #{{orderId}} 已就绪。
```

- `variables.userName = "Alice"` → `你好 Alice，订单 #12345 已就绪。`
- 未提供 `userName` → `你好 用户，订单 #12345 已就绪。`

:::note
`body` 和 `template` 同时提供时，模板优先。模板的 subject（如有）也会覆盖请求中的 `subject` 字段。
:::

:::tip
模板在**入队时**解析，非投递时。更新模板不影响已入队的消息。
:::

---

## 幂等性

传入唯一的 `idempotencyKey` 防止重复发送：

```json
{
  "channel": "email",
  "to": "user@example.com",
  "subject": "订单确认",
  "body": "订单 #12345 已确认。",
  "idempotencyKey": "order-12345-confirmation"
}
```

- 相同 key 已存在时返回已有消息 ID。
- Key 全局唯一，非按 token 或通道隔离。
- 在模板解析**之前**检查。

---

## 定时发送

### 绝对时间（`scheduledAt`）

```json
{ "scheduledAt": "2025-07-01T09:00:00Z" }
```

UTC 时间。若为过去时间则立即可投递。

### 相对延迟（`delay`）

| 单位 | 含义 | 示例 |
|------|------|------|
| `s` | 秒 | `30s` |
| `m` | 分钟 | `5m` |
| `h` | 小时 | `1h` |
| `d` | 天 | `2d` |
| `w` | 周 | `1w` |

```json
{ "delay": "30m" }
```

:::caution
`scheduledAt` 和 `delay` 同时提供时，`scheduledAt` 优先。
:::

---

## 附件

### 上传文件（可选）

```bash
curl -X POST http://localhost:9527/api/user/upload \
  -H "Authorization: Bearer nh_your_token_here" \
  -F "file=@report.pdf"
```

返回 `{ "data": { "url": "/uploads/<uuid>.pdf", ... } }`。

### URL 方式

```json
{ "attachment": { "name": "build.zip", "url": "https://ci.example.com/builds/1234/artifacts.zip" } }
```

### Base64 方式

```json
{ "attachment": { "name": "config.json", "data": "eyJoZWxsbyI6IndvcmxkIn0=" } }
```

---

## 消息格式

`format` 字段告诉客户端如何渲染 `body`：

| 值 | 说明 |
|----|------|
| `text` | 纯文本（默认）。 |
| `markdown` | Markdown — 客户端可渲染加粗、链接、列表。 |
| `html` | HTML — 客户端可渲染内联 HTML。 |
| `json` | 结构化 JSON — 客户端可渲染为键值对。 |

---

## 标签与优先级

**标签** — 分类过滤用：

```json
{ "tags": ["alert", "cpu", "production"] }
```

**优先级** — 整数 `0`（最低，默认）到 `99`（最高）：

| 范围 | 级别 | 场景 |
|------|------|------|
| `0` | 普通 | 默认。 |
| `1–33` | 低 | 信息性通知。 |
| `34–66` | 中 | 警告。 |
| `67–99` | 高 | 紧急告警。 |

---

## 错误码

| HTTP | 错误 | 说明 |
|------|------|------|
| `400` | `either body or template is required` | `body` 和 `template` 均未提供。 |
| `400` | `invalid channel type: <value>` | `channel` 不是 `email`、`sms` 或 `push`。 |
| `400` | `invalid datetime format: <value>` | `scheduledAt` 格式无效。 |
| `400` | `invalid delay format: <value>` | `delay` 格式无效。 |
| `400` | `invalid json: <detail>` | 请求体非合法 JSON。 |
| `401` | `missing Authorization header` | 缺少 `Authorization` Header。 |
| `401` | `invalid API token` | Token 不存在。 |
| `401` | `token has expired` | JWT 已过期。 |
| `403` | `token is disabled` | Token 已被管理员禁用。 |
| `403` | `Token does not have '<channel>' scope` | Key 缺少该通道权限。 |
| `404` | `template '<name>' not found` | 模板不存在。 |
| `429` | `Rate limit exceeded` | 超出速率限制。检查 `Retry-After` Header。 |
| `500` | `database error: <detail>` | 内部数据库错误。 |

---

## 速率限制

按 **API Key** 限流，滑动窗口（1 分钟，默认 100 次/分钟）。

超限时返回 `429 Too Many Requests` + `Retry-After` Header：

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 34
```

```json
{ "success": false, "error": "Rate limit exceeded" }
```

:::tip
在客户端代码中使用 `Retry-After` Header 值实现自动退避。
:::
