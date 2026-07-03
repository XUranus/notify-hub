#!/bin/bash
# Send 3 messages with different priorities to test ordering
source "$(dirname "$0")/env.sh"

echo "=== Send Low Priority Message (P=10) ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Low Priority",
    "body": "This is a low priority informational message.",
    "priority": 10,
    "tags": ["info"]
  }' | pretty

echo ""
echo "=== Send High Priority Message (P=90) ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Critical Alert!",
    "body": "Database connection pool exhausted. Immediate action required.",
    "priority": 90,
    "tags": ["critical", "database"],
    "format": "text"
  }' | pretty

echo ""
echo "=== Send Medium Priority Message (P=50) ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Warning: Disk Usage",
    "body": "Disk usage on server-01 has reached 85%. Consider cleanup.",
    "priority": 50,
    "tags": ["warning", "infrastructure"],
    "url": "https://monitoring.example.com/server-01"
  }' | pretty

echo ""
echo "Messages sent. Higher priority messages should be processed first by the queue."
