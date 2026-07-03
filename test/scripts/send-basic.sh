#!/bin/bash
# Send a basic text message with minimal fields
source "$(dirname "$0")/env.sh"

echo "=== Send Basic Text Message ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Hello World",
    "body": "This is a basic notification with no extended fields."
  }' | pretty
