#!/usr/bin/env python3
"""NotifyHub Fault Injection Test Suite: SSE / Poll / WS recovery"""

import requests
import time
import json
import sys
import os
import subprocess
import signal
import sqlite3
import threading
import socket

SERVER = "http://localhost:3000"
CLI_BIN = "/home/xuranus/workspace/notifier/crates/target/release/notifyhub-cli"
DB_PATH = "/home/xuranus/workspace/notifier/crates/data/notifyhub.db"
LOG_DIR = "/tmp/notifyhub-fault-test"
os.makedirs(LOG_DIR, exist_ok=True)

# ─── Helpers ───

def get_token():
    resp = requests.post(f"{SERVER}/api/auth/login", json={
        "emailOrUsername": "admin@notifyhub.local", "password": "admin123"
    }, timeout=10)
    return resp.json()["data"]["token"]


def send_message(token, title, body, to="*"):
    try:
        resp = requests.post(f"{SERVER}/api/v1/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"channel": "push", "to": to, "subject": title,
                  "body": body, "tags": ["fault"], "priority": 0, "format": "text"},
            timeout=10)
        return resp.json().get("success", False)
    except:
        return False


def send_batch(token, count, label="msg"):
    for i in range(count):
        send_message(token, f"{label}#{i}", f"Fault test message {i}")
    return count


def start_listener(mode, uuid, log_file):
    proc = subprocess.Popen(
        [CLI_BIN, "listen", f"--{mode}"],
        stdout=open(log_file, "w"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    return proc


def count_received(log_file):
    try:
        with open(log_file) as f:
            return sum(1 for line in f if line.strip().startswith("["))
    except:
        return 0


def wait_for_messages(log_file, target, timeout=60):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        count = count_received(log_file)
        if count >= target:
            return True, time.monotonic() - start
        time.sleep(1)
    return False, time.monotonic() - start


def kill_server():
    """Kill the notifyhub-server process by PID"""
    try:
        result = subprocess.run(["pgrep", "-f", "target/release/notifyhub-server"],
                              capture_output=True, text=True, timeout=5)
        for pid in result.stdout.strip().split('\n'):
            if pid.strip():
                os.kill(int(pid.strip()), signal.SIGTERM)
        time.sleep(2)
        # Verify
        result = subprocess.run(["pgrep", "-f", "target/release/notifyhub-server"],
                              capture_output=True, text=True, timeout=5)
        return result.stdout.strip() == ""
    except:
        return False


def start_server():
    """Start the server"""
    env = os.environ.copy()
    env["JWT_SECRET"] = "notifyhub-fixed-secret-key-2026"
    proc = subprocess.Popen(
        ["/home/xuranus/workspace/notifier/crates/target/release/notifyhub-server"],
        stdout=open("/tmp/notifyhub-server.log", "w"),
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    time.sleep(3)
    return proc.poll() is None


def wait_for_server(timeout=30):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            resp = requests.post(f"{SERVER}/api/auth/login",
                json={"emailOrUsername": "admin@notifyhub.local", "password": "admin123"},
                timeout=3)
            if resp.status_code == 200:
                return True
        except:
            pass
        time.sleep(1)
    return False


def block_port(port, duration):
    """Block a port using iptables (requires sudo)"""
    try:
        subprocess.run(["sudo", "iptables", "-A", "OUTPUT", "-p", "tcp",
                       "--dport", str(port), "-j", "DROP"], capture_output=True, timeout=5)
        time.sleep(duration)
        subprocess.run(["sudo", "iptables", "-D", "OUTPUT", "-p", "tcp",
                       "--dport", str(port), "-j", "DROP"], capture_output=True, timeout=5)
        return True
    except:
        return False


def inject_latency(port, delay_ms):
    """Add network latency using tc (requires sudo)"""
    try:
        subprocess.run(["sudo", "tc", "qdisc", "add", "dev", "lo", "root",
                       "netem", "delay", f"{delay_ms}ms"], capture_output=True, timeout=5)
        return True
    except:
        return False


def clear_latency():
    try:
        subprocess.run(["sudo", "tc", "qdisc", "del", "dev", "lo", "root"],
                      capture_output=True, timeout=5)
    except:
        pass


# ─── Test Cases ───

def test_server_restart(mode, uuid, token):
    """Test: Server restart while client is connected"""
    print(f"\n  [{mode.upper()}] Test: Server Restart Recovery")
    log_file = os.path.join(LOG_DIR, f"restart_{mode}.log")
    if os.path.exists(log_file):
        os.remove(log_file)

    # Start listener
    proc = start_listener(mode, uuid, log_file)
    time.sleep(5)

    # Send initial messages
    send_batch(token, 5, "pre-restart")
    time.sleep(3)
    pre_count = count_received(log_file)
    print(f"    Pre-restart: sent 5, received {pre_count}")

    # Kill server
    print(f"    Killing server...")
    kill_server()
    time.sleep(3)

    # Restart server
    print(f"    Restarting server...")
    start_server()
    time.sleep(3)

    if not wait_for_server():
        print(f"    FAIL: Server didn't restart")
        proc.terminate()
        return False

    # Re-login to get fresh token
    token = get_token()

    # Send post-restart messages
    send_batch(token, 5, "post-restart")
    time.sleep(5)

    post_count = count_received(log_file)
    recovered = post_count > pre_count
    print(f"    Post-restart: received {post_count} total (new: {post_count - pre_count})")
    print(f"    Recovery: {'PASS' if recovered else 'FAIL'}")

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
    return recovered


def test_jwt_expiry(mode, uuid):
    """Test: JWT token expires, client should re-login"""
    print(f"\n  [{mode.upper()}] Test: JWT Expiry Recovery")
    log_file = os.path.join(LOG_DIR, f"jwt_{mode}.log")
    if os.path.exists(log_file):
        os.remove(log_file)

    # Start listener (it will login automatically)
    proc = start_listener(mode, uuid, log_file)
    time.sleep(5)

    # Send a message to verify it works
    token = get_token()
    send_message(token, "JWT test", "Before expiry")
    time.sleep(3)
    before = count_received(log_file)
    print(f"    Before JWT issue: received {before}")

    # Invalidate JWT by restarting the server
    print(f"    Restarting server (invalidates JWT)...")
    kill_server()
    time.sleep(2)
    start_server()
    time.sleep(3)

    if not wait_for_server():
        print(f"    FAIL: Server didn't restart")
        proc.terminate()
        return False

    # Send message after restart (listener should re-auth)
    token = get_token()
    send_message(token, "JWT test", "After restart")
    time.sleep(8)

    after = count_received(log_file)
    recovered = after > before
    print(f"    After JWT refresh: received {after} total (new: {after - before})")
    print(f"    Recovery: {'PASS' if recovered else 'FAIL'}")

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
    return recovered


def test_listener_restart_recovery(mode, uuid, token):
    """Test: Listener disconnects and reconnects, should get missed messages"""
    print(f"\n  [{mode.upper()}] Test: Listener Reconnect Message Recovery")
    log_file = os.path.join(LOG_DIR, f"reconnect_{mode}.log")
    if os.path.exists(log_file):
        os.remove(log_file)

    # Phase 1: Start listener, send messages, stop listener
    proc = start_listener(mode, uuid, log_file)
    time.sleep(5)

    send_batch(token, 5, "phase1")
    time.sleep(3)
    phase1 = count_received(log_file)
    print(f"    Phase 1: sent 5, received {phase1}")

    # Stop listener
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
    time.sleep(2)

    # Phase 2: Send messages while listener is offline
    send_batch(token, 5, "offline")
    time.sleep(2)
    print(f"    Offline: sent 5 messages (no listener)")

    # Phase 3: Restart listener
    log_file2 = os.path.join(LOG_DIR, f"reconnect2_{mode}.log")
    proc2 = start_listener(mode, uuid, log_file2)
    time.sleep(8)

    phase3 = count_received(log_file2)
    # For SSE/WS: should get the offline messages via initial batch
    # For Poll: will get them on next poll cycle
    recovered = phase3 > 0
    print(f"    Phase 3: received {phase3} messages after reconnect")
    print(f"    Recovery: {'PASS' if recovered else 'FAIL'}")

    proc2.terminate()
    try:
        proc2.wait(timeout=5)
    except:
        proc2.kill()
    return recovered


def test_high_frequency_reconnect(mode, uuid, token):
    """Test: Rapid disconnect/reconnect cycles"""
    print(f"\n  [{mode.upper()}] Test: Rapid Reconnect Cycles")
    log_file = os.path.join(LOG_DIR, f"rapid_{mode}.log")
    if os.path.exists(log_file):
        os.remove(log_file)

    success_count = 0
    total_cycles = 5

    for cycle in range(total_cycles):
        log_f = os.path.join(LOG_DIR, f"rapid_{mode}_{cycle}.log")
        if os.path.exists(log_f):
            os.remove(log_f)

        # Connect
        proc = start_listener(mode, uuid, log_f)
        time.sleep(3)

        # Send a message
        send_message(token, f"Cycle {cycle}", f"Rapid reconnect test {cycle}")
        time.sleep(2)

        received = count_received(log_f)
        if received > 0:
            success_count += 1

        # Disconnect
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except:
            proc.kill()
        time.sleep(1)

    print(f"    Cycles: {total_cycles}, successful: {success_count}")
    print(f"    Recovery: {'PASS' if success_count >= total_cycles - 1 else 'FAIL'}")
    return success_count >= total_cycles - 1


def test_message_durability(mode, uuid, token):
    """Test: Messages sent while offline are delivered on reconnect"""
    print(f"\n  [{mode.upper()}] Test: Message Durability (Offline Delivery)")
    log_file = os.path.join(LOG_DIR, f"durable_{mode}.log")
    if os.path.exists(log_file):
        os.remove(log_file)

    # Kill any leftover CLI listeners by PID
    try:
        result = subprocess.run(["pgrep", "-f", "notifyhub-cli listen"],
                              capture_output=True, text=True, timeout=5)
        for pid in result.stdout.strip().split('\n'):
            if pid.strip():
                os.kill(int(pid.strip()), signal.SIGTERM)
    except:
        pass
    time.sleep(2)

    # Send messages while no listener
    send_batch(token, 10, "offline-durable")
    time.sleep(2)
    print(f"    Sent 10 messages while offline")

    # Start listener
    proc = start_listener(mode, uuid, log_file)
    time.sleep(10)

    received = count_received(log_file)
    print(f"    Received {received}/10 messages after reconnect")
    print(f"    Durability: {'PASS' if received >= 8 else 'FAIL'} (allowing 20% loss)")

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
    return received >= 8


def test_concurrent_senders(mode, uuid, token):
    """Test: Multiple senders while listener is active"""
    print(f"\n  [{mode.upper()}] Test: Concurrent Senders (20 threads)")
    log_file = os.path.join(LOG_DIR, f"concurrent_{mode}.log")
    if os.path.exists(log_file):
        os.remove(log_file)

    # Start listener
    proc = start_listener(mode, uuid, log_file)
    time.sleep(5)

    # Send 100 messages from 20 threads
    total = 100
    def send_task(start, count):
        t = get_token()
        for i in range(count):
            send_message(t, f"Concurrent#{start+i}", f"Thread test {start+i}")

    threads = []
    per_thread = total // 20
    for i in range(20):
        t = threading.Thread(target=send_task, args=(i * per_thread, per_thread))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    print(f"    Sent {total} messages from 20 threads")
    time.sleep(10)

    received = count_received(log_file)
    ratio = received / total * 100
    print(f"    Received {received}/{total} ({ratio:.0f}%)")
    print(f"    Recovery: {'PASS' if ratio >= 80 else 'FAIL'}")

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
    return ratio >= 80


def test_large_message(mode, uuid, token):
    """Test: Large message body delivery"""
    print(f"\n  [{mode.upper()}] Test: Large Message (10KB body)")
    log_file = os.path.join(LOG_DIR, f"large_{mode}.log")
    if os.path.exists(log_file):
        os.remove(log_file)

    proc = start_listener(mode, uuid, log_file)
    time.sleep(5)

    # Send a large message
    large_body = "X" * 10240  # 10KB
    send_message(token, "Large message test", large_body)
    time.sleep(5)

    received = count_received(log_file)
    print(f"    Received: {received}")
    print(f"    Recovery: {'PASS' if received > 0 else 'FAIL'}")

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
    return received > 0


# ─── Main ───

def main():
    print("╔═══════════════════════════════════════════════════════╗")
    print("║   NotifyHub Fault Injection Test Suite                ║")
    print("╚═══════════════════════════════════════════════════════╝")

    token = get_token()

    # Register a test client
    import uuid as uuid_mod
    test_uuid = str(uuid_mod.uuid4())
    resp = requests.post(f"{SERVER}/api/v1/push/register",
        headers={"Authorization": f"Bearer {token}"},
        json={"uuid": test_uuid, "name": "fault-test", "os": "linux",
              "arch": "x86_64", "desktop": "cli", "appVersion": "0.1.0"},
        timeout=10)
    print(f"Registered client: {test_uuid}")

    # Update CLI config
    config_path = os.path.expanduser("~/.notifyhub.yaml")
    with open(config_path) as f:
        config = f.read()
    import re
    config = re.sub(r'^uuid:.*', f'uuid: {test_uuid}', config, flags=re.MULTILINE)
    with open(config_path, 'w') as f:
        f.write(config)

    results = {}

    for mode in ["sse", "poll", "ws"]:
        print(f"\n{'='*60}")
        print(f"  MODE: {mode.upper()}")
        print(f"{'='*60}")

        mode_results = {}

        # Test 1: Server restart
        mode_results["server_restart"] = test_server_restart(mode, test_uuid, token)
        token = get_token()  # Refresh token after restart

        # Test 2: JWT expiry
        mode_results["jwt_expiry"] = test_jwt_expiry(mode, test_uuid)
        token = get_token()

        # Test 3: Listener reconnect recovery
        mode_results["reconnect"] = test_listener_restart_recovery(mode, test_uuid, token)

        # Test 4: Rapid reconnect
        mode_results["rapid_reconnect"] = test_high_frequency_reconnect(mode, test_uuid, token)

        # Test 5: Message durability
        mode_results["durability"] = test_message_durability(mode, test_uuid, token)

        # Test 6: Concurrent senders
        mode_results["concurrent"] = test_concurrent_senders(mode, test_uuid, token)

        # Test 7: Large message
        mode_results["large_message"] = test_large_message(mode, test_uuid, token)

        results[mode] = mode_results

    # Summary
    print(f"\n{'='*70}")
    print(f"  FAULT TEST SUMMARY")
    print(f"{'='*70}")

    tests = ["server_restart", "jwt_expiry", "reconnect", "rapid_reconnect",
             "durability", "concurrent", "large_message"]
    test_labels = {
        "server_restart": "Server Restart",
        "jwt_expiry": "JWT Expiry",
        "reconnect": "Reconnect Recovery",
        "rapid_reconnect": "Rapid Reconnect",
        "durability": "Offline Durability",
        "concurrent": "Concurrent Senders",
        "large_message": "Large Message",
    }

    print(f"  {'Test':<22} {'SSE':>6} {'Poll':>6} {'WS':>6}")
    print(f"  {'─'*22} {'─'*6} {'─'*6} {'─'*6}")
    for test in tests:
        label = test_labels.get(test, test)
        sse = "PASS" if results.get("sse", {}).get(test) else "FAIL"
        poll = "PASS" if results.get("poll", {}).get(test) else "FAIL"
        ws = "PASS" if results.get("ws", {}).get(test) else "FAIL"
        print(f"  {label:<22} {sse:>6} {poll:>6} {ws:>6}")

    # Count passes
    total = 0
    passed = 0
    for mode in results:
        for test in results[mode]:
            total += 1
            if results[mode][test]:
                passed += 1

    print(f"\n  Total: {passed}/{total} passed ({passed/total*100:.0f}%)")

    # Save results
    result_file = os.path.join(LOG_DIR, "fault_results.json")
    with open(result_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"  Results saved to {result_file}")


if __name__ == "__main__":
    main()
