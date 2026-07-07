---
title: Messages API
sidebar_position: 2
description: Query and inspect notification messages through the NotifyHub Messages API.
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Messages API

The Messages API lets you query the status and details of notifications that have been sent through NotifyHub. Use it to track delivery, inspect failures, and build dashboards.

## Base URL

```text
http://<your-host>:9527/api/user/messages
```

## Authentication

All messages endpoints require a valid JWT token:

```text
Authorization: Bearer <jwt-token>
```

Admin users see all messages; regular users see only their own.

---

## Message Lifecycle

Every message progresses through a series of statuses from the moment it is enqueued to its final state.

```text
queued  -->  sending  -->  sent  -->  delivered
                  |
                  v
               failed  --(retry)-->  queued
                  |
                  v (max retries exceeded)
                dead
```

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

| Status      | Description                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `queued`    | The message has been enqueued and is waiting to be picked up by the worker. Scheduled messages stay in `queued` until their `scheduledAt` time. |
| `sending`   | The worker has claimed the message and is actively delivering it to the channel provider.                           |
| `sent`      | The message was successfully dispatched to the channel provider (e.g., the SMTP server accepted it).               |
| `delivered` | The channel provider confirmed delivery (e.g., the recipient's mail server accepted the message). Not all providers support delivery confirmation. |
| `failed`    | Delivery failed. The message will be automatically retried with exponential backoff if retries remain.             |
| `dead`      | The message has exhausted all retry attempts (default: 5). It will not be retried automatically. Use the [Admin API](./admin#retry-a-message) to manually retry. |

---

## List Messages

<span className="method-badge method-get">GET</span> `/api/user/messages`

Retrieve a paginated list of messages. Results are ordered by creation time (newest first).

### Query Parameters

| Parameter   | Type     | Default | Description                                             |
| ----------- | -------- | ------- | ------------------------------------------------------- |
| `page`      | `number` | `1`     | Page number (1-based).                                  |
| `pageSize`  | `number` | `20`    | Number of items per page. Maximum: `100`.               |
| `status`    | `string` | --      | Filter by message status. See [Status Descriptions](#status-descriptions). |
| `channel`   | `string` | --      | Filter by channel type: `email`, `sms`, or `push`.      |

### Response

**Success -- 200 OK**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "channelType": "email",
        "channelId": 1,
        "toAddress": "user@example.com",
        "subject": "Welcome to NotifyHub",
        "body": "Your account has been created successfully.",
        "templateId": null,
        "templateVars": null,
        "status": "sent",
        "retryCount": 0,
        "maxRetries": 5,
        "nextRetryAt": null,
        "errorMessage": null,
        "idempotencyKey": null,
        "scheduledAt": null,
        "sentAt": 1719849600000,
        "createdAt": 1719849595000,
        "tags": "[\"onboarding\"]",
        "priority": 0,
        "url": null,
        "attachment": null,
        "format": "text"
      }
    ],
    "total": 156,
    "page": 1,
    "pageSize": 20
  }
}
```

### Response Fields

| Field           | Type              | Description                                                                 |
| --------------- | ----------------- | --------------------------------------------------------------------------- |
| `items`         | `Message[]`       | Array of message objects for the current page.                              |
| `total`         | `number`          | Total number of messages matching the filter criteria.                      |
| `page`          | `number`          | Current page number.                                                        |
| `pageSize`      | `number`          | Number of items per page.                                                   |

#### Message Object

| Field            | Type              | Description                                                               |
| ---------------- | ----------------- | ------------------------------------------------------------------------- |
| `id`             | `string`          | Unique message identifier (UUID).                                         |
| `channelType`    | `string`          | Channel type: `email`, `sms`, or `push`.                                  |
| `channelId`      | `number \| null`  | ID of the specific channel instance used (or `null` if default was used). |
| `toAddress`      | `string`          | Recipient address.                                                        |
| `subject`        | `string \| null`  | Message subject.                                                          |
| `body`           | `string \| null`  | Message body.                                                             |
| `templateId`     | `number \| null`  | ID of the template used (or `null` if sent with a raw body).             |
| `templateVars`   | `object \| null`  | Template variables as a JSON object (or `null`).                          |
| `status`         | `string`          | Current message status. See [Status Descriptions](#status-descriptions). |
| `retryCount`     | `number`          | Number of delivery attempts made so far.                                  |
| `maxRetries`     | `number`          | Maximum number of retries allowed (default: 5).                           |
| `nextRetryAt`    | `number \| null`  | Unix timestamp (ms) of the next scheduled retry attempt (or `null`).     |
| `errorMessage`   | `string \| null`  | Error message from the last failed delivery attempt (or `null`).          |
| `idempotencyKey` | `string \| null`  | Idempotency key used when sending (or `null`).                            |
| `scheduledAt`    | `number \| null`  | Unix timestamp (ms) of the scheduled delivery time (or `null`).          |
| `sentAt`         | `number \| null`  | Unix timestamp (ms) when the message was sent (or `null`).               |
| `createdAt`      | `number`          | Unix timestamp (ms) when the message was enqueued.                        |
| `tags`           | `string \| null`  | JSON array of tag strings. Example: `"[\"deploy\",\"prod\"]"`.           |
| `priority`       | `number`          | Priority level (0--99). Higher values are delivered first.                |
| `url`            | `string \| null`  | Associated URL for client-side linking.                                   |
| `attachment`     | `string \| null`  | JSON object `{name, url?, data?}` (or `null`).                           |
| `format`         | `string`          | Body format: `text`, `markdown`, `html`, or `json`.                      |

### Examples

<Tabs>
<TabItem value="curl" label="curl">

```bash
# List the first page of messages
curl http://localhost:9527/api/user/messages \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Filter by status
curl "http://localhost:9527/api/user/messages?status=failed&page=1&pageSize=50" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Filter by channel type
curl "http://localhost:9527/api/user/messages?channel=sms" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const params = new URLSearchParams({
  page: "1",
  pageSize: "20",
  status: "failed",
  channel: "email",
});

const response = await fetch(
  `http://localhost:9527/api/user/messages?${params}`,
  {
    headers: {
      Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  }
);

const result = await response.json();
console.log(`Showing ${result.data.items.length} of ${result.data.total} messages`);
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.get(
    "http://localhost:9527/api/user/messages",
    headers={"Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
    params={"page": 1, "pageSize": 20, "status": "failed", "channel": "email"},
)

data = response.json()["data"]
print(f"Showing {len(data['items'])} of {data['total']} messages")
for msg in data["items"]:
    print(f"  #{msg['id']} {msg['toAddress']} -- {msg['status']}")
```

</TabItem>
</Tabs>

---

## Get a Single Message

<span className="method-badge method-get">GET</span> `/api/user/messages/:id`

Retrieve the full details of a specific message by its ID.

### Path Parameters

| Parameter | Type     | Description              |
| --------- | -------- | ------------------------ |
| `id`      | `number` | The message ID to fetch. |

### Response

**Success -- 200 OK**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "channelType": "push",
    "channelId": null,
    "toAddress": "device-uuid",
    "subject": "Deployment Complete",
    "body": "**Build #1234** deployed to production.",
    "templateId": null,
    "templateVars": null,
    "status": "sent",
    "retryCount": 0,
    "maxRetries": 5,
    "nextRetryAt": null,
    "errorMessage": null,
    "idempotencyKey": null,
    "scheduledAt": null,
    "sentAt": 1719849600000,
    "createdAt": 1719849595000,
    "tags": "[\"deploy\",\"production\"]",
    "priority": 80,
    "url": "https://dashboard.example.com/deployments/1234",
    "attachment": "{\"name\":\"deploy-log.txt\",\"url\":\"https://logs.example.com/build-1234.txt\"}",
    "format": "markdown"
  }
}
```

**Not Found -- 404**

```json
{
  "success": false,
  "error": "Message not found"
}
```

### Examples

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl http://localhost:9527/api/user/messages/42 \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const messageId = 42;
const response = await fetch(
  `http://localhost:9527/api/user/messages/${messageId}`,
  {
    headers: {
      Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  }
);

const result = await response.json();
if (result.success) {
  console.log(`Message to ${result.data.toAddress}: ${result.data.status}`);
} else {
  console.error(result.error);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

message_id = 42
response = requests.get(
    f"http://localhost:9527/api/user/messages/{message_id}",
    headers={"Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
)

result = response.json()
if result["success"]:
    msg = result["data"]
    print(f"Message to {msg['toAddress']}: {msg['status']}")
else:
    print(f"Error: {result['error']}")
```

</TabItem>
</Tabs>

---

## Retry Behavior

When a message fails to deliver, NotifyHub automatically retries with **exponential backoff**. The retry schedule is:

| Retry Attempt | Delay Before Retry |
| ------------- | ------------------ |
| 1             | 1 second           |
| 2             | 5 seconds          |
| 3             | 30 seconds         |
| 4             | 5 minutes          |
| 5             | 30 minutes         |

**How it works:**

1. A message fails delivery and moves to `failed` status.
2. The `retryCount` is incremented and `nextRetryAt` is set based on the delay table above.
3. The worker polls for failed messages whose `nextRetryAt` has passed, and re-queues them.
4. After the maximum number of retries (default: **5**), the message moves to `dead` status.
5. Dead messages are **not** retried automatically. Use the [Admin API -- Retry a Message](./admin#retry-a-message) endpoint to manually retry them.

:::info
The `failed` status is a transient state. A message in `failed` status will be automatically picked up for retry by the worker when its `nextRetryAt` time arrives. Only `dead` messages require manual intervention.
:::
