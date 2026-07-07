---
title: Send API
sidebar_position: 1
description: "Send single or batch notifications through the NotifyHub Send API."
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Send API

The Send API lets you dispatch notifications to one or more recipients through any configured channel — email, SMS, or push. All send endpoints support **DualAuth**: either a JWT token or an API key with the appropriate channel scope.

## Base URL

```text
http://<your-host>:9527/api/v1/send
```

## Authentication

Every request must include a valid token in the `Authorization` header. Two auth methods are supported:

| Method | Header Value | Description |
|--------|-------------|-------------|
| **API Key** | `Bearer nh_xxxxxxxx` | Long-lived key with channel scopes, rate limits, and IP whitelists. Created via [Admin API](./admin#token-management). |
| **JWT** | `Bearer eyJxxxxx.xxxx.xxxx` | Short-lived token from [login](./user#login). No scope restrictions. |

API keys carry one or more **scopes** that determine which channel types the key is allowed to send through:

| Scope | Description |
|-------|-------------|
| `email` | Send messages via email channels |
| `sms` | Send messages via SMS channels |
| `push` | Send messages via push channels |
| `*` | Wildcard — all channel types |

If the key's scopes do not include the channel type specified in the request body, the API returns `403 Forbidden`.

---

## Send a Single Message

<span className="method-badge method-post">POST</span> `/api/v1/send`

Enqueue a single notification for delivery. Returns immediately with the message ID — delivery is **asynchronous**.

### Request Body

All field names are **camelCase** in JSON.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `channel` | `string` | **Yes** | — | Channel type: `email`, `sms`, or `push`. |
| `to` | `string` | **Yes** | — | Recipient address: email address, phone number, or push client UUID (`*` for broadcast). |
| `subject` | `string` | No | `null` | Message subject (mainly for email). |
| `body` | `string` | No* | `null` | Message body text. *At least one of `body` or `template` is required. |
| `template` | `string` | No | `null` | Template name to render. Looked up in the templates table. |
| `variables` | `object` | No | `null` | Key-value pairs for `{{var}}` / `{{var \| default:"value"}}` template substitution. |
| `idempotencyKey` | `string` | No | `null` | Unique key for deduplication. See [Idempotency](#idempotency-keys). |
| `topic` | `string` | No | `null` | Topic name (resolved to topic ID scoped to the authenticated user). |
| `tags` | `string[]` | No | `[]` | Arbitrary tags for categorization. |
| `priority` | `number` | No | `0` | Priority level (higher = delivered first). |
| `url` | `string` | No | `null` | Associated URL for client-side linking. |
| `format` | `string` | No | `"text"` | Body format: `text`, `markdown`, `html`, or `json`. |
| `scheduledAt` | `string` | No | `null` | Absolute delivery time: `"YYYY-MM-DD HH:MM:SS"` or `"YYYY-MM-DDTHH:MM:SS"`. |
| `delay` | `string` | No | `null` | Relative delay: `30s`, `5m`, `1h`, `2d`, `1w`. Or absolute: `"YYYY-MM-DD HH:MM:SS"`. |
| `attachment` | `object` | No | `null` | File attachment. See [Attachments](#attachments). |

#### Attachment Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | **Yes** | Filename (e.g., `report.pdf`). |
| `url` | `string` | No | URL to download the file from. |
| `data` | `string` | No | Base64-encoded file content. |

Either `url` or `data` must be provided.

### Validation Rules

1. At least one of `body` or `template` must be non-null → `400 "either body or template is required"`
2. `channel` must be `email`, `sms`, or `push` → `400 "invalid channel type: <value>"`
3. If `template` is provided but not found → `404 "template '<name>' not found"`
4. If `scheduledAt` format is invalid → `400 "invalid datetime format: <value>"`
5. If `delay` format is invalid → `400 "invalid delay format: <value>"`

### Response

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

| Field | Type | Description |
|-------|------|-------------|
| `messageId` | `string` | UUID v4 of the enqueued message. |
| `status` | `string` | Always `"queued"` on success. |

### Examples

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "push",
    "to": "device-uuid-1234",
    "subject": "Deployment Complete",
    "body": "**Build #1234** deployed to production.",
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
    subject: "Deployment Complete",
    body: "**Build #1234** deployed to production.",
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
        "subject": "Deployment Complete",
        "body": "**Build #1234** deployed to production.",
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
		"subject":  "Deployment Complete",
		"body":     "**Build #1234** deployed to production.",
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
        'subject'  => 'Deployment Complete',
        'body'     => '**Build #1234** deployed to production.',
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
            "subject": "Deployment Complete",
            "body": "**Build #1234** deployed to production.",
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

## Send a Batch of Messages

<span className="method-badge method-post">POST</span> `/api/v1/send/batch`

Enqueue up to **100 messages** in a single request. Each message is processed independently — failures on one message do not affect others.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `SendMessageRequest[]` | **Yes** | Array of 1–100 message objects. Each uses the same schema as [single send](#request-body). |

### Response

**200 OK** — Always returns 200 even if individual messages fail. Check each entry's `status`.

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

| Field | Type | Description |
|-------|------|-------------|
| `messageId` | `string` | UUID on success, empty string `""` on failure. |
| `status` | `string` | `"queued"` on success, `"error: <message>"` on failure. |

### Examples

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
      { channel: "email", to: "alice@example.com", subject: "Batch", body: "Hello Alice!" },
      { channel: "email", to: "bob@example.com", subject: "Batch", body: "Hello Bob!" },
      { channel: "sms", to: "+1234567890", body: "SMS alert" },
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
            {"channel": "email", "to": "alice@example.com", "subject": "Batch", "body": "Hello Alice!"},
            {"channel": "email", "to": "bob@example.com", "subject": "Batch", "body": "Hello Bob!"},
            {"channel": "sms", "to": "+1234567890", "body": "SMS alert"},
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
			{"channel": "email", "to": "alice@example.com", "subject": "Batch", "body": "Hello Alice!"},
			{"channel": "email", "to": "bob@example.com", "subject": "Batch", "body": "Hello Bob!"},
			{"channel": "sms", "to": "+1234567890", "body": "SMS alert"},
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
            ['channel' => 'email', 'to' => 'alice@example.com', 'subject' => 'Batch', 'body' => 'Hello Alice!'],
            ['channel' => 'email', 'to' => 'bob@example.com', 'subject' => 'Batch', 'body' => 'Hello Bob!'],
            ['channel' => 'sms', 'to' => '+1234567890', 'body' => 'SMS alert'],
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
                {"channel": "email", "to": "alice@example.com", "subject": "Batch", "body": "Hello Alice!"},
                {"channel": "email", "to": "bob@example.com", "subject": "Batch", "body": "Hello Bob!"},
                {"channel": "sms", "to": "+1234567890", "body": "SMS alert"}
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

## Template Usage

Instead of providing a raw `body` for each message, you can reference a **template** by name.

### Template Syntax

Templates use `{{variableName}}` placeholders with optional defaults:

```text
Hello {{userName | default:"there"}}, your order #{{orderId}} is ready.
```

- `variables.userName = "Alice"` → `Hello Alice, your order #12345 is ready.`
- `userName` not provided → `Hello there, your order #12345 is ready.`
- No value and no default → placeholder left as-is.

### Example

**Template definition** (`welcome-email`):
- **subject:** `Welcome, {{userName}}!`
- **body:** `Hi {{userName}}, your account ({{userEmail}}) is ready.`

**Send request:**

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

:::note
If both `body` and `template` are provided, the template takes precedence. The template's subject (if defined) also overrides the `subject` field.
:::

:::tip
Template resolution happens at **enqueue time**, not delivery time. Updating a template after enqueuing does not affect already-enqueued messages.
:::

---

## Idempotency Keys

Pass a unique `idempotencyKey` to prevent duplicate sends:

```json
{
  "channel": "email",
  "to": "user@example.com",
  "subject": "Order Confirmation",
  "body": "Your order #12345 has been confirmed.",
  "idempotencyKey": "order-12345-confirmation"
}
```

**Behavior:**
- If a message with the same key already exists, the API returns the existing message's ID.
- Keys are unique system-wide, not per-token or per-channel.
- Checked **before** template resolution.

---

## Scheduled Sending

### Absolute datetime (`scheduledAt`)

```json
{
  "channel": "email",
  "to": "user@example.com",
  "subject": "Scheduled Report",
  "body": "Your weekly report is attached.",
  "scheduledAt": "2025-07-01T09:00:00Z"
}
```

Times are interpreted in UTC. If in the past, the message is immediately eligible.

### Relative delay (`delay`)

| Unit | Meaning | Example |
|------|---------|---------|
| `s` | Seconds | `30s` |
| `m` | Minutes | `5m` |
| `h` | Hours | `1h` |
| `d` | Days | `2d` |
| `w` | Weeks | `1w` |

```json
{
  "channel": "push",
  "to": "device-uuid",
  "body": "Meeting starts in 30 minutes.",
  "delay": "30m"
}
```

:::caution
When both `scheduledAt` and `delay` are provided, `scheduledAt` takes precedence.
:::

---

## Attachments

### Upload first (optional)

```bash
curl -X POST http://localhost:9527/api/user/upload \
  -H "Authorization: Bearer nh_your_token_here" \
  -F "file=@report.pdf"
```

Returns `{ "data": { "url": "/uploads/<uuid>.pdf", ... } }`.

### URL-based

```json
{
  "attachment": {
    "name": "build-output.zip",
    "url": "https://ci.example.com/builds/1234/artifacts.zip"
  }
}
```

### Base64-encoded

```json
{
  "attachment": {
    "name": "config.json",
    "data": "eyJoZWxsbyI6IndvcmxkIn0="
  }
}
```

---

## Message Format

The `format` field tells clients how to render the `body`:

| Value | Description |
|-------|-------------|
| `text` | Plain text (default). |
| `markdown` | Markdown — clients may render bold, links, lists. |
| `html` | HTML — clients may render inline HTML. |
| `json` | Structured JSON — clients may render as key-value pairs. |

---

## Tags and Priority

**Tags** — string labels for filtering:

```json
{ "tags": ["alert", "cpu", "production"] }
```

**Priority** — integer `0` (lowest, default) to `99` (highest):

| Range | Level | Use Case |
|-------|-------|----------|
| `0` | Normal | Default. |
| `1–33` | Low | Informational. |
| `34–66` | Medium | Warnings. |
| `67–99` | High | Critical alerts. |

---

## Error Codes

| HTTP | Error | Description |
|------|-------|-------------|
| `400` | `either body or template is required` | Neither `body` nor `template` provided. |
| `400` | `invalid channel type: <value>` | `channel` is not `email`, `sms`, or `push`. |
| `400` | `invalid datetime format: <value>` | `scheduledAt` format is invalid. |
| `400` | `invalid delay format: <value>` | `delay` format is invalid. |
| `400` | `invalid json: <detail>` | Request body is not valid JSON. |
| `401` | `missing Authorization header` | No `Authorization` header. |
| `401` | `invalid API token` | Token does not exist in database. |
| `401` | `token has expired` | JWT has expired. |
| `403` | `token is disabled` | Token disabled by admin. |
| `403` | `Token does not have '<channel>' scope` | Key lacks the channel scope. |
| `404` | `template '<name>' not found` | Template does not exist. |
| `429` | `Rate limit exceeded` | Per-token rate limit hit. Check `Retry-After` header. |
| `500` | `database error: <detail>` | Internal database error. |

---

## Rate Limiting

Rate limits are enforced **per API key** using a sliding window (1-minute window, default 100 req/min).

When exceeded: `429 Too Many Requests` with `Retry-After` header.

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 34
```

```json
{ "success": false, "error": "Rate limit exceeded" }
```

:::tip
Use the `Retry-After` header value to implement automatic backoff in your client code.
:::
