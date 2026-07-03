#!/bin/bash
# Send a message with a base64-encoded attachment
source "$(dirname "$0")/env.sh"

# Create a small JSON payload and base64-encode it
PAYLOAD='{"event":"test","timestamp":"2025-01-15T10:30:00Z","data":{"key":"value"}}'
B64_DATA=$(echo -n "$PAYLOAD" | base64)

echo "=== Send Message with Base64 Attachment ==="
echo "Original payload: ${PAYLOAD}"
echo "Base64 encoded:   ${B64_DATA}"
echo ""

curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d "{
    \"channel\": \"push\",
    \"to\": \"test-client\",
    \"subject\": \"Event Data Attached\",
    \"body\": \"An event payload is attached as base64-encoded JSON data.\",
    \"tags\": [\"event\", \"attachment\"],
    \"priority\": 30,
    \"attachment\": {
      \"name\": \"event-payload.json\",
      \"data\": \"${B64_DATA}\"
    },
    \"format\": \"text\"
  }" | pretty
