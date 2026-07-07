#!/usr/bin/env python3
"""NotifyHub Stress Test: SSE vs Poll vs WS comparison"""

import requests
import time
import json
import sys
import os
import subprocess
import signal
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed

SERVER = "http://localhost:3000"
CLI_BIN = "/home/xuranus/workspace/notifier/crates/target/release/notifyhub-cli"
DB_PATH = "/home/xuranus/workspace/notifier/crates/data/notifyhub.db"
LISTEN_LOG_DIR = "/tmp/notifyhub-modes-test"
os.makedirs(LISTEN_LOG_DIR, exist_ok=True)


def get_token():
    resp = requests.post(f"{SERVER}/api/auth/login", json={
        "emailOrUsername": "admin@notifyhub.local",
        "password": "admin123"
    }, timeout=10)
    return resp.json()["data"]["token"]


def send_message(token, to, title, body):
    try:
        resp = requests.post(f"{SERVER}/api/v1/send",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "channel": "push", "to": to,
                "subject": title, "body": body,
                "tags": ["stress"], "priority": 0, "format": "text",
            }, timeout=15)
        return resp.json().get("success", False)
    except:
        return False


def send_batch(token, count, concurrency=20, label="msg"):
    """Send N messages concurrently, return (success, fail, duration_ms, rate)"""
    start = time.monotonic()
    results = []

    def do_send(i):
        return send_message(token, "*", f"{label}#{i}", f"Batch {i}/{count}")

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(do_send, i): i for i in range(1, count + 1)}
        for f in as_completed(futures):
            results.append(f.result())

    duration = time.monotonic() - start
    success = sum(1 for r in results if r)
    fail = sum(1 for r in results if not r)
    rate = int(success / duration) if duration > 0 else 0
    return success, fail, duration * 1000, rate


def db_query(sql):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(sql)
        result = c.fetchone()[0]
        conn.close()
        return result
    except:
        return None


def start_listener(mode, uuid, log_file):
    """Start a CLI listener in background, return PID"""
    env = os.environ.copy()
    proc = subprocess.Popen(
        [CLI_BIN, "listen", f"--{mode}"],
        stdout=open(log_file, "w"),
        stderr=subprocess.STDOUT,
        env=env,
    )
    return proc


def count_log_lines(log_file):
    try:
        with open(log_file) as f:
            return sum(1 for _ in f)
    except:
        return 0


def extract_message_ids_from_log(log_file):
    """Extract unique message identifiers from listener log"""
    ids = set()
    try:
        with open(log_file) as f:
            for line in f:
                line = line.strip()
                # Lines like: [info] Label#123: body
                if line.startswith("[info]") or line.startswith("[warn]"):
                    # Extract the #N part as a rough dedup key
                    if "#" in line:
                        parts = line.split("#")
                        if len(parts) > 1:
                            num = parts[1].split(":")[0].split(" ")[0]
                            ids.add(num)
    except:
        pass
    return ids


def wait_for_delivery(target_count, timeout_sec=120, poll_interval=2):
    """Wait until push_messages delivered reaches target or timeout"""
    start = time.monotonic()
    while time.monotonic() - start < timeout_sec:
        delivered = db_query("SELECT COUNT(*) FROM push_messages WHERE delivered=1")
        if delivered is not None and delivered >= target_count:
            return True, time.monotonic() - start
        time.sleep(poll_interval)
    return False, time.monotonic() - start


def run_test_for_mode(mode, uuid, token, message_count=500):
    """Run a full stress test for one connection mode"""
    print()
    print("=" * 60)
    print(f"  MODE: {mode.upper()} — {message_count} messages")
    print("=" * 60)

    log_file = os.path.join(LISTEN_LOG_DIR, f"listen_{mode}.log")
    jsonl_file = os.path.join(LISTEN_LOG_DIR, f"listen_{mode}.jsonl")

    # Clean old files
    for f in [log_file, jsonl_file]:
        if os.path.exists(f):
            os.remove(f)

    # Reset DB counters for this test
    base_delivered = db_query("SELECT COUNT(*) FROM push_messages WHERE delivered=1") or 0
    base_total = db_query("SELECT COUNT(*) FROM push_messages") or 0

    # Start listener
    print(f"  Starting {mode} listener...")
    proc = start_listener(mode, uuid, log_file)
    time.sleep(5)  # Wait for connection

    # Verify listener started
    log_lines = count_log_lines(log_file)
    if log_lines == 0:
        print(f"  ERROR: Listener didn't start!")
        proc.terminate()
        return None

    print(f"  Listener started (PID={proc.pid})")

    # Phase 1: Send messages and measure API throughput
    print(f"  Phase 1: Sending {message_count} messages (20 parallel)...")
    api_success, api_fail, api_dur, api_rate = send_batch(token, message_count, 20, mode)
    print(f"    API: {api_success} sent, {api_fail} failed, {api_dur:.0f}ms, {api_rate} msg/s")

    # Phase 2: Wait for delivery
    expected_total = base_total + message_count
    print(f"  Phase 2: Waiting for delivery (target: {expected_total} push_messages)...")
    delivery_ok, wait_time = wait_for_delivery(expected_total, timeout_sec=180)
    new_delivered = (db_query("SELECT COUNT(*) FROM push_messages WHERE delivered=1") or 0) - base_delivered
    new_total = (db_query("SELECT COUNT(*) FROM push_messages") or 0) - base_total
    delivery_rate = new_delivered / message_count * 100 if message_count > 0 else 0

    print(f"    Delivered: {new_delivered}/{message_count} ({delivery_rate:.1f}%)")
    print(f"    Wait time: {wait_time:.1f}s")

    # Phase 3: Check listener received messages
    time.sleep(3)  # Extra settle time
    log_total = count_log_lines(log_file)
    received_ids = extract_message_ids_from_log(log_file)
    receive_rate = len(received_ids) / message_count * 100 if message_count > 0 else 0

    print(f"  Phase 3: Listener stats")
    print(f"    Log lines: {log_total}")
    print(f"    Unique messages received: {len(received_ids)}/{message_count} ({receive_rate:.1f}%)")

    # Phase 4: Check queue backlog
    queued = db_query("SELECT COUNT(*) FROM messages WHERE status='queued'") or 0
    print(f"  Phase 4: Queue backlog: {queued}")

    # Calculate latency
    latency_avg = db_query("SELECT ROUND(AVG(sent_at - created_at),1) FROM messages WHERE sent_at IS NOT NULL AND sent_at > 0 AND created_at > (SELECT MIN(created_at) FROM messages)") or 0

    # Stop listener
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()

    result = {
        "mode": mode,
        "api_success": api_success,
        "api_fail": api_fail,
        "api_rate": api_rate,
        "delivered": new_delivered,
        "delivery_pct": delivery_rate,
        "wait_time": wait_time,
        "received": len(received_ids),
        "receive_pct": receive_rate,
        "queued": queued,
    }
    print(f"  Result: {json.dumps(result, indent=2)}")
    return result


def main():
    print("╔═══════════════════════════════════════════════════════╗")
    print("║   NotifyHub Multi-Mode Stress Test (SSE/Poll/WS)     ║")
    print("╚═══════════════════════════════════════════════════════╝")

    # Register fresh client
    token = get_token()
    import uuid as uuid_mod
    new_uuid = str(uuid_mod.uuid4())
    resp = requests.post(f"{SERVER}/api/v1/push/register",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "uuid": new_uuid, "name": f"stress-{new_uuid[:8]}",
            "os": "linux", "arch": "x86_64", "desktop": "cli",
            "appVersion": "0.1.0",
        }, timeout=10)
    print(f"Registered client: {new_uuid}")
    print(f"Register response: {resp.json()}")

    # Update CLI config
    config_path = os.path.expanduser("~/.notifyhub.yaml")
    with open(config_path) as f:
        config = f.read()
    import re
    config = re.sub(r'^uuid:.*', f'uuid: {new_uuid}', config, flags=re.MULTILINE)
    with open(config_path, 'w') as f:
        f.write(config)

    # Run tests for each mode
    results = []
    message_count = 500

    for mode in ["sse", "poll", "ws"]:
        result = run_test_for_mode(mode, new_uuid, token, message_count)
        if result:
            results.append(result)
        time.sleep(5)  # Cooldown between tests

    # Final summary
    print()
    print("=" * 70)
    print("  COMPARISON SUMMARY")
    print("=" * 70)
    print(f"  {'Mode':<8} {'API Rate':>10} {'Delivered':>12} {'Received':>12} {'Backlog':>10}")
    print(f"  {'─'*8} {'─'*10} {'─'*12} {'─'*12} {'─'*10}")
    for r in results:
        print(f"  {r['mode']:<8} {r['api_rate']:>7}/s {r['delivered']:>6}/{r['api_success']:<5} ({r['delivery_pct']:.0f}%) {r['received']:>6}/{r['api_success']:<5} ({r['receive_pct']:.0f}%) {r['queued']:>10}")

    print()
    print("  Analysis:")
    for r in results:
        print(f"  • {r['mode'].upper()}: API {r['api_rate']} msg/s, "
              f"delivery {r['delivery_pct']:.0f}%, "
              f"listener received {r['receive_pct']:.0f}%, "
              f"backlog {r['queued']}")

    # Save results
    result_file = os.path.join(LISTEN_LOG_DIR, "results.json")
    with open(result_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved to {result_file}")


if __name__ == "__main__":
    main()
