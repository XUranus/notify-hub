#!/bin/bash
# Send a message with all extended fields: tags, priority, url, attachment, format
source "$(dirname "$0")/env.sh"

echo "=== Send Message with All Extended Fields ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Deployment Notification",
    "body": "**Build #1234** deployed successfully to production.\n\nAll health checks passed.",
    "tags": ["deploy", "production", "v2.1.0"],
    "priority": 80,
    "url": "https://dashboard.example.com/deployments/1234",
    "attachment": {
      "name": "deploy-log.txt",
      "url": "https://logs.example.com/build-1234.txt"
    },
    "format": "markdown"
  }' | pretty
