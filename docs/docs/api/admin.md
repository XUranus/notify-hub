---
title: Admin API
sidebar_position: 3
description: Manage channels, tokens, templates, messages, users, and statistics through the NotifyHub Admin API.
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Admin API

The Admin API provides management capabilities for admin-exclusive operations: channels, templates, users, system settings, and logs. All admin endpoints require the `admin` role.

## Base URL

```text
http://<your-host>:9527/api/admin
```

## Authentication

All Admin API endpoints (except login) require a **JWT** token in the `Authorization` header:

```text
Authorization: Bearer <jwt-token>
```

JWTs are obtained through the [Login](#login) endpoint and contain the following payload:

```json
{
  "userId": 1,
  "email": "admin@example.com",
  "role": "admin"
}
```

- **Expiry:** 24 hours
- **Roles:** `admin` (full access) or `user` (limited access)

:::note
For user-specific operations (messages, tokens, stats, attachments, topics, push clients), use the [User API](./user) at `/api/user/`.
:::

---

## Authentication Endpoints

### Login

<span className="method-badge method-post">POST</span> `/api/admin/login`

Authenticate with email and password. Returns a JWT token.

**Request Body:**

| Field      | Type     | Required | Description         |
| ---------- | -------- | -------- | ------------------- |
| `email`    | `string` | Yes      | Account email.      |
| `password` | `string` | Yes      | Account password.   |

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

**Response -- 200 OK:**

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

**Errors:**

| HTTP Status | Error                | Description                        |
| ----------- | -------------------- | ---------------------------------- |
| `400`       | Validation error     | Missing or invalid email/password. |
| `401`       | `Invalid credentials` | Email or password is incorrect.   |

---

### Register

<span className="method-badge method-post">POST</span> `/api/auth/register`

Create a new user account. Newly registered users are assigned the `user` role by default.

**Request Body:**

| Field      | Type     | Required | Description                        |
| ---------- | -------- | -------- | ---------------------------------- |
| `email`    | `string` | Yes      | Email address (must be unique).    |
| `password` | `string` | Yes      | Password (minimum 6 characters).   |

**Response -- 200 OK:**

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

**Errors:**

| HTTP Status | Error                      | Description                       |
| ----------- | -------------------------- | --------------------------------- |
| `400`       | Validation error           | Missing fields or invalid format. |
| `409`       | `Email already registered` | An account with this email exists. |

---

### Change Password

<span className="method-badge method-post">POST</span> `/api/auth/change-password`

Change the password of the currently authenticated user. Requires JWT authentication.

**Request Body:**

| Field             | Type     | Required | Description                  |
| ----------------- | -------- | -------- | ---------------------------- |
| `currentPassword` | `string` | Yes      | Current password.            |
| `newPassword`     | `string` | Yes      | New password (minimum 6 characters). |

**Response -- 200 OK:**

```json
{ "success": true }
```

**Errors:**

| HTTP Status | Error                              | Description                             |
| ----------- | ---------------------------------- | --------------------------------------- |
| `400`       | Validation error                   | Missing fields.                         |
| `400`       | `New password must be at least 6 characters` | Password too short.            |
| `401`       | `Current password is incorrect`    | The current password does not match.    |

---

## Channel Management

Channels are the delivery providers configured in your NotifyHub instance (e.g., an SMTP server for email, Twilio for SMS). Channel configuration is stored encrypted at rest.

### List Channels

<span className="method-badge method-get">GET</span> `/api/admin/channels`

Retrieve all configured channels. Sensitive fields (passwords, secrets, keys) are masked with `***`.

**Query Parameters:**

| Parameter | Type     | Description                                    |
| --------- | -------- | ---------------------------------------------- |
| `type`    | `string` | Filter by channel type: `email`, `sms`, `push`. |

**Response -- 200 OK:**

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

### Get Channel

<span className="method-badge method-get">GET</span> `/api/admin/channels/:id`

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Channel ID.      |

---

### Create Channel

<span className="method-badge method-post">POST</span> `/api/admin/channels`

Create a new channel. The `config` object is validated against the channel type's schema and stored encrypted.

**Request Body:**

| Field       | Type      | Required | Description                                                                 |
| ----------- | --------- | -------- | --------------------------------------------------------------------------- |
| `type`      | `string`  | Yes      | Channel type: `email`, `sms`, or `push`.                                    |
| `name`      | `string`  | Yes      | Human-readable name (1--100 characters).                                    |
| `config`    | `object`  | Yes      | Channel-specific configuration. See [Channel Configs](#channel-configurations). |
| `enabled`   | `boolean` | No       | Whether the channel is active. Default: `true`.                             |
| `isDefault` | `boolean` | No       | Whether this is the default channel for its type. Default: `false`.         |

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

**Response -- 201 Created:**

```json
{
  "success": true,
  "data": { "id": 3 }
}
```

---

### Update Channel

<span className="method-badge method-put">PUT</span> `/api/admin/channels/:id`

Update an existing channel. All fields are optional -- only provided fields are updated.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Channel ID.      |

**Request Body:** Same fields as [Create Channel](#create-channel), all optional.

**Response -- 200 OK:**

```json
{ "success": true }
```

---

### Delete Channel

<span className="method-badge method-delete">DELETE</span> `/api/admin/channels/:id`

Permanently delete a channel.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Channel ID.      |

**Response -- 200 OK:**

```json
{ "success": true }
```

---

### Test Channel

<span className="method-badge method-post">POST</span> `/api/admin/channels/:id/test`

Test connectivity to a channel's delivery provider. This performs a lightweight check (e.g., SMTP connection test, API credential validation) without sending an actual message.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Channel ID.      |

**Response -- 200 OK:**

```json
{
  "success": true,
  "data": { "connected": true }
}
```

If the connection fails:

```json
{
  "success": false,
  "error": "Connection refused"
}
```

### Channel Configurations

Each channel type requires a specific `config` object shape:

**Email:**

| Field         | Type      | Required | Description                           |
| ------------- | --------- | -------- | ------------------------------------- |
| `host`        | `string`  | Yes      | SMTP server hostname.                 |
| `port`        | `number`  | Yes      | SMTP port (1--65535).                 |
| `secure`      | `boolean` | No       | Use TLS. Default: `true`.            |
| `username`    | `string`  | Yes      | SMTP username.                        |
| `password`    | `string`  | Yes      | SMTP password.                        |
| `fromAddress` | `string`  | Yes      | Sender email address.                 |
| `fromName`    | `string`  | No       | Sender display name.                  |

**SMS (Twilio):**

| Field         | Type     | Required | Description                     |
| ------------- | -------- | -------- | ------------------------------- |
| `provider`    | `"twilio"` | Yes    | Must be `"twilio"`.             |
| `accountSid`  | `string` | Yes      | Twilio Account SID.             |
| `authToken`   | `string` | Yes      | Twilio Auth Token.              |
| `fromNumber`  | `string` | Yes      | Twilio phone number.            |

**SMS (Aliyun):**

| Field            | Type      | Required | Description                                    |
| ---------------- | --------- | -------- | ---------------------------------------------- |
| `provider`       | `"aliyun"` | Yes     | Must be `"aliyun"`.                             |
| `accessKeyId`    | `string`  | Yes      | Aliyun AccessKey ID.                            |
| `accessKeySecret` | `string` | Yes      | Aliyun AccessKey Secret.                        |
| `signName`       | `string`  | Yes      | SMS signature name.                             |
| `endpoint`       | `string`  | No       | API endpoint. Default: `dysmsapi.aliyuncs.com`. |

**SMS (Tencent):**

| Field        | Type       | Required | Description                                       |
| ------------ | ---------- | -------- | ------------------------------------------------- |
| `provider`   | `"tencent"` | Yes     | Must be `"tencent"`.                               |
| `secretId`   | `string`   | Yes      | Tencent Cloud Secret ID.                           |
| `secretKey`  | `string`   | Yes      | Tencent Cloud Secret Key.                          |
| `signName`   | `string`   | Yes      | SMS signature name.                                |
| `sdkAppId`   | `string`   | Yes      | Tencent SMS SDK App ID.                            |
| `endpoint`   | `string`   | No       | API endpoint. Default: `sms.tencentcloudapi.com`.  |

---

## Token Management

API tokens are used by applications to authenticate with the [Send API](./send) and [Messages API](./messages). Each token has scopes, rate limits, and optional IP whitelisting.

:::note
Token management endpoints have moved to the [User API](./user#token-management) at `/api/user/tokens`.
:::

### List Tokens

<span className="method-badge method-get">GET</span> `/api/user/tokens`

Retrieve all API tokens. Admin users see all tokens; regular users see only their own. Token values are masked in the list view.

**Response -- 200 OK:**

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

### Get Token

<span className="method-badge method-get">GET</span> `/api/admin/tokens/:id`

Retrieve a single token with its **full value**. Regular users can only view their own tokens.

**Path Parameters:**

| Parameter | Type     | Description    |
| --------- | -------- | -------------- |
| `id`      | `number` | Token ID.      |

---

### Create Key

<span className="method-badge method-post">POST</span> `/api/user/tokens`

Create a new API key. The full key value is returned **only on creation** -- it cannot be retrieved later.

**Request Body:**

| Field          | Type       | Required | Description                                                       |
| -------------- | ---------- | -------- | ----------------------------------------------------------------- |
| `name`         | `string`   | Yes      | Human-readable name (1--100 characters).                          |
| `scopes`       | `string[]` | No       | Array of channel types. Default: `["email", "sms", "push"]`.     |
| `rateLimit`    | `number`   | No       | Max requests per minute. Default: `100`. Range: 1--10,000.        |
| `ipWhitelist`  | `string[]` | No       | Array of allowed IP addresses. `null` or empty means no restriction. |

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

**Response -- 201 Created:**

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
Store the token value immediately after creation. For security reasons, the full token value is only shown once and **cannot** be retrieved later. The list endpoint only shows a masked prefix.
:::

---

### Update Token

<span className="method-badge method-put">PUT</span> `/api/admin/tokens/:id`

Update token settings. All fields are optional. Regular users can only update their own tokens.

**Path Parameters:**

| Parameter | Type     | Description    |
| --------- | -------- | -------------- |
| `id`      | `number` | Token ID.      |

**Request Body:**

| Field         | Type        | Required | Description                                      |
| ------------- | ----------- | -------- | ------------------------------------------------ |
| `name`        | `string`    | No       | New name.                                        |
| `scopes`      | `string[]`  | No       | New scopes array.                                |
| `rateLimit`   | `number`    | No       | New rate limit (1--10,000).                      |
| `ipWhitelist` | `string[] \| null` | No | New IP whitelist. `null` removes the restriction. |
| `enabled`     | `boolean`   | No       | Enable or disable the token.                     |

**Response -- 200 OK:**

```json
{ "success": true }
```

---

### Delete Token

<span className="method-badge method-delete">DELETE</span> `/api/admin/tokens/:id`

Permanently delete an API token. Requests using this token will immediately start failing with `401`. Regular users can only delete their own tokens.

**Path Parameters:**

| Parameter | Type     | Description    |
| --------- | -------- | -------------- |
| `id`      | `number` | Token ID.      |

**Response -- 200 OK:**

```json
{ "success": true }
```

---

## Template Management

Templates allow you to define reusable message content with `{{variable}}` placeholders. They are resolved at enqueue time by the [Send API](./send#template-usage).

### List Templates

<span className="method-badge method-get">GET</span> `/api/admin/templates`

**Query Parameters:**

| Parameter     | Type     | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `channelType` | `string` | Filter by channel type: `email`, `sms`, or `push`.       |

**Response -- 200 OK:**

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

### Get Template

<span className="method-badge method-get">GET</span> `/api/admin/templates/:id`

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Template ID.     |

---

### Create Template

<span className="method-badge method-post">POST</span> `/api/admin/templates`

**Request Body:**

| Field         | Type     | Required | Description                                                                      |
| ------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `name`        | `string` | Yes      | Template name (1--100 characters). Must be unique per channel type.              |
| `channelType` | `string` | Yes      | Channel type: `email`, `sms`, or `push`.                                         |
| `subject`     | `string` | No       | Subject template (supports `{{variable}}` placeholders). Mainly for email.       |
| `body`        | `string` | Yes      | Body template with `{{variable}}` placeholders.                                  |
| `variables`   | `object` | No       | Key-value pairs describing expected variables (keys are names, values are descriptions). |

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

**Response -- 201 Created:**

```json
{
  "success": true,
  "data": { "id": 3 }
}
```

---

### Update Template

<span className="method-badge method-put">PUT</span> `/api/admin/templates/:id`

Update an existing template. All fields are optional.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Template ID.     |

**Request Body:** Same fields as [Create Template](#create-template), all optional.

**Response -- 200 OK:**

```json
{ "success": true }
```

---

### Delete Template

<span className="method-badge method-delete">DELETE</span> `/api/admin/templates/:id`

Permanently delete a template. Existing messages that were created with this template are **not** affected.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Template ID.     |

**Response -- 200 OK:**

```json
{ "success": true }
```

---

## Message Management

The admin message endpoints provide the same query capabilities as the [Messages API](./messages), plus the ability to retry failed/dead messages and delete messages.

### List Messages (Admin)

<span className="method-badge method-get">GET</span> `/api/user/messages`

Retrieve a paginated list of messages. Same parameters and response format as [List Messages](./messages#list-messages).

**Query Parameters:**

| Parameter  | Type     | Default | Description                                       |
| ---------- | -------- | ------- | ------------------------------------------------- |
| `page`     | `number` | `1`     | Page number (1-based).                            |
| `pageSize` | `number` | `20`    | Items per page (max 100).                         |
| `status`   | `string` | --      | Filter by status.                                 |
| `channel`  | `string` | --      | Filter by channel type: `email`, `sms`, `push`.   |

---

### Get Message (Admin)

<span className="method-badge method-get">GET</span> `/api/admin/messages/:id`

Retrieve a single message by ID. Same response format as [Get a Single Message](./messages#get-a-single-message).

---

### Retry a Message

<span className="method-badge method-post">POST</span> `/api/admin/messages/:id/retry`

Manually retry a `failed` or `dead` message. This resets the retry counter and re-queues the message for immediate delivery.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Message ID.      |

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

**Response -- 200 OK:**

```json
{ "success": true }
```

**Errors:**

| HTTP Status | Error                                               | Description                                       |
| ----------- | --------------------------------------------------- | ------------------------------------------------- |
| `400`       | `Cannot retry message with status '<status>'`       | Only `failed` or `dead` messages can be retried.  |
| `400`       | `Message not found`                                 | The specified message does not exist.              |

---

### Delete Message

<span className="method-badge method-delete">DELETE</span> `/api/admin/messages/:id`

Permanently delete a message.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `id`      | `number` | Message ID.      |

**Response -- 200 OK:**

```json
{ "success": true }
```

---

## Topic Management

Admin topic endpoints provide instance-wide topic management.

### List All Topics

<span className="method-badge method-get">GET</span> `/api/admin/topics`

Retrieve all topics across all users. Admin only.

**Query Parameters:**

| Parameter | Type     | Default | Description                          |
| --------- | -------- | ------- | ------------------------------------ |
| `limit`   | `number` | `50`    | Items per page (max 200).           |
| `offset`  | `number` | `0`     | Offset for pagination.              |
| `search`  | `string` | --      | Search by name or display name.     |

**Response -- 200 OK:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": 0,
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

### Get Topic (Admin)

<span className="method-badge method-get">GET</span> `/api/admin/topics/{id}`

Retrieve a single topic by ID. Admin only.

### Delete Topic (Admin)

<span className="method-badge method-delete">DELETE</span> `/api/admin/topics/{id}`

Delete a topic by ID. Cannot delete preset topics. Messages associated with the topic have their `topic_id` set to `NULL`. Admin only.

**Response -- 200 OK:**

```json
{ "success": true }
```

**Errors:**

| HTTP Status | Error | Description |
|-------------|-------|-------------|
| `403` | `cannot delete preset topic` | Preset topics cannot be deleted. |
| `404` | `topic not found` | The specified topic does not exist. |

---

## Statistics

### Overview Statistics

<span className="method-badge method-get">GET</span> `/api/user/stats/overview`

Get aggregate message statistics for the entire instance.

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

| Field              | Type     | Description                                                    |
| ------------------ | -------- | -------------------------------------------------------------- |
| `totalMessages`    | `number` | Total messages ever created.                                   |
| `sentMessages`     | `number` | Messages with `sent` status.                                   |
| `failedMessages`   | `number` | Messages with `failed` or `dead` status.                       |
| `queuedMessages`   | `number` | Messages currently in `queued` status.                         |
| `successRate`      | `number` | Percentage of total messages that are `sent`.                  |
| `messagesLast24h`  | `number` | Messages created in the last 24 hours.                         |
| `messagesLast7d`   | `number` | Messages created in the last 7 days.                           |

---

### Daily Statistics

<span className="method-badge method-get">GET</span> `/api/user/stats/daily`

Get per-day message counts for the last 7 days.

**Response -- 200 OK:**

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

| Field     | Type     | Description                                  |
| --------- | -------- | -------------------------------------------- |
| `date`    | `string` | Date in `YYYY-MM-DD` format (UTC).           |
| `total`   | `number` | Total messages created on that day.          |
| `sent`    | `number` | Messages that reached `sent` status.         |
| `failed`  | `number` | Messages that reached `failed` or `dead`.    |

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

## User Management

User management endpoints are restricted to users with the `admin` role. Regular users will receive a `403 Forbidden` response.

### List Users

<span className="method-badge method-get">GET</span> `/api/admin/users`

Retrieve all registered users.

**Response -- 200 OK:**

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

### Get User

<span className="method-badge method-get">GET</span> `/api/admin/users/:id`

**Path Parameters:**

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `id`      | `number` | User ID.      |

---

### Create User

<span className="method-badge method-post">POST</span> `/api/admin/users`

Create a new user with a specified role.

**Request Body:**

| Field      | Type     | Required | Description                              |
| ---------- | -------- | -------- | ---------------------------------------- |
| `email`    | `string` | Yes      | Email address (must be unique).          |
| `username` | `string` | Yes      | Display name (1--50 characters).         |
| `password` | `string` | Yes      | Password (minimum 6 characters).         |
| `role`     | `string` | No       | `admin` or `user`. Default: `user`.      |

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

**Response -- 201 Created:**

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

**Errors:**

| HTTP Status | Error                      | Description                       |
| ----------- | -------------------------- | --------------------------------- |
| `400`       | Validation error           | Missing fields or invalid format. |
| `409`       | `Email already registered` | An account with this email exists. |

---

### Update User

<span className="method-badge method-put">PUT</span> `/api/admin/users/:id`

Update a user's profile or role. All fields are optional.

**Path Parameters:**

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `id`      | `number` | User ID.      |

**Request Body:**

| Field      | Type     | Required | Description                |
| ---------- | -------- | -------- | -------------------------- |
| `email`    | `string` | No       | New email (must be unique). |
| `username` | `string` | No       | New display name.          |
| `role`     | `string` | No       | New role: `admin` or `user`. |

**Response -- 200 OK:**

```json
{ "success": true }
```

**Errors:**

| HTTP Status | Error                | Description                              |
| ----------- | -------------------- | ---------------------------------------- |
| `404`       | `User not found`     | The specified user does not exist.       |
| `409`       | `Email already in use` | Another user already has this email.    |

---

### Delete User

<span className="method-badge method-delete">DELETE</span> `/api/admin/users/:id`

Permanently delete a user account.

:::caution
You cannot delete the last admin user. This safeguard prevents locking yourself out of the admin interface.
:::

**Path Parameters:**

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `id`      | `number` | User ID.      |

**Response -- 200 OK:**

```json
{ "success": true }
```

**Errors:**

| HTTP Status | Error                              | Description                                    |
| ----------- | ---------------------------------- | ---------------------------------------------- |
| `400`       | `Cannot delete the last admin user` | At least one admin account must remain.        |
| `404`       | `User not found`                   | The specified user does not exist.              |
