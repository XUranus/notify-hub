#!/bin/bash
# Send a batch of messages with mixed fields
source "$(dirname "$0")/env.sh"

echo "=== Send Batch Messages ==="
curl -s -X POST "${SERVER_URL}/api/v1/send/batch" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "messages": [
      {
        "channel": "push",
        "to": "test-client",
        "subject": "Batch: Server Alert",
        "body": "CPU usage exceeded 95% on prod-web-03",
        "tags": ["alert", "cpu", "prod"],
        "priority": 75,
        "url": "https://grafana.example.com/d/prod-web-03",
        "format": "text"
      },
      {
        "channel": "push",
        "to": "test-client",
        "subject": "Batch: Weekly Report",
        "body": "# Weekly Report\n\n- **Uptime**: 99.97%\n- **Requests**: 1.2M\n- **Errors**: 34",
        "tags": ["report", "weekly"],
        "priority": 5,
        "format": "markdown"
      },
      {
        "channel": "push",
        "to": "test-client",
        "subject": "Batch: New User Signup",
        "body": "<h2>Welcome!</h2><p>User <b>john@example.com</b> just signed up.</p>",
        "tags": ["user", "signup"],
        "priority": 20,
        "format": "html",
        "attachment": {
          "name": "user-profile.json",
          "data": "eyJuYW1lIjoiSm9obiIsImVtYWlsIjoiam9obkBleGFtcGxlLmNvbSJ9"
        }
      }
    ]
  }' | pretty
