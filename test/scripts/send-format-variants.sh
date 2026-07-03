#!/bin/bash
# Send messages with different format types
source "$(dirname "$0")/env.sh"

echo "=== Format: text (default) ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Plain Text Message",
    "body": "This is a plain text message. No formatting applied.",
    "format": "text"
  }' | pretty

echo ""
echo "=== Format: markdown ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Markdown Message",
    "body": "# Hello!\n\nThis is **bold** and *italic*.\n\n- Item 1\n- Item 2\n\n```js\nconsole.log(\"hello\");\n```",
    "format": "markdown",
    "tags": ["markdown", "demo"]
  }' | pretty

echo ""
echo "=== Format: html ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "HTML Message",
    "body": "<h2>Alert Summary</h2><p>Status: <span style=\"color:green;font-weight:bold\">OK</span></p><ul><li>Server: online</li><li>DB: connected</li></ul>",
    "format": "html",
    "tags": ["html", "demo"]
  }' | pretty

echo ""
echo "=== Format: json ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "JSON Payload",
    "body": "{\"event\":\"user.login\",\"userId\":\"abc123\",\"ip\":\"192.168.1.1\",\"timestamp\":\"2025-01-15T10:30:00Z\"}",
    "format": "json",
    "tags": ["json", "auth"],
    "priority": 15
  }' | pretty
