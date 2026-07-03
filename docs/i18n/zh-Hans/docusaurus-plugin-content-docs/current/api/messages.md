---
title: 消息 API
sidebar_position: 2
description: 通过 NotifyHub 消息 API 查询和查看通知消息。
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 消息 API

消息 API 让你可以查询通过 NotifyHub 发送的通知的状态和详细信息。可用于跟踪投递情况、排查故障和构建仪表盘。

## 基础 URL

```text
http://<your-host>:9527/api/v1/messages
```

## 认证

所有消息端点都需要有效的 API 令牌：

```text
Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

与[发送 API](./send) 不同，消息 API 不执行权限范围检查 -- 任何有效且启用的令牌都可以读取消息。

---

## 消息生命周期

每条消息从入队到最终状态，都会经历一系列状态变化。

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

### 状态说明

| 状态        | 说明                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `queued`    | 消息已入队，等待工作进程拾取。定时消息在到达 `scheduledAt` 时间之前会一直处于 `queued` 状态。 |
| `sending`   | 工作进程已认领该消息，正在将其投递给渠道提供商。                           |
| `sent`      | 消息已成功发送给渠道提供商（例如 SMTP 服务器已接受）。               |
| `delivered` | 渠道提供商已确认投递（例如收件人的邮件服务器已接受该消息）。并非所有提供商都支持投递确认。 |
| `failed`    | 投递失败。如果还有剩余重试次数，消息将通过指数退避策略自动重试。             |
| `dead`      | 消息已耗尽所有重试次数（默认：5 次）。不会再自动重试。可使用[管理 API](./admin#重试消息) 手动重试。 |

---

## 获取消息列表

<span className="method-badge method-get">GET</span> `/api/v1/messages`

获取分页的消息列表。结果按创建时间排序（最新的在前）。

### 查询参数

| 参数        | 类型     | 默认值  | 说明                                                     |
| ----------- | -------- | ------- | ------------------------------------------------------- |
| `page`      | `number` | `1`     | 页码（从 1 开始）。                                  |
| `pageSize`  | `number` | `20`    | 每页条数。最大值：`100`。               |
| `status`    | `string` | --      | 按消息状态筛选。参见[状态说明](#状态说明)。 |
| `channel`   | `string` | --      | 按渠道类型筛选：`email`、`sms` 或 `push`。      |

### 响应

**成功 -- 200 OK**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 42,
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
        "createdAt": 1719849595000
      }
    ],
    "total": 156,
    "page": 1,
    "pageSize": 20
  }
}
```

### 响应字段

| 字段            | 类型              | 说明                                                                   |
| --------------- | ----------------- | ---------------------------------------------------------------------- |
| `items`         | `Message[]`       | 当前页的消息对象数组。                              |
| `total`         | `number`          | 符合筛选条件的消息总数。                      |
| `page`          | `number`          | 当前页码。                                                        |
| `pageSize`      | `number`          | 每页条数。                                                   |

#### 消息对象

| 字段             | 类型              | 说明                                                                |
| ---------------- | ----------------- | ------------------------------------------------------------------- |
| `id`             | `string`          | 消息唯一标识（UUID）。                                         |
| `channelType`    | `string`          | 渠道类型：`email`、`sms` 或 `push`。                                  |
| `channelId`      | `number \| null`  | 使用的特定渠道实例 ID（如果使用默认渠道则为 `null`）。 |
| `toAddress`      | `string`          | 收件人地址。                                                        |
| `subject`        | `string \| null`  | 消息主题。                                                          |
| `body`           | `string \| null`  | 消息正文。                                                             |
| `templateId`     | `number \| null`  | 使用的模板 ID（如果使用原始正文发送则为 `null`）。             |
| `templateVars`   | `object \| null`  | 模板变量，JSON 对象（或 `null`）。                          |
| `status`         | `string`          | 当前消息状态。参见[状态说明](#状态说明)。 |
| `retryCount`     | `number`          | 迄今为止的投递尝试次数。                                  |
| `maxRetries`     | `number`          | 允许的最大重试次数（默认：5）。                           |
| `nextRetryAt`    | `number \| null`  | 下次计划重试的 Unix 时间戳（毫秒）（或 `null`）。     |
| `errorMessage`   | `string \| null`  | 上次投递失败的错误信息（或 `null`）。          |
| `idempotencyKey` | `string \| null`  | 发送时使用的幂等键（或 `null`）。                            |
| `scheduledAt`    | `number \| null`  | 计划投递时间的 Unix 时间戳（毫秒）（或 `null`）。          |
| `sentAt`         | `number \| null`  | 消息发送时间的 Unix 时间戳（毫秒）（或 `null`）。               |
| `createdAt`      | `number`          | 消息入队时间的 Unix 时间戳（毫秒）。                        |
| `tags`           | `string \| null`  | JSON 标签数组字符串。示例：`"[\"deploy\",\"prod\"]"`.           |
| `priority`       | `number`          | 优先级（0--99）。数值越高，优先投递。                |
| `url`            | `string \| null`  | 关联的 URL，供客户端链接使用。                                   |
| `attachment`     | `string \| null`  | JSON 对象 `{name, url?, data?}`（或 `null`）。                           |
| `format`         | `string`          | 正文格式：`text`、`markdown`、`html` 或 `json`。                      |

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
# List the first page of messages
curl http://localhost:9527/api/v1/messages \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Filter by status
curl "http://localhost:9527/api/v1/messages?status=failed&page=1&pageSize=50" \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Filter by channel type
curl "http://localhost:9527/api/v1/messages?channel=sms" \
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
  `http://localhost:9527/api/v1/messages?${params}`,
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
    "http://localhost:9527/api/v1/messages",
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

## 获取单条消息

<span className="method-badge method-get">GET</span> `/api/v1/messages/:id`

根据 ID 获取特定消息的完整详情。

### 路径参数

| 参数 | 类型     | 说明              |
| --------- | -------- | ------------------------ |
| `id`      | `number` | 要获取的消息 ID。 |

### 响应

**成功 -- 200 OK**

```json
{
  "success": true,
  "data": {
    "id": 42,
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
    "idempotencyKey": "onboarding-user-42",
    "scheduledAt": null,
    "sentAt": 1719849600000,
    "createdAt": 1719849595000
  }
}
```

**未找到 -- 404**

```json
{
  "success": false,
  "error": "Message not found"
}
```

### 示例

<Tabs>
<TabItem value="curl" label="curl">

```bash
curl http://localhost:9527/api/v1/messages/42 \
  -H "Authorization: Bearer nh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
const messageId = 42;
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
    f"http://localhost:9527/api/v1/messages/{message_id}",
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

## 重试行为

当消息投递失败时，NotifyHub 会通过**指数退避**策略自动重试。重试计划如下：

| 重试次数 | 重试前延迟 |
| ------------- | ------------------ |
| 1             | 1 秒           |
| 2             | 5 秒          |
| 3             | 30 秒         |
| 4             | 5 分钟          |
| 5             | 30 分钟         |

**工作原理：**

1. 消息投递失败，状态变为 `failed`。
2. `retryCount` 递增，`nextRetryAt` 根据上述延迟表设置。
3. 工作进程轮询 `nextRetryAt` 已到期的失败消息，并将其重新入队。
4. 达到最大重试次数（默认：**5**）后，消息状态变为 `dead`。
5. 死信消息**不会**自动重试。可使用[管理 API -- 重试消息](./admin#重试消息) 端点手动重试。

:::info
`failed` 状态是临时状态。处于 `failed` 状态的消息在其 `nextRetryAt` 时间到达时会被工作进程自动拾取进行重试。只有 `dead` 状态的消息需要人工干预。
:::
