# NotifyHub Skills

## Push Notification via API

Use the NotifyHub `/api/v1` API to send push notifications to registered devices.

### Environment Variables

```bash
NOTIFYHUB_BASE=http://your-server:3000
NOTIFYHUB_KEY=nfkey_xxxxx
```

### Authentication

All endpoints require `Authorization: Bearer <API_KEY>` header. The API key can be a JWT token or an API token created in the web dashboard (Settings → API Keys).

### Send a Push Notification

```bash
curl -X POST "$NOTIFYHUB_BASE/api/v1/send" \
  -H "Authorization: Bearer $NOTIFYHUB_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "push",
    "to": "*",
    "subject": "Notification Title",
    "body": "Notification content (supports markdown)",
    "format": "markdown"
  }'
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | ✅ | `"push"` for device push, `"email"` for email, `"sms"` for SMS |
| `to` | string | ✅ | `"*"` for broadcast all devices, or specific client UUID |
| `subject` | string | ❌ | Notification title |
| `body` | string | ❌ | Notification content (markdown supported) |
| `format` | string | ❌ | `"text"` (default), `"markdown"`, `"html"`, `"json"` |
| `topic` | string | ❌ | Topic name to categorize the message |
| `tags` | string[] | ❌ | Tags for filtering, e.g. `["urgent", "deploy"]` |
| `priority` | number | ❌ | 0=normal, 34=high, 67=urgent |
| `url` | string | ❌ | URL to open when notification is clicked |
| `attachment` | object | ❌ | `{ "name": "file.png", "url": "https://..." }` |
| `template` | string | ❌ | Template name (server-side rendering) |
| `variables` | object | ❌ | Template variables |
| `idempotency_key` | string | ❌ | Dedup key to prevent duplicate sends |
| `delay` | string | ❌ | Delay send, e.g. `"30m"`, `"1h"`, `"1d"` |

#### Response

```json
{
  "success": true,
  "data": {
    "messageId": "uuid",
    "status": "queued"
  }
}
```

### Topic Management

Topics categorize messages. Preset topics (claudecode, codex, etc.) come with icons and display names.

#### List Topics

```bash
curl "$NOTIFYHUB_BASE/api/v1/topic?search=claude" \
  -H "Authorization: Bearer $NOTIFYHUB_KEY"
```

#### Create Topic (with Fork from Preset)

```bash
curl -X POST "$NOTIFYHUB_BASE/api/v1/topic" \
  -H "Authorization: Bearer $NOTIFYHUB_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-alerts", "forkFrom": "<preset-topic-id>"}'
```

Fork copies `displayName` and `icon` from the source preset topic.

#### Send to Specific Topic

```bash
curl -X POST "$NOTIFYHUB_BASE/api/v1/send" \
  -H "Authorization: Bearer $NOTIFYHUB_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "push",
    "to": "*",
    "subject": "Deploy Complete",
    "body": "v2.1.0 deployed to production",
    "topic": "my-alerts"
  }'
```

### Batch Send

```bash
curl -X POST "$NOTIFYHUB_BASE/api/v1/send/batch" \
  -H "Authorization: Bearer $NOTIFYHUB_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"channel": "push", "to": "*", "subject": "Alert 1", "body": "..."},
      {"channel": "push", "to": "*", "subject": "Alert 2", "body": "..."}
    ]
  }'
```

### Common Patterns

#### Shell Script Hook

```bash
#!/bin/bash
curl -s -X POST "$NOTIFYHUB_BASE/api/v1/send" \
  -H "Authorization: Bearer $NOTIFYHUB_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"push\",\"to\":\"*\",\"subject\":\"$1\",\"body\":\"$2\",\"format\":\"markdown\"}"
```

#### Node.js Hook

```javascript
const BASE = process.env.NOTIFYHUB_BASE;
const KEY = process.env.NOTIFYHUB_KEY;

async function notify(subject, body, topic) {
  const res = await fetch(`${BASE}/api/v1/send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: "push",
      to: "*",
      subject,
      body,
      format: "markdown",
      topic,
    }),
  });
  return res.json();
}
```

#### Python Hook

```python
import os, requests

BASE = os.environ["NOTIFYHUB_BASE"]
KEY = os.environ["NOTIFYHUB_KEY"]

def notify(subject, body, topic=None):
    payload = {
        "channel": "push",
        "to": "*",
        "subject": subject,
        "body": body,
        "format": "markdown",
    }
    if topic:
        payload["topic"] = topic
    return requests.post(
        f"{BASE}/api/v1/send",
        headers={"Authorization": f"Bearer {KEY}"},
        json=payload,
    ).json()
```

### Preset Topics

Built-in topics with icons:

| Name | Display Name | Description |
|------|-------------|-------------|
| `claudecode` | Claude Code | Claude Code notifications |
| `codex` | Codex | OpenAI Codex notifications |
| `openclaw` | OpenClaw | OpenClaw notifications |
| `opencode` | OpenCode | OpenCode notifications |

Fork a preset to create your own topic with the same icon and display name.

---

## Hook Scripts

Ready-to-use hook scripts for AI coding agents. Each script automatically creates a topic (forking from the preset) and sends notifications when tasks complete.

### Claude Code

**File:** `claude/claude-code-notifyhub.js`

**Hook type:** Claude Code Stop/Notification hooks (stdin JSON)

**Config:** `~/.claude/settings.json`
```json
{
  "hooks": {
    "Stop": [{ "matcher": "", "hooks": ["node /path/to/claude-code-notifyhub.js"] }],
    "Notification": [{ "matcher": "", "hooks": ["node /path/to/claude-code-notifyhub.js"] }]
  }
}
```

**Input:** `{ session_id, hook_event_name, last_assistant_message, cwd, ... }`

---

### OpenAI Codex CLI

**File:** `codex/codex-notifyhub.js`

**Hook type:** Shell command hooks (stdin JSON, env var fallback)

**Config:** `~/.codex/config.json`
```json
{
  "hooks": {
    "on_task_complete": "node /path/to/codex-notifyhub.js",
    "on_task_error": "node /path/to/codex-notifyhub.js"
  }
}
```

**Input:** `{ session_id, hook_event, response, error, cwd, ... }` via stdin. Also reads `CODEX_SESSION_ID` and `CODEX_HOOK_EVENT` env vars as fallback.

---

### OpenCode (SST)

**File:** `opencode/opencode-notifyhub.ts`

**Hook type:** Plugin (`@opencode-ai/plugin` SDK, event.subscribe)

**Config:** `~/.config/opencode/config.json`
```json
{
  "plugin": ["./opencode-notifyhub.ts"]
}
```

**Events:** Subscribes to `session.created`, `session.status`, `session.error`, `session.deleted`. Notifies on `idle`, `completed`, `error` status.

---

### OpenClaw

**File:** `openclaw/openclaw-notifyhub.ts`

**Hook type:** Hook (`@openclaw/sdk` defineHook, workspace hooks/ directory)

**Config:** Place in workspace `hooks/` directory, then `openclaw restart`

**Events:** `agent_end` (primary — sends agent reply). Optional `session_end` (commented out by default).

---

### Common Setup

All scripts require two env vars:
```bash
export NOTIFYHUB_BASE=http://your-server:3000
export NOTIFYHUB_KEY=nfkey_xxxxx
```

Each script:
1. Searches for an existing topic named `{tool}_{session_id}`
2. If not found, forks from the matching preset topic (e.g. `codex`, `claudecode`)
3. Sends the notification to that topic via `/api/v1/send`
