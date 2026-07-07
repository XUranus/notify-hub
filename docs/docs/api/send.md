---
title: Send API
sidebar_position: 1
description: Send single or batch notifications through the NotifyHub Send API.
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Send API

The Send API lets you dispatch notifications to one or more recipients through any configured channel -- email, SMS, or push. All send endpoints require an **API token** with the appropriate channel scope.

## Base URL

```text
http://<your-host>:9527/api/v1/send
```

## Authentication

Every request must include a valid API token in the `Authorization` header:

```text
Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Tokens are created through the [Admin API](./admin#token-management) and carry one or more **scopes** that determine which channel types the token is allowed to send through. The available scopes are:

| Scope   | Description                      |
| ------- | -------------------------------- |
| `email` | Send messages via email channels |
| `sms`   | Send messages via SMS channels   |
| `push`  | Send messages via push channels  |
| `*`     | Wildcard -- all channel types    |

If the token's scopes do not include the channel type specified in the request body, the API returns a `403 Forbidden` response.

Tokens can also be configured with:

- **Rate limits** -- maximum requests per minute (default: 100)
- **IP whitelists** -- only allow requests from specific IP addresses

---

## Send a Single Message

<span className="method-badge method-post">POST</span> `/api/v1/send`

Enqueue a single notification for delivery.

### Request Body

| Field             | Type              | Required               | Description                                                                                                              |
| ----------------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `channel`         | `string`          | Yes                    | Channel type: `email`, `sms`, or `push`.                                                                                 |
| `to`              | `string`          | Yes                    | Recipient address. An email address, phone number, or device token depending on the channel.                             |
| `subject`         | `string`          | No                     | Message subject (mainly for email). Required if not using a template with a subject.                                     |
| `body`            | `string`          | Conditional            | Message body text. Required if `template` is not provided.                                                               |
| `template`        | `string`          | No                     | Name of a pre-configured template. When provided, `body` is optional (the template body is used).                        |
| `variables`       | `Record<string, string>` | No            | Key-value pairs to substitute into the template. See [Template Usage](#template-usage).                                  |
| `idempotencyKey`  | `string`          | No                     | A unique key to prevent duplicate sends. See [Idempotency](#idempotency-keys).                                           |
| `scheduledAt`     | `string`          | No                     | ISO 8601 datetime string. The message will not be delivered before this time. Example: `2025-07-01T09:00:00Z`.           |
| `channelId`       | `number`          | No                     | Specific channel instance ID to use. If omitted, the default channel for the given type is selected automatically.       |
| `tags`            | `string[]`        | No                     | Categorization labels for the message. Defaults to `[]`. Example: `["deploy", "production"]`.                           |
| `priority`        | `number`          | No                     | Priority level from `0` (lowest, default) to `99` (highest). Higher priority messages are delivered first.               |
| `url`             | `string`          | No                     | A URL associated with the message. Clients can use this for clickable links or deep-linking.                             |
| `delay`           | `string`          | No                     | Relative delay before delivery. Overrides `scheduledAt`. See [Delay Syntax](#delay-syntax).                              |
| `attachment`      | `object`          | No                     | File attachment. See [Attachments](#attachments).                                                                        |
| `format`          | `string`          | No                     | Body text format: `text` (default), `markdown`, `html`, or `json`. Clients use this to render rich content.              |

### Response

**Success -- 201 Created**

```json
{
  "success": true,
  "data": {
    "messageId": 42,
    "status": "queued"
  }
}
```

### Examples

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl -X POST http://localhost:9527/api/v1/send \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "push",
    "to": "device-uuid",
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
    to: "device-uuid",
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
        "to": "device-uuid",
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
</Tabs>

---

## Send a Batch of Messages

<span className="method-badge method-post">POST</span> `/api/v1/send/batch`

Enqueue up to **100 messages** in a single request. Each message in the batch is processed independently -- if one message fails scope or template validation, the remaining messages in the batch are still processed.

### Request Body

| Field      | Type        | Required | Description                                          |
| ---------- | ----------- | -------- | ---------------------------------------------------- |
| `messages` | `Message[]` | Yes      | Array of message objects (1--100). Each message uses the same schema as the [single send](#request-body) endpoint. |

### Response

**Success -- 200 OK**

The `data` array contains one entry per message in the batch. Each entry is either a success object or an error object.

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

## Template Usage

Instead of providing a raw `body` (and optionally `subject`) for each message, you can reference a **template** by name. Templates are created and managed through the [Admin API](./admin#template-management).

### How It Works

1. Create a template via the Admin API with a name, channel type, and body containing `{{variable}}` placeholders.
2. When sending a message, set the `template` field to the template name and pass `variables` with the values to substitute.

### Template Syntax

Templates use `{{variableName}}` placeholders. You can also provide default values using the pipe syntax:

```text
Hello {{userName | default:"there"}}, your order #{{orderId}} is ready.
```

- If `variables.userName` is `"Alice"`, the result is `Hello Alice, your order #12345 is ready.`
- If `userName` is not provided, the result is `Hello there, your order #12345 is ready.`
- If a variable has no value and no default, the placeholder is left as-is (`{{variableName}}`).

### Example

Suppose you have a template named `welcome-email` for the `email` channel:

**Template definition:**
- **name:** `welcome-email`
- **channelType:** `email`
- **subject:** `Welcome, {{userName}}!`
- **body:** `Hi {{userName}},\n\nYour account ({{userEmail}}) is ready. Start exploring at {{appUrl | default:"https://app.example.com"}}.`

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

**Resulting message:**
- **subject:** `Welcome, Alice!`
- **body:** `Hi Alice,\n\nYour account (newuser@example.com) is ready. Start exploring at https://app.example.com.`

:::note
If both `body` and `template` are provided, the `template` takes precedence for the body content. The template's subject (if defined) also overrides the `subject` field.
:::

:::tip
Template resolution happens at **enqueue time**, not at delivery time. If you update a template after enqueuing a message, the already-enqueued message will use the original template content.
:::

---

## Idempotency Keys

An idempotency key ensures that the same notification is not sent multiple times, even if the request is retried (for example, due to a network timeout).

Pass a unique string in the `idempotencyKey` field:

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

- If a message with the same `idempotencyKey` already exists in the system (regardless of status), the API returns the existing message's ID instead of creating a new one.
- The response looks identical to a normal send -- you cannot distinguish whether the message was newly created or already existed.
- Idempotency keys are unique across the entire system, not per-token or per-channel.

:::caution
Idempotency keys are checked **before** template resolution. If you need to send the same template to the same recipient with different variables, use a different idempotency key for each.
:::

---

## Scheduled Sending

To delay message delivery, include the `scheduledAt` field with an ISO 8601 datetime:

```json
{
  "channel": "email",
  "to": "user@example.com",
  "subject": "Scheduled Report",
  "body": "Your weekly report is attached.",
  "scheduledAt": "2025-07-01T09:00:00Z"
}
```

**Behavior:**

- The message is enqueued immediately with status `queued`, but the worker will not pick it up until the scheduled time has passed.
- If `scheduledAt` is in the past, the message is treated as immediately eligible for delivery.
- Times are interpreted in UTC.

Alternatively, use the `delay` field for relative delays. See [Delay Syntax](#delay-syntax).

---

## Delay Syntax

The `delay` field provides a convenient way to schedule messages using relative durations or absolute datetime strings. When both `delay` and `scheduledAt` are provided, `delay` takes precedence.

### Relative Durations

Format: `<number><unit>` where unit is one of:

| Unit | Meaning |
| ---- | ------- |
| `s`  | Seconds |
| `m`  | Minutes |
| `h`  | Hours   |
| `d`  | Days    |
| `w`  | Weeks   |

Examples: `30s`, `5m`, `1h`, `2d`, `1w`

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "Reminder",
  "body": "Meeting starts in 30 minutes.",
  "delay": "30m"
}
```

### Absolute Datetime

Format: `yyyy-mm-dd hh:mm:ss` (interpreted in server local timezone).

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "Maintenance Window",
  "body": "Scheduled maintenance begins now.",
  "delay": "2025-12-31 23:59:59"
}
```

:::caution
If the `delay` format is invalid, the API returns a `400 Bad Request` with a validation error.
:::

---

## Attachments

You can attach files to a message using the `attachment` field. The attachment object supports two modes: **URL-based** (the client downloads the file from a URL) and **base64-encoded** (the file data is embedded directly).

### Uploading Files

Before attaching a file via URL, upload it using the Upload API:

```bash
curl -X POST http://localhost:9527/api/user/upload \
  -H "Authorization: Bearer nh_your_token_here" \
  -F "file=@report.pdf"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "url": "/uploads/550e8400-e29b-41d4-a716-446655440000.pdf",
    "filename": "report.pdf",
    "size": 1048576
  }
}
```

Use the returned `url` (relative) or prepend your server URL to form the full URL for the `attachment.url` field. The uploaded file is accessible without authentication at the returned URL path.

**Upload quota:**

Check your upload quota before uploading:

```bash
curl http://localhost:9527/api/user/upload/quota \
  -H "Authorization: Bearer nh_your_token_here"
```

Admin users have no quota limits. Regular users have configurable limits for single file size and total storage.

### Attachment Schema

| Field  | Type     | Required          | Description                          |
| ------ | -------- | ----------------- | ------------------------------------ |
| `name` | `string` | Yes               | File name (e.g., `report.pdf`).     |
| `url`  | `string` | One of url/data   | URL to download the file.            |
| `data` | `string` | One of url/data   | Base64-encoded file content.         |

### URL-based Attachment

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "Build Artifacts",
  "body": "The latest build artifacts are attached.",
  "attachment": {
    "name": "build-output.zip",
    "url": "https://ci.example.com/builds/1234/artifacts.zip"
  }
}
```

### Base64 Attachment

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "Config Export",
  "body": "Your configuration export is attached.",
  "attachment": {
    "name": "config.json",
    "data": "eyJoZWxsbyI6IndvcmxkIn0="
  }
}
```

:::note
Either `url` or `data` must be provided. If both are missing, the API returns a `400 Bad Request`.
:::

---

## Message Format

The `format` field tells clients how to render the `body` content. This is purely informational -- the server stores and delivers the body as-is.

| Value      | Description                                                      |
| ---------- | ---------------------------------------------------------------- |
| `text`     | Plain text (default). No rendering.                              |
| `markdown` | Markdown content. Clients may render bold, links, lists, etc.   |
| `html`     | HTML content. Clients may render inline HTML.                    |
| `json`     | Structured JSON data. Clients may render as key-value pairs.     |

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "Alert Summary",
  "body": "<h2>Status</h2><p>All systems <b>operational</b>.</p>",
  "format": "html"
}
```

---

## Tags and Priority

### Tags

Tags are string labels for categorizing and filtering messages. They are stored as a JSON array on the message record.

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "Alert",
  "body": "CPU usage exceeded 95%.",
  "tags": ["alert", "cpu", "production"]
}
```

### Priority

Priority is an integer from `0` (lowest, default) to `99` (highest). The message queue processes higher-priority messages first.

```json
{
  "channel": "push",
  "to": "device-uuid",
  "subject": "Critical Alert",
  "body": "Database connection pool exhausted.",
  "priority": 90,
  "tags": ["critical", "database"]
}
```

Priority ranges (suggested):

| Range  | Level    | Use Case                              |
| ------ | -------- | ------------------------------------- |
| `0`    | Normal   | Default for most messages.            |
| `1-33` | Low      | Informational, non-urgent.            |
| `34-66`| Medium   | Warnings, attention needed.           |
| `67-99`| High     | Critical alerts, immediate action.    |

---

## Error Codes

| HTTP Status | Error                              | Description                                                             |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `400`       | Validation error                   | The request body failed schema validation. Check the `error` field.     |
| `400`       | `Either body or template is required` | Neither `body` nor `template` was provided.                           |
| `400`       | `Invalid delay format`             | The `delay` field does not match relative (`30m`, `1h`) or absolute (`yyyy-mm-dd hh:mm:ss`) format. |
| `401`       | `Missing or invalid authorization header` | The `Authorization` header is missing or malformed.              |
| `401`       | `Invalid API token`                | The token does not exist in the database.                               |
| `403`       | `API token is disabled`            | The token has been disabled by an admin.                                |
| `403`       | `IP address not allowed`           | The requesting IP is not in the token's IP whitelist.                   |
| `403`       | `Token does not have '<channel>' scope` | The token's scopes do not include the requested channel type.    |
| `404`       | `Template '<name>' not found for channel '<type>'` | The specified template does not exist for the given channel. |
| `429`       | `Rate limit exceeded`              | The token has exceeded its per-minute request limit.                    |
| `500`       | `Failed to enqueue`                | An internal error occurred while queuing the message.                   |

---

## Rate Limiting

Rate limits are enforced **per API token** using a sliding window algorithm with a 1-minute window.

- Each token has a configurable rate limit (default: 100 requests per minute).
- When the limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait.
- The rate limit counter is shared across the single send and batch send endpoints.

**Example 429 response:**

```json
{
  "success": false,
  "error": "Rate limit exceeded"
}
```

**Headers:**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 34
```

:::tip
Use the `Retry-After` header value to implement automatic backoff in your client code.
:::
