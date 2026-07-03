#!/bin/bash
# Shared configuration for test scripts
# Edit these values to match your setup

SERVER_URL="${SERVER_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-your-api-token-here}"

# Common headers
AUTH_HEADER="Authorization: Bearer ${API_KEY}"
CONTENT_TYPE="Content-Type: application/json"

# Helper: pretty-print JSON response
pretty() {
  if command -v jq &>/dev/null; then
    jq .
  else
    cat
  fi
}
