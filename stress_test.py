#!/usr/bin/env python3
"""NotifyHub Stress Test Suite"""

import requests
import time
import json
import sys
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

SERVER = "http://localhost:3000"
LOG_DIR = "/tmp/notifyhub-stress-test"
os.makedirs(LOG_DIR, exist_ok=True)

# ─── Auth ───
def get_token():
    resp = requests.post(f"{SERVER}/api/auth/login", json={
        "emailOrUsername": "admin@notifyhub.local",
        "password": "admin123"
    }, timeout=10)
    data = resp.json()
    token = data.get("data", {}).get("token")
    if not token:
        print(f"ERROR: Login failed: {data}")
        sys.exit(1)
    print(f"  Token acquired: {token[:30]}...")
    return token

# ─── Send message ───
def send_message(token, to, title, body, topic=None):
    payload = {
        "channel": "push",
        "to": to,
        "subject": title,
        "body": body,
        "tags": ["stress"],
        "priority": 0,
        "format": "text",
    }
    if topic:
        payload["topic"] = topic
    try:
        resp = requests.post(f"{SERVER}/api/v1/send",
            headers={"Authorization": f"Bearer {token}"},
            json=payload, timeout=15)
        data = resp.json()
        return data.get("success", False)
    except Exception as e:
        return False

# ─── Test 1: Sequential burst ───
def test_sequential_burst(token, count=100):
    print()
    print("=" * 60)
    print(f"  TEST 1: Sequential Burst ({count} messages)")
    print("=" * 60)

    start = time.monotonic()
    success = fail = 0
    for i in range(1, count + 1):
        ok = send_message(token, "*", f"Burst #{i}", f"Sequential burst test {i}/{count}", "stress-burst")
        if ok:
            success += 1
        else:
            fail += 1
            if fail <= 3:
                print(f"    FAIL #{i}")
        if i % (count // 5) == 0:
            print(f"    Progress: {i}/{count}")

    duration = time.monotonic() - start
    rate = int(success / duration) if duration > 0 else 0

    print(f"  Results:")
    print(f"    Sent:     {success}/{count}")
    print(f"    Failed:   {fail}")
    print(f"    Duration: {duration*1000:.0f}ms")
    print(f"    Rate:     {rate} msg/s")
    return {"name": "Sequential Burst", "success": success, "fail": fail,
            "duration_ms": duration * 1000, "rate": rate}

# ─── Test 2: Concurrent burst ───
def test_concurrent_burst(token, count=200, concurrency=20):
    print()
    print("=" * 60)
    print(f"  TEST 2: Concurrent Burst ({count} msgs, {concurrency} parallel)")
    print("=" * 60)

    start = time.monotonic()
    results = []

    def do_send(i):
        return send_message(token, "*", f"Concurrent #{i}", f"Concurrent test {i}/{count}", "stress-concurrent")

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(do_send, i): i for i in range(1, count + 1)}
        done_count = 0
        for f in as_completed(futures):
            results.append(f.result())
            done_count += 1
            if done_count % (count // 5) == 0:
                print(f"    Progress: {done_count}/{count}")

    duration = time.monotonic() - start
    success = sum(1 for r in results if r)
    fail = sum(1 for r in results if not r)
    rate = int(success / duration) if duration > 0 else 0

    print(f"  Results:")
    print(f"    Sent:     {success}/{count}")
    print(f"    Failed:   {fail}")
    print(f"    Duration: {duration*1000:.0f}ms")
    print(f"    Rate:     {rate} msg/s")
    return {"name": "Concurrent Burst", "success": success, "fail": fail,
            "duration_ms": duration * 1000, "rate": rate}

# ─── Test 3: Rapid fire (high concurrency) ───
def test_rapid_fire(token, count=500, concurrency=30):
    print()
    print("=" * 60)
    print(f"  TEST 3: Rapid Fire ({count} msgs, {concurrency} parallel)")
    print("=" * 60)

    start = time.monotonic()
    results = []

    def do_send(i):
        return send_message(token, "*", f"Rapid #{i}", f"Rapid fire test {i}", "stress-rapid")

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(do_send, i): i for i in range(1, count + 1)}
        done_count = 0
        for f in as_completed(futures):
            results.append(f.result())
            done_count += 1
            if done_count % (count // 5) == 0:
                print(f"    Progress: {done_count}/{count}")

    duration = time.monotonic() - start
    success = sum(1 for r in results if r)
    fail = sum(1 for r in results if not r)
    rate = int(success / duration) if duration > 0 else 0

    print(f"  Results:")
    print(f"    Sent:     {success}/{count}")
    print(f"    Failed:   {fail}")
    print(f"    Duration: {duration*1000:.0f}ms")
    print(f"    Rate:     {rate} msg/s")
    return {"name": "Rapid Fire", "success": success, "fail": fail,
            "duration_ms": duration * 1000, "rate": rate}

# ─── Test 4: Sustained load (rate-limited) ───
def test_sustained_load(token, duration_sec=30, target_rate=50):
    """Send at a steady rate for a duration to test sustained throughput."""
    print()
    print("=" * 60)
    print(f"  TEST 4: Sustained Load ({duration_sec}s at ~{target_rate} msg/s)")
    print("=" * 60)

    interval = 1.0 / target_rate
    start = time.monotonic()
    success = fail = 0
    i = 0

    while time.monotonic() - start < duration_sec:
        i += 1
        ok = send_message(token, "*", f"Sustained #{i}", f"Sustained load msg {i}", "stress-sustained")
        if ok:
            success += 1
        else:
            fail += 1
        if i % 100 == 0:
            elapsed = time.monotonic() - start
            print(f"    Progress: {i} sent in {elapsed:.1f}s ({int(i/elapsed)} msg/s)")
        # Rate limiting
        next_time = start + i * interval
        sleep_time = next_time - time.monotonic()
        if sleep_time > 0:
            time.sleep(sleep_time)

    duration = time.monotonic() - start
    rate = int(success / duration) if duration > 0 else 0

    print(f"  Results:")
    print(f"    Sent:     {success} in {duration:.1f}s")
    print(f"    Failed:   {fail}")
    print(f"    Rate:     {rate} msg/s (target: {target_rate})")
    return {"name": "Sustained Load", "success": success, "fail": fail,
            "duration_ms": duration * 1000, "rate": rate}

# ─── Collect DB metrics ───
def collect_metrics():
    print()
    print("=" * 60)
    print("  DATABASE METRICS")
    print("=" * 60)

    db_path = "/home/xuranus/workspace/notifier/crates/data/notifyhub.db"
    if not os.path.exists(db_path):
        print("  DB not found")
        return

    import sqlite3
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    queries = [
        ("Messages total", "SELECT COUNT(*) FROM messages"),
        ("Messages queued", "SELECT COUNT(*) FROM messages WHERE status='queued'"),
        ("Messages sent", "SELECT COUNT(*) FROM messages WHERE status='sent'"),
        ("Messages delivered", "SELECT COUNT(*) FROM messages WHERE status='delivered'"),
        ("Messages failed", "SELECT COUNT(*) FROM messages WHERE status='failed'"),
        ("Messages dead", "SELECT COUNT(*) FROM messages WHERE status='dead'"),
        ("Push messages total", "SELECT COUNT(*) FROM push_messages"),
        ("Push undelivered", "SELECT COUNT(*) FROM push_messages WHERE delivered=0"),
        ("Push delivered", "SELECT COUNT(*) FROM push_messages WHERE delivered=1"),
        ("Push clients", "SELECT COUNT(*) FROM push_clients"),
    ]
    for label, sql in queries:
        try:
            c.execute(sql)
            val = c.fetchone()[0]
            print(f"    {label:.<30} {val}")
        except:
            print(f"    {label:.<30} N/A")

    # Check message processing latency (if sent_at is set)
    try:
        c.execute("""
            SELECT AVG(sent_at - created_at), MAX(sent_at - created_at), MIN(sent_at - created_at)
            FROM messages WHERE sent_at IS NOT NULL AND sent_at > 0
        """)
        row = c.fetchone()
        if row and row[0]:
            print(f"    Processing latency avg..... {row[0]:.1f}s")
            print(f"    Processing latency max..... {row[1]:.1f}s")
            print(f"    Processing latency min..... {row[2]:.1f}s")
    except:
        pass

    conn.close()

# ─── Collect listener stats ───
def collect_listener_stats():
    listen_log = os.path.expanduser("~/.notifyhub/listen.jsonl")
    if os.path.exists(listen_log):
        with open(listen_log) as f:
            count = sum(1 for _ in f)
        print(f"    Listener received......... {count} messages")
    else:
        print(f"    Listener log not found")

# ─── Server log tail ───
def show_server_log():
    print()
    print("  Server log (last 30 lines):")
    try:
        with open("/tmp/notifyhub-server.log") as f:
            lines = f.readlines()[-30:]
        for line in lines:
            print(f"    {line.rstrip()}")
    except:
        print("    (not available)")

# ─── Summary ───
def print_summary(results):
    print()
    print("=" * 60)
    print("  STRESS TEST SUMMARY")
    print("=" * 60)
    for r in results:
        print(f"  {r['name']:.<30} {r['success']} ok / {r['fail']} fail / "
              f"{r['duration_ms']:.0f}ms / {r['rate']} msg/s")

    total_success = sum(r['success'] for r in results)
    total_fail = sum(r['fail'] for r in results)
    print(f"  {'TOTAL':.<30} {total_success} ok / {total_fail} fail")
    print()

# ─── Main ───
def main():
    print("╔═══════════════════════════════════════════════════╗")
    print("║   NotifyHub Stress Test Suite                     ║")
    print("╚═══════════════════════════════════════════════════╝")

    # Clean old listen log
    listen_log = os.path.expanduser("~/.notifyhub/listen.jsonl")
    if os.path.exists(listen_log):
        os.remove(listen_log)

    token = get_token()

    results = []
    results.append(test_sequential_burst(token, 100))
    time.sleep(2)

    results.append(test_concurrent_burst(token, 200, 20))
    time.sleep(2)

    results.append(test_rapid_fire(token, 500, 30))
    time.sleep(3)

    results.append(test_sustained_load(token, 20, 50))
    time.sleep(5)

    collect_metrics()
    collect_listener_stats()
    show_server_log()
    print_summary(results)

if __name__ == "__main__":
    main()
