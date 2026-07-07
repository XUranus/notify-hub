#!/bin/bash
set -euo pipefail

SERVER="http://localhost:3000"
TOKEN=""
LOG_DIR="/tmp/notifyhub-stress-test"
mkdir -p "$LOG_DIR"

# ─── Helper: login and get token ───
get_token() {
    local resp
    resp=$(curl -s -m 10 -X POST "$SERVER/api/auth/login" \
        -H 'Content-Type: application/json' \
        -d '{"emailOrUsername":"admin@notifyhub.local","password":"admin123"}')
    TOKEN=$(echo "$resp" | jq -r '.data.token')
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        echo "ERROR: Login failed: $resp"
        exit 1
    fi
    echo "Token acquired: ${TOKEN:0:20}..."
}

# ─── Helper: send a single push message ───
send_message() {
    local to="$1" title="$2" body="$3" topic="${4:-}"
    local payload
    if [ -n "$topic" ]; then
        payload=$(jq -n --arg t "$title" --arg b "$body" --arg to "$to" --arg tp "$topic" \
            '{channel:"push",to:$to,subject:$t,body:$b,topic:$tp,tags:["stress"],priority:0,format:"text"}')
    else
        payload=$(jq -n --arg t "$title" --arg b "$body" --arg to "$to" \
            '{channel:"push",to:$to,subject:$t,body:$b,tags:["stress"],priority:0,format:"text"}')
    fi
    curl -s -m 10 -X POST "$SERVER/api/v1/send" \
        -H "Authorization: Bearer $TOKEN" \
        -H 'Content-Type: application/json' \
        -d "$payload" 2>/dev/null
}

# ─── Test 1: Sequential burst (N messages one by one) ───
test_sequential_burst() {
    local count=${1:-100}
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  TEST 1: Sequential Burst ($count messages)"
    echo "═══════════════════════════════════════════════════"

    local start_time end_time duration
    start_time=$(date +%s%N)

    local success=0 fail=0
    for i in $(seq 1 "$count"); do
        local resp
        resp=$(send_message "*" "Burst #$i" "Sequential burst test message $i of $count" "stress-burst")
        local ok
        ok=$(echo "$resp" | jq -r '.success // false')
        if [ "$ok" = "true" ]; then
            ((success++))
        else
            ((fail++))
            if [ "$fail" -le 3 ]; then
                echo "  FAIL #$i: $resp"
            fi
        fi
        # Print progress every 20%
        if (( i % (count/5) == 0 )); then
            echo "  Progress: $i/$count sent"
        fi
    done

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    local rate=0
    if [ "$duration" -gt 0 ]; then
        rate=$(( success * 1000 / duration ))
    fi

    echo "  Results:"
    echo "    Sent:     $success / $count"
    echo "    Failed:   $fail"
    echo "    Duration: ${duration}ms"
    echo "    Rate:     ${rate} msg/s"
    echo "$success $fail $duration $rate" > "$LOG_DIR/test1_result.txt"
}

# ─── Test 2: Concurrent burst (N messages in parallel) ───
test_concurrent_burst() {
    local count=${1:-100} concurrency=${2:-10}
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  TEST 2: Concurrent Burst ($count msgs, $concurrency parallel)"
    echo "═══════════════════════════════════════════════════"

    local start_time end_time duration
    start_time=$(date +%s%N)

    # Generate all payloads first
    local payload_file="$LOG_DIR/payloads.jsonl"
    > "$payload_file"
    for i in $(seq 1 "$count"); do
        jq -n --arg t "Concurrent #$i" --arg b "Concurrent test $i/$count" \
            '{channel:"push",to:"*",subject:$t,body:$b,tags:["stress","concurrent"],priority:0,format:"text"}' \
            >> "$payload_file"
    done

    # Send in parallel using xargs
    local result_file="$LOG_DIR/concurrent_results.txt"
    > "$result_file"
    cat "$payload_file" | xargs -P "$concurrency" -I {} bash -c "
        curl -s -m 10 -X POST '$SERVER/api/v1/send' \
            -H 'Authorization: Bearer $TOKEN' \
            -H 'Content-Type: application/json' \
            -d '{}' 2>/dev/null | jq -r '.success // false'
    " > "$result_file" 2>/dev/null

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    local success fail
    success=$(grep -c "true" "$result_file" || true)
    fail=$(grep -c "false" "$result_file" || true)
    local rate=0
    if [ "$duration" -gt 0 ]; then
        rate=$(( success * 1000 / duration ))
    fi

    echo "  Results:"
    echo "    Sent:     $success / $count"
    echo "    Failed:   $fail"
    echo "    Duration: ${duration}ms"
    echo "    Rate:     ${rate} msg/s"
    echo "$success $fail $duration $rate" > "$LOG_DIR/test2_result.txt"
}

# ─── Test 3: Large batch rapid fire ───
test_rapid_fire() {
    local count=${1:-500}
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  TEST 3: Rapid Fire ($count messages, no delay)"
    echo "═══════════════════════════════════════════════════"

    local start_time end_time duration
    start_time=$(date +%s%N)

    # Generate all at once
    local payload_file="$LOG_DIR/rapid_payloads.jsonl"
    > "$payload_file"
    for i in $(seq 1 "$count"); do
        jq -n --arg t "Rapid #$i" --arg b "Rapid fire test $i" --arg i "$i" \
            '{channel:"push",to:"*",subject:$t,body:$b,tags:["rapid",$i],priority:($i|tonumber%5),format:"text"}' \
            >> "$payload_file"
    done

    # Fire all concurrently (20 threads)
    local result_file="$LOG_DIR/rapid_results.txt"
    > "$result_file"
    cat "$payload_file" | xargs -P 20 -I {} bash -c "
        curl -s -m 15 -X POST '$SERVER/api/v1/send' \
            -H 'Authorization: Bearer $TOKEN' \
            -H 'Content-Type: application/json' \
            -d '{}' 2>/dev/null | jq -r '.success // false'
    " > "$result_file" 2>/dev/null

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    local success fail
    success=$(grep -c "true" "$result_file" || true)
    fail=$(grep -c "false" "$result_file" || true)
    local rate=0
    if [ "$duration" -gt 0 ]; then
        rate=$(( success * 1000 / duration ))
    fi

    echo "  Results:"
    echo "    Sent:     $success / $count"
    echo "    Failed:   $fail"
    echo "    Duration: ${duration}ms"
    echo "    Rate:     ${rate} msg/s"
    echo "$success $fail $duration $rate" > "$LOG_DIR/test3_result.txt"
}

# ─── Test 4: Server recovery after restart ───
test_server_restart() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  TEST 4: Server Restart Recovery"
    echo "═══════════════════════════════════════════════════"

    echo "  Sending 20 messages..."
    for i in $(seq 1 20); do
        send_message "*" "Pre-restart #$i" "Before server restart" "restart-test" > /dev/null
    done
    echo "  20 messages sent. Waiting 5s for delivery..."
    sleep 5

    echo "  Killing server..."
    pkill -f "notifyhub-server" || true
    sleep 2

    echo "  Restarting server..."
    cd /home/xuranus/workspace/notifier/crates
    JWT_SECRET="notifyhub-fixed-secret-key-2026" nohup ./target/release/notifyhub-server > /tmp/notifyhub-server.log 2>&1 &
    sleep 3

    # Re-login
    get_token

    echo "  Sending 20 post-restart messages..."
    for i in $(seq 1 20); do
        send_message "*" "Post-restart #$i" "After server restart" "restart-test" > /dev/null
    done
    echo "  Post-restart messages sent. Check listener output for delivery."
}

# ─── Test 5: Listener connection resilience ───
test_listener_resilience() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  TEST 5: Listener Resilience (reconnect after server restart)"
    echo "═══════════════════════════════════════════════════"

    echo "  Sending 10 messages with listener active..."
    for i in $(seq 1 10); do
        send_message "*" "Resilience #$i" "Before restart" > /dev/null
    done
    sleep 3

    echo "  Restarting server (listener should reconnect)..."
    pkill -f "notifyhub-server" || true
    sleep 2
    cd /home/xuranus/workspace/notifier/crates
    JWT_SECRET="notifyhub-fixed-secret-key-2026" nohup ./target/release/notifyhub-server > /tmp/notifyhub-server.log 2>&1 &
    sleep 5
    get_token

    echo "  Sending 10 messages after restart..."
    for i in $(seq 1 10); do
        send_message "*" "Resilience-post #$i" "After restart" > /dev/null
    done
    sleep 3
    echo "  Check listener log for reconnection and message delivery."
}

# ─── Collect server metrics ───
collect_metrics() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  METRICS COLLECTION"
    echo "═══════════════════════════════════════════════════"

    # Database stats
    local db_path="/home/xuranus/workspace/notifier/crates/data/notifyhub.db"
    if [ -f "$db_path" ]; then
        echo "  Database stats:"
        local total queued sent delivered failed push_total push_undelivered push_clients
        total=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM messages;" 2>/dev/null || echo "N/A")
        queued=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM messages WHERE status='queued';" 2>/dev/null || echo "N/A")
        sent=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM messages WHERE status='sent';" 2>/dev/null || echo "N/A")
        delivered=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM messages WHERE status='delivered';" 2>/dev/null || echo "N/A")
        failed=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM messages WHERE status='failed';" 2>/dev/null || echo "N/A")
        push_total=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM push_messages;" 2>/dev/null || echo "N/A")
        push_undelivered=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM push_messages WHERE delivered=0;" 2>/dev/null || echo "N/A")
        push_clients=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM push_clients;" 2>/dev/null || echo "N/A")
        echo "    Messages total:     $total"
        echo "    Messages queued:    $queued"
        echo "    Messages sent:      $sent"
        echo "    Messages delivered: $delivered"
        echo "    Messages failed:    $failed"
        echo "    Push messages:      $push_total"
        echo "    Push undelivered:   $push_undelivered"
        echo "    Push clients:       $push_clients"
    fi

    # Server log tail
    echo ""
    echo "  Server log (last 20 lines):"
    tail -20 /tmp/notifyhub-server.log 2>/dev/null | sed 's/^/    /'

    # Listener log
    local listen_log="$HOME/.notifyhub/listen.jsonl"
    if [ -f "$listen_log" ]; then
        local line_count
        line_count=$(wc -l < "$listen_log")
        echo ""
        echo "  Listener received: $line_count messages (in $listen_log)"
    fi
}

# ─── Print summary ───
print_summary() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  STRESS TEST SUMMARY"
    echo "═══════════════════════════════════════════════════"

    for i in 1 2 3; do
        if [ -f "$LOG_DIR/test${i}_result.txt" ]; then
            read -r success fail duration rate < "$LOG_DIR/test${i}_result.txt"
            local name=""
            case $i in
                1) name="Sequential Burst";;
                2) name="Concurrent Burst";;
                3) name="Rapid Fire";;
            esac
            echo "  Test $i ($name): $success sent, $fail failed, ${duration}ms, ${rate} msg/s"
        fi
    done
    echo ""
}

# ─── Main ───
main() {
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║   NotifyHub Stress Test Suite                     ║"
    echo "╚═══════════════════════════════════════════════════╝"

    # Clean old listener log
    rm -f "$HOME/.notifyhub/listen.jsonl"

    get_token

    # Run tests
    test_sequential_burst 100
    sleep 3

    test_concurrent_burst 200 20
    sleep 3

    test_rapid_fire 500
    sleep 5

    # Collect results
    collect_metrics
    print_summary
}

main "$@"
