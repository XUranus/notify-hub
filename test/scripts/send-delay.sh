#!/bin/bash
# Send messages with delay (scheduled delivery)
source "$(dirname "$0")/env.sh"

echo "=== Send Message with Relative Delay (30 minutes) ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Reminder: Team Standup",
    "body": "Daily standup meeting in 30 minutes. Please prepare your updates.",
    "delay": "30m",
    "tags": ["reminder", "meeting"],
    "priority": 40
  }' | pretty

echo ""
echo "=== Send Message with Delay in Hours (2 hours) ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Scheduled: Database Backup",
    "body": "Automated database backup will start in 2 hours.",
    "delay": "2h",
    "tags": ["scheduled", "backup"],
    "priority": 60
  }' | pretty

echo ""
echo "=== Send Message with Absolute DateTime ==="
curl -s -X POST "${SERVER_URL}/api/v1/send" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d '{
    "channel": "push",
    "to": "test-client",
    "subject": "Scheduled Maintenance",
    "body": "System maintenance window begins at the scheduled time.",
    "delay": "2025-12-31 23:59:59",
    "tags": ["maintenance"],
    "priority": 70
  }' | pretty

echo ""
echo "Note: Delayed messages are stored with scheduledAt and delivered when the time arrives."
