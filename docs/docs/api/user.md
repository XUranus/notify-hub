---
title: User API
sidebar_position: 2
description: "User-specific operations: messages, tokens, stats, attachments, topics, push clients."
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# User API

The User API provides endpoints for authenticated users to manage their own resources: messages, API tokens, statistics, attachments, topics, and push clients.

## Base URL

```text
http://<your-host>:9527/api/user
```

## Authentication

All User API endpoints require a **JWT** token in the `Authorization` header:

```text
Authorization: Bearer <jwt-token>
```

JWTs are obtained through the [Auth API](#auth) endpoints.

- **Expiry:** 24 hours (web panel) or 90 days (client tokens)
- **Roles:** `admin` (sees all resources) or `user` (sees own resources only)

:::note
Admin users can access all resources through these endpoints. Regular users can only access their own resources.
:::

---

## Auth

### Login (Client)

<span className="method-badge method-post">POST</span> `/api/auth/login`

Authenticate with email/username and password. Returns a JWT token suitable for client applications (Android, Desktop, CLI).

**Request Body:**

| Field             | Type     | Required | Description                    |
| ----------------- | -------- | -------- | ------------------------------ |
| `emailOrUsername` | `string` | Yes      | Email or username.             |
| `password`        | `string` | Yes      | Account password.              |

**Response -- 200 OK:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "username": "user",
      "role": "user"
    }
  }
}
```

### Register

<span className="method-badge method-post">POST</span> `/api/auth/register`

Create a new user account.

**Request Body:**

| Field      | Type     | Required | Description                        |
| ---------- | -------- | -------- | ---------------------------------- |
| `email`    | `string` | Yes      | Email address (must be unique).    |
| `password` | `string` | Yes      | Password (minimum 6 characters).   |

### Change Password

<span className="method-badge method-post">POST</span> `/api/auth/change-password`

Change the password of the currently authenticated user. Requires JWT authentication.

**Request Body:**

| Field             | Type     | Required | Description                  |
| ----------------- | -------- | -------- | ---------------------------- |
| `currentPassword` | `string` | Yes      | Current password.            |
| `newPassword`     | `string` | Yes      | New password (minimum 6 characters). |

---

## Messages

### List Messages

<span className="method-badge method-get">GET</span> `/api/user/messages`

Retrieve a paginated list of your messages.

**Query Parameters:**

| Parameter  | Type     | Default | Description                                       |
| ---------- | -------- | ------- | ------------------------------------------------- |
| `page`     | `number` | `1`     | Page number (1-based).                            |
| `pageSize` | `number` | `50`    | Items per page (max 500).                         |
| `status`   | `string` | --      | Filter by status: `queued`, `sent`, `failed`, `dead`. |
| `topic`    | `string` | --      | Filter by topic ID.                               |

**Response -- 200 OK:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "msg-uuid-1",
        "channelType": "push",
        "toAddress": "device-uuid",
        "subject": "Hello",
        "body": "World",
        "status": "sent",
        "createdAt": 1719849600
      }
    ],
    "total": 150,
    "page": 1,
    "pageSize": 50
  }
}
```

### Get Message

<span className="method-badge method-get">GET</span> `/api/user/messages/{id}`

Retrieve a single message by ID.

---

## Token Management

API tokens are used by applications to authenticate with the [Send API](./send). Each token has scopes, rate limits, and optional IP whitelisting.

### List Tokens

<span className="method-badge method-get">GET</span> `/api/user/tokens`

Retrieve your API tokens. Admin users see all tokens; regular users see only their own.

**Response -- 200 OK:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Production App",
      "token": "nh_aBcDe***",
      "scopes": ["email", "sms"],
      "rateLimit": 100,
      "enabled": true,
      "lastUsedAt": 1719849600000,
      "createdAt": 1719800000000
    }
  ]
}
```

### Create Key

<span className="method-badge method-post">POST</span> `/api/user/tokens`

Create a new API key. The full key value is returned **only on creation**.

**Request Body:**

| Field         | Type       | Required | Description                                                   |
| ------------- | ---------- | -------- | ------------------------------------------------------------- |
| `name`        | `string`   | Yes      | Human-readable name (1-100 characters).                       |
| `scopes`      | `string[]` | No       | Array of channel types. Default: `["email", "sms", "push"]`. |
| `rateLimit`   | `number`   | No       | Max requests per minute. Default: `100`. Range: 1-10,000.    |
| `ipWhitelist` | `string[]` | No       | Array of allowed IP addresses. Empty means no restriction.    |

### Generate Client Token

<span className="method-badge method-post">POST</span> `/api/user/tokens/generate-client-token`

Generate a JWT token for client applications (Android, Desktop). The token has a 90-day expiry.

### Get Token

<span className="method-badge method-get">GET</span> `/api/user/tokens/{id}`

Retrieve a single token with its **full value**.

### Update Token

<span className="method-badge method-put">PUT</span> `/api/user/tokens/{id}`

Update token settings. All fields are optional.

### Delete Token

<span className="method-badge method-delete">DELETE</span> `/api/user/tokens/{id}`

Permanently delete an API token.

### Rotate Token

<span className="method-badge method-post">POST</span> `/api/user/tokens/{id}/rotate`

Generate a new token value for an existing token. The old value is immediately invalidated.

---

## Topics

### List Topics

<span className="method-badge method-get">GET</span> `/api/user/topics`

Retrieve your topics with pagination and search.

**Query Parameters:**

| Parameter | Type     | Default | Description                          |
| --------- | -------- | ------- | ------------------------------------ |
| `limit`   | `number` | `50`    | Items per page (max 200).           |
| `offset`  | `number` | `0`     | Offset for pagination.              |
| `search`  | `string` | --      | Search by name or display name.     |

### Create Topic

<span className="method-badge method-post">POST</span> `/api/user/topics`

Create a new topic.

**Request Body:**

| Field         | Type     | Required | Description                    |
| ------------- | -------- | -------- | ------------------------------ |
| `name`        | `string` | Yes      | Unique topic name.             |
| `displayName` | `string` | No       | Human-readable display name.   |
| `icon`        | `string` | No       | Icon URL or emoji.             |

### Get Topic

<span className="method-badge method-get">GET</span> `/api/user/topics/{id}`

### Update Topic

<span className="method-badge method-put">PUT</span> `/api/user/topics/{id}`

### Delete Topic

<span className="method-badge method-delete">DELETE</span> `/api/user/topics/{id}`

---

## Push Clients

### Register Push Client

<span className="method-badge method-post">POST</span> `/api/user/push/register`

Register or update a push client device.

**Request Body:**

| Field       | Type     | Required | Description                    |
| ----------- | -------- | -------- | ------------------------------ |
| `uuid`      | `string` | Yes      | Device UUID.                   |
| `name`      | `string` | No       | Device name.                   |
| `os`        | `string` | No       | Operating system.              |
| `arch`      | `string` | No       | CPU architecture.              |
| `desktop`   | `string` | No       | Desktop environment.           |
| `appVersion`| `string` | No       | App version.                   |
| `fcmToken`  | `string` | No       | Firebase Cloud Messaging token.|

### Update Push Client

<span className="method-badge method-patch">PATCH</span> `/api/user/push/client`

Update push client name or FCM token.

### Ack Messages

<span className="method-badge method-post">POST</span> `/api/user/push/ack`

Acknowledge delivered push messages so they won't be re-delivered.

### Poll Messages

<span className="method-badge method-get">GET</span> `/api/user/push/poll`

Long-poll for undelivered push messages.

### Stream Messages (SSE)

<span className="method-badge method-get">GET</span> `/api/user/push/stream`

Server-Sent Events stream for real-time push delivery. Requires `?uuid=<device-uuid>` and either `Authorization` header or `?token=<jwt>`.

### WebSocket

<span className="method-badge method-get">GET</span> `/api/user/push/ws`

WebSocket connection for real-time push delivery. Requires `?uuid=<device-uuid>` and `?token=<jwt>`.

### List Push Clients

<span className="method-badge method-get">GET</span> `/api/user/push/clients`

List your registered push clients.

### Delete Push Client

<span className="method-badge method-delete">DELETE</span> `/api/user/push/clients/{uuid}`

Delete one of your push clients by UUID.

---

## Clients

### List Clients

<span className="method-badge method-get">GET</span> `/api/user/clients`

List your registered push clients (same as List Push Clients).

---

## Statistics

### Overview Statistics

<span className="method-badge method-get">GET</span> `/api/user/stats/overview`

Get aggregate message statistics. Admin users see instance-wide stats; regular users see their own.

**Response -- 200 OK:**

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

### Daily Statistics

<span className="method-badge method-get">GET</span> `/api/user/stats/daily`

Get per-day message counts for the last 7 days.

### Channel Statistics

<span className="method-badge method-get">GET</span> `/api/user/stats/channels`

Get message counts grouped by channel type.

### Recent Messages

<span className="method-badge method-get">GET</span> `/api/user/stats/recent`

Get the 10 most recent messages.

---

## Attachments

### List Attachments

<span className="method-badge method-get">GET</span> `/api/user/attachments`

List your uploaded attachments with pagination.

### Get Attachment Stats

<span className="method-badge method-get">GET</span> `/api/user/attachments/stats`

Get storage usage statistics.

### Batch Delete Attachments

<span className="method-badge method-post">POST</span> `/api/user/attachments/batch-delete`

Delete multiple attachments by ID.

### Delete Attachment

<span className="method-badge method-delete">DELETE</span> `/api/user/attachments/{id}`

Delete a single attachment.

### Download Attachment

<span className="method-badge method-get">GET</span> `/api/user/attachments/{id}/download`

Download an attachment file.

---

## User Settings

### Get Settings

<span className="method-badge method-get">GET</span> `/api/user/settings`

Get the current user's settings.

### Update Settings

<span className="method-badge method-put">PUT</span> `/api/user/settings`

Update the current user's settings.
