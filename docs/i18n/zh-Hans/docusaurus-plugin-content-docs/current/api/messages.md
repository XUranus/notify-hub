---
title: 消息 API
sidebar_position: 2
description: "通过 NotifyHub 消息 API 查询和检查通知消息。"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 消息 API

消息 API 让你查询通过 NotifyHub 发送的通知的状态和详情。用于跟踪投递、排查故障和构建仪表盘。

## 基础 URL

| 端点 | 认证 | 说明 |
|------|------|------|
| `/api/v1/messages` | **DualAuth**（JWT 或 API Key） | 推荐 — 支持两种认证方式。 |
| `/api/user/messages` | **仅 JWT** | 需要登录令牌。 |

两个端点返回相同的响应格式。普通用户只能看到自己的消息；管理员可以看到所有。

## 认证

```text
Authorization: Bearer <jwt-令牌或-api-key>
```

---

## 消息生命周期

每条消息从创建到终态经历以下状态机：

```mermaid
stateDiagram-v2
    [*] --> queued : 入队
    queued --> sending : Worker 认领
    sending --> sent : 投递成功
    sending --> failed : 投递失败
    failed --> queued : 自动重试（剩余次数）
    failed --> dead : 超过最大重试次数
    sent --> delivered : 服务商确认送达
```

### 状态说明

| 状态 | 说明 |
|------|------|
| `queued` | 已入队等待。定时消息在此状态直到 `scheduledAt`。 |
| `sending` | Worker 正在向通道服务商投递。 |
| `sent` | 已成功发送（如 SMTP 服务器已接受）。 |
| `delivered` | 服务商确认送达（非所有服务商支持）。 |
| `failed` | 投递失败。如有剩余重试次数，将自动重试。 |
| `dead` | 重试次数耗尽（默认 5 次）。需[手动重试](./admin#retry-a-message)。 |

---

## 查询消息列表

<span className="method-badge method-get">GET</span> `/api/v1/messages`

分页查询消息列表。按 `createdAt DESC` 排序。

### 查询参数

| 参数 | 类型 | 默认值 | 最大值 | 说明 |
|------|------|--------|--------|------|
| `page` | `number` | `1` | — | 页码（从 1 开始）。 |
| `pageSize` | `number` | `50` | `500` | 每页条数。 |
| `status` | `string` | — | — | 按状态过滤：`queued`、`sending`、`sent`、`delivered`、`failed`、`dead`。 |
| `topic` | `string` | — | — | 按主题 ID 过滤。 |

### 响应

**200 OK**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "channelType": "email",
        "channelId": "channel-uuid",
        "toAddress": "user@example.com",
        "subject": "欢迎使用 NotifyHub",
        "body": "您的账户已创建成功。",
        "templateId": null,
        "templateVars": null,
        "status": "sent",
        "retryCount": 0,
        "maxRetries": 5,
        "nextRetryAt": null,
        "errorMessage": null,
        "idempotencyKey": null,
        "ipAddress": "192.168.1.1",
        "ipLocation": "US",
        "app": null,
        "topicId": null,
        "scheduledAt": null,
        "sentAt": 1719849600,
        "createdAt": 1719849595,
        "tags": ["onboarding"],
        "priority": 0,
        "url": null,
        "attachment": null,
        "format": "text"
      }
    ],
    "total": 156,
    "page": 1,
    "pageSize": 50
  }
}
```

### 消息对象字段

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| `id` | `string` | 否 | 消息 UUID。 |
| `channelType` | `string` | 否 | `email`、`sms` 或 `push`。 |
| `channelId` | `string \| null` | 是 | 使用的通道配置 UUID。 |
| `toAddress` | `string` | 否 | 接收地址。 |
| `subject` | `string \| null` | 是 | 消息主题。 |
| `body` | `string \| null` | 是 | 消息正文。 |
| `templateId` | `string \| null` | 是 | 使用的模板 UUID。 |
| `templateVars` | `object \| null` | 是 | 模板变量 JSON 对象。 |
| `status` | `string` | 否 | 当前状态。见[状态说明](#状态说明)。 |
| `retryCount` | `number` | 否 | 已尝试投递次数。 |
| `maxRetries` | `number` | 否 | 最大重试次数（默认 5）。 |
| `nextRetryAt` | `number \| null` | 是 | 下次重试的 Unix 时间戳。 |
| `errorMessage` | `string \| null` | 是 | 最后一次失败的错误信息。 |
| `idempotencyKey` | `string \| null` | 是 | 发送时使用的幂等键。 |
| `ipAddress` | `string \| null` | 是 | 客户端 IP 地址。 |
| `ipLocation` | `string \| null` | 是 | GeoIP 定位。 |
| `app` | `string \| null` | 是 | 应用标识。 |
| `topicId` | `string \| null` | 是 | 关联的主题 UUID。 |
| `scheduledAt` | `number \| null` | 是 | 定时投递的 Unix 时间戳。 |
| `sentAt` | `number \| null` | 是 | 实际发送的 Unix 时间戳。 |
| `createdAt` | `number` | 否 | 入队的 Unix 时间戳。 |
| `tags` | `string[] \| null` | 是 | 标签数组。 |
| `priority` | `number` | 否 | 优先级（0–99）。 |
| `url` | `string \| null` | 是 | 关联 URL。 |
| `attachment` | `object \| null` | 是 | `{ name, url?, data? }`。 |
| `format` | `string` | 否 | `text`、`markdown`、`html` 或 `json`。 |

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
# 查询第一页
curl "http://localhost:9527/api/v1/messages" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 按状态过滤
curl "http://localhost:9527/api/v1/messages?status=failed&page=1&pageSize=20" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const params = new URLSearchParams({
  page: "1",
  pageSize: "20",
  status: "failed",
});

const response = await fetch(
  `http://localhost:9527/api/v1/messages?${params}`,
  {
    headers: {
      Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  }
);

const result = await response.json();
console.log(`共 ${result.data.total} 条，当前 ${result.data.items.length} 条`);
for (const msg of result.data.items) {
  console.log(`  ${msg.id} → ${msg.toAddress} [${msg.status}]`);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.get(
    "http://localhost:9527/api/v1/messages",
    headers={"Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
    params={"page": 1, "pageSize": 20, "status": "failed"},
)

data = response.json()["data"]
print(f"共 {data['total']} 条，当前 {len(data['items'])} 条")
for msg in data["items"]:
    print(f"  {msg['id']} → {msg['toAddress']} [{msg['status']}]")
```

</TabItem>
<TabItem value="go" label="Go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

func main() {
	params := url.Values{}
	params.Set("page", "1")
	params.Set("pageSize", "20")
	params.Set("status", "failed")

	req, _ := http.NewRequest("GET", "http://localhost:9527/api/v1/messages?"+params.Encode(), nil)
	req.Header.Set("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	data := result["data"].(map[string]interface{})
	fmt.Printf("共 %.0f 条\n", data["total"])
}
```

</TabItem>
<TabItem value="php" label="PHP">

```php
<?php
$ch = curl_init('http://localhost:9527/api/v1/messages?' . http_build_query([
    'page' => 1,
    'pageSize' => 20,
    'status' => 'failed',
]));
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => ['Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
    CURLOPT_RETURNTRANSFER => true,
]);

$response = json_decode(curl_exec($ch), true);
curl_close($ch);

echo "共 {$response['data']['total']} 条\n";
foreach ($response['data']['items'] as $msg) {
    echo "  {$msg['id']} → {$msg['toAddress']} [{$msg['status']}]\n";
}
```

</TabItem>
<TabItem value="rust" label="Rust">

```rust
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, Debug)]
struct ApiResponse {
    success: bool,
    data: Option<Value>,
    error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let resp = client
        .get("http://localhost:9527/api/v1/messages")
        .header("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        .query(&[("page", "1"), ("pageSize", "20"), ("status", "failed")])
        .send()
        .await?;

    let result: ApiResponse = resp.json().await?;
    println!("{:#?}", result.data);
    Ok(())
}
```

</TabItem>
</Tabs>

---

## 查询单条消息

<span className="method-badge method-get">GET</span> `/api/v1/messages/{id}`

根据 UUID 查询消息详情。

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 消息 UUID。 |

### 响应

**200 OK** — 返回与列表相同的[消息对象](#消息对象字段)。

**404 Not Found**

```json
{
  "success": false,
  "error": "message not found"
}
```

:::info 权限控制
普通用户只能查询自己的消息。请求他人消息返回 404（非 403），避免信息泄露。
:::

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl "http://localhost:9527/api/v1/messages/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const messageId = "550e8400-e29b-41d4-a716-446655440000";
const response = await fetch(
  `http://localhost:9527/api/v1/messages/${messageId}`,
  {
    headers: {
      Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  }
);

const result = await response.json();
if (result.success) {
  console.log(`${result.data.toAddress}: ${result.data.status}`);
} else {
  console.error(result.error);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

message_id = "550e8400-e29b-41d4-a716-446655440000"
response = requests.get(
    f"http://localhost:9527/api/v1/messages/{message_id}",
    headers={"Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
)

result = response.json()
if result["success"]:
    msg = result["data"]
    print(f"{msg['toAddress']}: {msg['status']}")
else:
    print(f"错误: {result['error']}")
```

</TabItem>
<TabItem value="go" label="Go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	id := "550e8400-e29b-41d4-a716-446655440000"
	req, _ := http.NewRequest("GET", "http://localhost:9527/api/v1/messages/"+id, nil)
	req.Header.Set("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	if result["success"].(bool) {
		data := result["data"].(map[string]interface{})
		fmt.Printf("%s: %s\n", data["toAddress"], data["status"])
	} else {
		fmt.Println("错误:", result["error"])
	}
}
```

</TabItem>
<TabItem value="php" label="PHP">

```php
<?php
$id = "550e8400-e29b-41d4-a716-446655440000";
$ch = curl_init("http://localhost:9527/api/v1/messages/{$id}");
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => ['Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
    CURLOPT_RETURNTRANSFER => true,
]);

$result = json_decode(curl_exec($ch), true);
curl_close($ch);

if ($result['success']) {
    echo "{$result['data']['toAddress']}: {$result['data']['status']}\n";
} else {
    echo "错误: {$result['error']}\n";
}
```

</TabItem>
<TabItem value="rust" label="Rust">

```rust
use reqwest::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let id = "550e8400-e29b-41d4-a716-446655440000";
    let resp = client
        .get(format!("http://localhost:9527/api/v1/messages/{}", id))
        .header("Authorization", "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        .send()
        .await?;

    let result: serde_json::Value = resp.json().await?;
    if result["success"].as_bool().unwrap_or(false) {
        let msg = &result["data"];
        println!("{}: {}", msg["toAddress"], msg["status"]);
    } else {
        println!("错误: {}", result["error"]);
    }
    Ok(())
}
```

</TabItem>
</Tabs>

---

## 错误码

| HTTP | 错误 | 说明 |
|------|------|------|
| `400` | `invalid user id` | 认证令牌中的用户 ID 无效。 |
| `401` | `missing Authorization header` | 未提供 `Authorization` Header。 |
| `401` | `invalid API token` | Token 不存在。 |
| `401` | `token has expired` | JWT 已过期。 |
| `403` | `token is disabled` | Token 已被管理员禁用。 |
| `404` | `message not found` | 消息不存在或属于其他用户。 |
| `500` | `database error: <detail>` | 内部数据库错误。 |

---

## 重试机制

投递失败时，NotifyHub 自动以**指数退避**重试：

| 重试次数 | 重试前延迟 |
|----------|-----------|
| 1 | 1 秒 |
| 2 | 5 秒 |
| 3 | 30 秒 |
| 4 | 5 分钟 |
| 5 | 30 分钟 |

5 次重试后消息变为 `dead` 状态。使用 [Admin API](./admin#retry-a-message) 手动重试。

:::info
`failed` 是瞬态状态 — Worker 会在 `nextRetryAt` 到达时自动重试。只有 `dead` 需要手动干预。
:::
