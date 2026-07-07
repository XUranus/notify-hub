---
title: Messages API
sidebar_position: 2
description: "Query and inspect notification messages through the NotifyHub Messages API."
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Messages API

The Messages API lets you query the status and details of notifications sent through NotifyHub. Use it to track delivery, inspect failures, and build dashboards.

## Base URLs

| Endpoint | Auth | Description |
|----------|------|-------------|
| `/api/v1/messages` | **DualAuth** (JWT or API Key) | Recommended — supports both auth methods. |
| `/api/user/messages` | **JWT only** | Requires login token. |

Both endpoints return the same response format. Non-admin users see only their own messages; admin users see all.

## Authentication

```text
Authorization: Bearer <jwt-token-or-api-key>
```

---

## Message Lifecycle

Every message progresses through a state machine from creation to terminal state:

```mermaid
stateDiagram-v2
    [*] --> queued : Enqueued
    queued --> sending : Worker picks up
    sending --> sent : Delivery succeeded
    sending --> failed : Delivery failed
    failed --> queued : Auto-retry (if retries remain)
    failed --> dead : Max retries exceeded
    sent --> delivered : Confirmed by provider
```

### Status Descriptions

| Status | Description |
|--------|-------------|
| `queued` | Enqueued and waiting. Scheduled messages stay here until `scheduledAt`. |
| `sending` | Worker is actively delivering to the channel provider. |
| `sent` | Successfully dispatched (e.g., SMTP server accepted). |
| `delivered` | Provider confirmed delivery (not all providers support this). |
| `failed` | Delivery failed. Auto-retried with exponential backoff if retries remain. |
| `dead` | All retries exhausted (default: 5). Requires [manual retry](./admin#retry-a-message). |

---

## List Messages

<span className="method-badge method-get">GET</span> `/api/v1/messages`

Retrieve a paginated list of messages. Ordered by `createdAt DESC`.

### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | `number` | `1` | — | Page number (1-based). |
| `pageSize` | `number` | `50` | `500` | Items per page. |
| `status` | `string` | — | — | Filter by status: `queued`, `sending`, `sent`, `delivered`, `failed`, `dead`. |
| `topic` | `string` | — | — | Filter by topic ID. |

### Response

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
        "subject": "Welcome to NotifyHub",
        "body": "Your account has been created.",
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

### Message Object

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `string` | No | UUID of the message. |
| `channelType` | `string` | No | `email`, `sms`, or `push`. |
| `channelId` | `string \| null` | Yes | UUID of the channel config used. |
| `toAddress` | `string` | No | Recipient address. |
| `subject` | `string \| null` | Yes | Message subject. |
| `body` | `string \| null` | Yes | Message body. |
| `templateId` | `string \| null` | Yes | UUID of the template used. |
| `templateVars` | `object \| null` | Yes | Template variables as JSON object. |
| `status` | `string` | No | Current status. See [Status Descriptions](#status-descriptions). |
| `retryCount` | `number` | No | Delivery attempts so far. |
| `maxRetries` | `number` | No | Max retries allowed (default: 5). |
| `nextRetryAt` | `number \| null` | Yes | Unix timestamp of next retry. |
| `errorMessage` | `string \| null` | Yes | Last error message on failure. |
| `idempotencyKey` | `string \| null` | Yes | Idempotency key used at send time. |
| `ipAddress` | `string \| null` | Yes | Client IP address. |
| `ipLocation` | `string \| null` | Yes | GeoIP location. |
| `app` | `string \| null` | Yes | Application identifier. |
| `topicId` | `string \| null` | Yes | Associated topic UUID. |
| `scheduledAt` | `number \| null` | Yes | Unix timestamp of scheduled delivery. |
| `sentAt` | `number \| null` | Yes | Unix timestamp when sent. |
| `createdAt` | `number` | No | Unix timestamp when enqueued. |
| `tags` | `string[] \| null` | Yes | Tags array. |
| `priority` | `number` | No | Priority level (0–99). |
| `url` | `string \| null` | Yes | Associated URL. |
| `attachment` | `object \| null` | Yes | `{ name, url?, data? }`. |
| `format` | `string` | No | `text`, `markdown`, `html`, or `json`. |

### Examples

<Tabs>
<TabItem value="curl" label="curl">

```bash
# List first page
curl "http://localhost:9527/api/v1/messages" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Filter by status and pagination
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
console.log(`Showing ${result.data.items.length} of ${result.data.total}`);
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
print(f"Showing {len(data['items'])} of {data['total']}")
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
	fmt.Printf("Total: %.0f\n", data["total"])
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

echo "Total: {$response['data']['total']}\n";
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

## Get a Single Message

<span className="method-badge method-get">GET</span> `/api/v1/messages/{id}`

Retrieve the full details of a specific message by UUID.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | UUID of the message. |

### Response

**200 OK** — Returns the same [Message Object](#message-object) as the list endpoint.

**404 Not Found**

```json
{
  "success": false,
  "error": "message not found"
}
```

:::info Access control
Non-admin users can only retrieve their own messages. Requesting another user's message returns 404 (not 403) to avoid information leakage.
:::

### Examples

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
    print(f"Error: {result['error']}")
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
		fmt.Println("Error:", result["error"])
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
    echo "Error: {$result['error']}\n";
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
        println!("Error: {}", result["error"]);
    }
    Ok(())
}
```

</TabItem>
</Tabs>

---

## Error Codes

| HTTP | Error | Description |
|------|-------|-------------|
| `400` | `invalid user id` | Auth token contains invalid user ID. |
| `401` | `missing Authorization header` | No `Authorization` header provided. |
| `401` | `invalid API token` | Token does not exist in database. |
| `401` | `token has expired` | JWT has expired. |
| `403` | `token is disabled` | Token disabled by admin. |
| `404` | `message not found` | Message does not exist or belongs to another user. |
| `500` | `database error: <detail>` | Internal database error. |

---

## Retry Behavior

When a message fails to deliver, NotifyHub automatically retries with **exponential backoff**:

| Retry # | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 5 seconds |
| 3 | 30 seconds |
| 4 | 5 minutes |
| 5 | 30 minutes |

After 5 retries, the message moves to `dead` status. Use the [Admin API](./admin#retry-a-message) to manually retry dead messages.

:::info
The `failed` status is transient — the worker automatically picks it up for retry when `nextRetryAt` arrives. Only `dead` messages require manual intervention.
:::
