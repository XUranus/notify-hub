---
title: Topic API
sidebar_position: 3
description: "Create, list, update, delete, and fork notification topics."
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Topic API

Topics categorize and organize notification messages. Each message can be assigned to a topic, making it easy to filter and manage related notifications.

## Base URL

```text
http://<your-host>:9527/api/v1/topic
```

## Authentication

All Topic API endpoints support **DualAuth**: either a JWT token or an API key.

```text
Authorization: Bearer <jwt-token-or-api-key>
```

---

## List Topics

<span className="method-badge method-get">GET</span> `/api/v1/topic`

Retrieve topics accessible to the authenticated user (own topics + preset topics).

### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | `number` | `50` | `200` | Items per page. |
| `offset` | `number` | `0` | — | Offset for pagination. |
| `search` | `string` | — | — | Search by name or display name. |

### Response

**200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": 1,
      "name": "claudecode",
      "displayName": "Claude Code",
      "description": "Claude Code notifications",
      "icon": "data:image/png;base64,...",
      "preset": true,
      "createdAt": 1719849600,
      "updatedAt": 1719849600
    }
  ]
}
```

### Topic Object

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `string` | No | UUID of the topic. |
| `userId` | `number` | No | Owner's user ID (0 for presets). |
| `name` | `string` | No | Unique topic name (used in send API). |
| `displayName` | `string \| null` | Yes | Human-readable display name. |
| `description` | `string \| null` | Yes | Topic description. |
| `icon` | `string \| null` | Yes | Icon as data URI (`data:image/png;base64,...`). |
| `preset` | `boolean` | No | Whether this is a built-in preset topic. |
| `createdAt` | `number` | No | Unix timestamp. |
| `updatedAt` | `number` | No | Unix timestamp. |

### Examples

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl "http://localhost:9527/api/v1/topic?search=claude&limit=10" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch(
  "http://localhost:9527/api/v1/topic?search=claude&limit=10",
  { headers: { Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" } }
);
const result = await response.json();
for (const topic of result.data) {
  console.log(`${topic.name} (${topic.displayName}) — preset: ${topic.preset}`);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.get(
    "http://localhost:9527/api/v1/topic",
    headers={"Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
    params={"search": "claude", "limit": 10},
)
for topic in response.json()["data"]:
    print(f"{topic['name']} ({topic['displayName']}) — preset: {topic['preset']}")
```

</TabItem>
</Tabs>

---

## Get a Topic

<span className="method-badge method-get">GET</span> `/api/v1/topic/{id}`

Retrieve a single topic by ID. Only returns topics owned by the authenticated user.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | UUID of the topic. |

### Response

**200 OK** — Returns the [Topic Object](#topic-object).

**404 Not Found**

```json
{
  "success": false,
  "error": "topic not found"
}
```

---

## Create a Topic

<span className="method-badge method-post">POST</span> `/api/v1/topic`

Create a new topic, optionally forking from an existing one.

### Request Body

All field names are **camelCase**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | **Yes** | Unique topic name (per user). |
| `displayName` | `string` | No | Human-readable display name. |
| `description` | `string` | No | Topic description. |
| `icon` | `string` | No | Icon (data URI or URL). |
| `forkFrom` | `string` | No | UUID of source topic to fork from. Copies `displayName`, `description`, and `icon` from source unless overridden by request fields. |

### Forking

When `forkFrom` is set, the new topic inherits the source topic's `displayName`, `description`, and `icon`. Any fields provided in the request body take precedence over the source values.

```json
{
  "name": "my-claudecode",
  "displayName": "My Claude Code",
  "forkFrom": "preset-claudecode-uuid"
}
```

This creates a new topic with the preset's icon but a custom display name.

### Response

**200 OK**

```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "userId": 1,
    "name": "my-alerts",
    "displayName": "My Alerts",
    "description": "Custom alert topic",
    "icon": null,
    "preset": false,
    "createdAt": 1719849600,
    "updatedAt": 1719849600
  }
}
```

### Errors

| HTTP | Error | Description |
|------|-------|-------------|
| `400` | `invalid user id` | Auth token contains invalid user ID. |
| `409` | `topic name already exists` | A topic with this name already exists for this user. |
| `404` | `fork source topic not found` | The `forkFrom` topic does not exist. |

### Examples

<Tabs>
<TabItem value="curl" label="curl">

```bash
# Create a simple topic
curl -X POST http://localhost:9527/api/v1/topic \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deploy-alerts",
    "displayName": "Deploy Alerts",
    "description": "Production deployment notifications"
  }'

# Fork from a preset topic
curl -X POST http://localhost:9527/api/v1/topic \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-codex",
    "displayName": "My Codex",
    "forkFrom": "preset-codex-uuid"
  }'
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const response = await fetch("http://localhost:9527/api/v1/topic", {
  method: "POST",
  headers: {
    Authorization: "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "deploy-alerts",
    displayName: "Deploy Alerts",
    description: "Production deployment notifications",
  }),
});

const result = await response.json();
console.log("Created topic:", result.data.id);
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

response = requests.post(
    "http://localhost:9527/api/v1/topic",
    headers={"Authorization": "Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
    json={
        "name": "deploy-alerts",
        "displayName": "Deploy Alerts",
        "description": "Production deployment notifications",
    },
)
print(f"Created topic: {response.json()['data']['id']}")
```

</TabItem>
</Tabs>

---

## Update a Topic

<span className="method-badge method-put">PUT</span> `/api/v1/topic/{id}`

Update an existing topic. Only non-preset topics owned by the authenticated user can be updated.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | UUID of the topic. |

### Request Body

All fields are optional.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | New topic name (must be unique per user). |
| `displayName` | `string` | New display name. |
| `description` | `string` | New description. |
| `icon` | `string` | New icon. |

### Response

**200 OK** — Returns the updated [Topic Object](#topic-object).

### Errors

| HTTP | Error | Description |
|------|-------|-------------|
| `403` | `cannot modify preset topic` | Preset topics are read-only. |
| `404` | `topic not found` | Topic does not exist or belongs to another user. |
| `409` | `topic name already exists` | Another topic with this name exists. |

---

## Delete a Topic

<span className="method-badge method-delete">DELETE</span> `/api/v1/topic/{id}`

Delete a topic. This operation is **idempotent** — deleting an already-deleted topic returns success.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | UUID of the topic. |

### Behavior

- Preset topics cannot be deleted (returns `403`).
- Messages associated with the deleted topic have their `topic_id` set to `NULL`.
- If the topic doesn't exist (already deleted or never existed for this user), returns `200 OK`.

### Response

**200 OK**

```json
{
  "success": true
}
```

### Errors

| HTTP | Error | Description |
|------|-------|-------------|
| `403` | `cannot delete preset topic` | Preset topics cannot be deleted. |
| `404` | `topic not found` | Topic exists but belongs to another user. |

---

## Preset Topics

Built-in topics with icons, available to all users:

| Name | Display Name | Description |
|------|-------------|-------------|
| `claudecode` | Claude Code | Claude Code coding assistant notifications |
| `codex` | Codex | OpenAI Codex CLI notifications |
| `openclaw` | OpenClaw | OpenClaw AI assistant notifications |
| `opencode` | OpenCode | OpenCode terminal assistant notifications |

Preset topics:
- Are visible to all users (listed alongside user's own topics)
- Cannot be modified or deleted
- Can be forked to create user-owned copies with custom names

---

## Hook Scripts

Ready-to-use hook scripts that automatically create topics and send notifications when AI coding agents complete tasks. See [Skills README](https://github.com/user/notifyhub/tree/main/skills) for details.

| Agent | Hook File | Hook Type |
|-------|-----------|-----------|
| Claude Code | `skills/claude/claude-code-notifyhub.js` | Stop/Notification hooks |
| Codex CLI | `skills/codex/codex-notifyhub.js` | Shell command hooks |
| OpenCode | `skills/opencode/opencode-notifyhub.ts` | Plugin (event.subscribe) |
| OpenClaw | `skills/openclaw/openclaw-notifyhub.ts` | Hook (defineHook) |
