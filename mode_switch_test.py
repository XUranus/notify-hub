#!/usr/bin/env python3
"""NotifyHub Mode Switch Test: Verify clean transitions between Poll/SSE/WS"""

import requests
import time
import json
import os
import subprocess
import signal
import re

SERVER = "http://localhost:3000"
CLI_BIN = "/home/xuranus/workspace/notifier/crates/target/release/notifyhub-cli"
DB_PATH = "/home/xuranus/workspace/notifier/crates/data/notifyhub.db"
LOG_DIR = "/tmp/notifyhub-mode-switch"
os.makedirs(LOG_DIR, exist_ok=True)


def get_token():
    resp = requests.post(f"{SERVER}/api/auth/login", json={
        "emailOrUsername": "admin@notifyhub.local", "password": "admin123"
    }, timeout=10)
    return resp.json()["data"]["token"]


def send_message(token, title, body):
    try:
        resp = requests.post(f"{SERVER}/api/v1/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"channel": "push", "to": "*", "subject": title,
                  "body": body, "tags": ["switch"], "priority": 0, "format": "text"},
            timeout=10)
        return resp.json().get("success", False)
    except:
        return False


def count_received(log_file):
    try:
        with open(log_file) as f:
            return sum(1 for line in f if line.strip().startswith("["))
    except:
        return 0


def start_listener(mode, uuid, log_file):
    proc = subprocess.Popen(
        [CLI_BIN, "listen", f"--{mode}"],
        stdout=open(log_file, "w"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    return proc


def stop_listener(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
        try:
            proc.wait(timeout=3)
        except:
            pass
    time.sleep(1)


def wait_for_connection(log_file, mode="sse", timeout=15):
    """Wait until listener is ready"""
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            with open(log_file) as f:
                content = f.read()
                # SSE/WS show "Connected", Poll just starts working
                if "Connected" in content or "Handshake" in content:
                    return True
                # For poll mode: check if header is printed (Mode: poll)
                if mode == "poll" and "Mode:" in content and "Ctrl+C" in content:
                    # Give it a moment to start polling
                    time.sleep(2)
                    return True
        except:
            pass
        time.sleep(0.5)
    return False


def run_switch_test(from_mode, to_mode, uuid, token):
    """Test switching from one mode to another"""
    print(f"\n  [{from_mode.upper()} → {to_mode.upper()}] Mode Switch Test")

    results = {"from": from_mode, "to": to_mode, "phases": []}

    # Phase 1: Start in from_mode
    log1 = os.path.join(LOG_DIR, f"switch_{from_mode}_{to_mode}_p1.log")
    if os.path.exists(log1):
        os.remove(log1)

    proc = start_listener(from_mode, uuid, log1)
    connected = wait_for_connection(log1, from_mode)
    if not connected:
        print(f"    FAIL: {from_mode} didn't connect")
        stop_listener(proc)
        return False

    # Send messages in from_mode (poll needs longer wait due to 5s interval)
    wait_time = 8 if from_mode == "poll" else 4
    for i in range(3):
        send_message(token, f"{from_mode}#{i}", f"Message in {from_mode} mode {i}")
    time.sleep(wait_time)
    p1_count = count_received(log1)
    print(f"    Phase 1 ({from_mode}): sent 3, received {p1_count} {'OK' if p1_count >= 2 else 'LOW'}")

    # Phase 2: Switch to to_mode
    stop_listener(proc)
    time.sleep(2)

    log2 = os.path.join(LOG_DIR, f"switch_{from_mode}_{to_mode}_p2.log")
    if os.path.exists(log2):
        os.remove(log2)

    proc = start_listener(to_mode, uuid, log2)
    connected = wait_for_connection(log2, to_mode)
    if not connected:
        print(f"    FAIL: {to_mode} didn't connect after switch")
        stop_listener(proc)
        return False

    # Send messages in to_mode
    wait_time = 8 if to_mode == "poll" else 4
    for i in range(3):
        send_message(token, f"{to_mode}#{i}", f"Message in {to_mode} mode {i}")
    time.sleep(wait_time)
    p2_count = count_received(log2)
    print(f"    Phase 2 ({to_mode}): sent 3, received {p2_count} {'OK' if p2_count >= 2 else 'LOW'}")

    # Phase 3: Switch back to from_mode
    stop_listener(proc)
    time.sleep(2)

    log3 = os.path.join(LOG_DIR, f"switch_{from_mode}_{to_mode}_p3.log")
    if os.path.exists(log3):
        os.remove(log3)

    proc = start_listener(from_mode, uuid, log3)
    connected = wait_for_connection(log3, from_mode)
    if not connected:
        print(f"    FAIL: {from_mode} didn't connect on switchback")
        stop_listener(proc)
        return False

    wait_time = 8 if from_mode == "poll" else 4
    for i in range(3):
        send_message(token, f"{from_mode}-back#{i}", f"Switchback in {from_mode} mode {i}")
    time.sleep(wait_time)
    p3_count = count_received(log3)
    print(f"    Phase 3 ({from_mode} again): sent 3, received {p3_count} {'OK' if p3_count >= 2 else 'LOW'}")

    stop_listener(proc)

    success = p1_count >= 2 and p2_count >= 2 and p3_count >= 2
    print(f"    Result: {'PASS' if success else 'FAIL'}")
    return success


def run_rapid_switch_test(uuid, token):
    """Rapidly cycle through all modes"""
    print(f"\n  [RAPID CYCLE] SSE → Poll → WS → SSE → Poll → WS")
    modes = ["sse", "poll", "ws", "sse", "poll", "ws"]
    results = []

    for i, mode in enumerate(modes):
        log_file = os.path.join(LOG_DIR, f"rapid_cycle_{i}_{mode}.log")
        if os.path.exists(log_file):
            os.remove(log_file)

        proc = start_listener(mode, uuid, log_file)
        connected = wait_for_connection(log_file, mode, timeout=10)

        if connected:
            send_message(token, f"Cycle{i}", f"Rapid cycle message {i} in {mode}")
            wait = 8 if mode == "poll" else 3
            time.sleep(wait)
            received = count_received(log_file)
            results.append((mode, received > 0, received))
            status = "OK" if received > 0 else "MISS"
            print(f"    Cycle {i+1} ({mode}): connected=Yes, received={received} {status}")
        else:
            results.append((mode, False, 0))
            print(f"    Cycle {i+1} ({mode}): connected=No FAIL")

        stop_listener(proc)
        time.sleep(1)

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"    Result: {passed}/{total} cycles received messages")
    return passed >= total - 1  # Allow 1 miss


def run_overlap_test(uuid, token):
    """Test: old listener still running when new one starts"""
    print(f"\n  [OVERLAP] Start new listener while old is still active")

    log1 = os.path.join(LOG_DIR, "overlap_sse.log")
    log2 = os.path.join(LOG_DIR, "overlap_ws.log")
    for f in [log1, log2]:
        if os.path.exists(f):
            os.remove(f)

    # Start SSE listener
    proc1 = start_listener("sse", uuid, log1)
    wait_for_connection(log1, "sse")
    print(f"    SSE listener started (PID={proc1.pid})")

    # Start WS listener while SSE is still running (same UUID)
    proc2 = start_listener("ws", uuid, log2)
    wait_for_connection(log2, "ws")
    print(f"    WS listener started (PID={proc2.pid})")

    # Send messages - both should receive
    for i in range(5):
        send_message(token, f"Overlap#{i}", f"Overlap test {i}")
    time.sleep(5)

    sse_count = count_received(log1)
    ws_count = count_received(log2)
    print(f"    SSE received: {sse_count}")
    print(f"    WS received: {ws_count}")

    # Both should receive (they share the same broadcast channel)
    success = sse_count >= 3 and ws_count >= 3
    print(f"    Result: {'PASS' if success else 'FAIL'} (both should receive)")

    stop_listener(proc1)
    stop_listener(proc2)
    return success


def main():
    print("╔═══════════════════════════════════════════════════════╗")
    print("║   NotifyHub Mode Switch Test                          ║")
    print("╚═══════════════════════════════════════════════════════╝")

    token = get_token()

    # Register test client
    import uuid as uuid_mod
    test_uuid = str(uuid_mod.uuid4())
    requests.post(f"{SERVER}/api/v1/push/register",
        headers={"Authorization": f"Bearer {token}"},
        json={"uuid": test_uuid, "name": "switch-test", "os": "linux",
              "arch": "x86_64", "desktop": "cli", "appVersion": "0.1.0"},
        timeout=10)
    print(f"Registered client: {test_uuid}")

    # Update CLI config
    config_path = os.path.expanduser("~/.notifyhub.yaml")
    with open(config_path) as f:
        config = f.read()
    config = re.sub(r'^uuid:.*', f'uuid: {test_uuid}', config, flags=re.MULTILINE)
    with open(config_path, 'w') as f:
        f.write(config)

    # All mode pair transitions
    transitions = [
        ("sse", "poll"), ("sse", "ws"),
        ("poll", "sse"), ("poll", "ws"),
        ("ws", "sse"), ("ws", "poll"),
    ]

    results = {}

    # Test each transition
    for from_mode, to_mode in transitions:
        key = f"{from_mode}→{to_mode}"
        results[key] = run_switch_test(from_mode, to_mode, test_uuid, token)
        time.sleep(2)

    # Test rapid cycling
    results["rapid_cycle"] = run_rapid_switch_test(test_uuid, token)
    time.sleep(2)

    # Test overlap (two listeners same UUID)
    results["overlap"] = run_overlap_test(test_uuid, token)

    # Summary
    print(f"\n{'='*60}")
    print(f"  MODE SWITCH TEST SUMMARY")
    print(f"{'='*60}")
    print(f"  {'Transition':<20} {'Result':>8}")
    print(f"  {'─'*20} {'─'*8}")
    for key, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  {key:<20} {status:>8}")

    total = len(results)
    passed = sum(1 for v in results.values() if v)
    print(f"\n  Total: {passed}/{total} passed ({passed/total*100:.0f}%)")


if __name__ == "__main__":
    main()
