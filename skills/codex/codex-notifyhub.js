#!/usr/bin/env node
/**
 * NotifyHub hook script for OpenAI Codex CLI
 *
 * Codex hooks are shell commands configured in ~/.codex/config.json (or .yaml).
 * They receive JSON via stdin with the following structure:
 *
 * {
 *   "session_id": "uuid",
 *   "hook_event": "task_complete" | "task_start" | "task_error" | "message" | "tool_call",
 *   "task_id": "uuid",
 *   "prompt": "user's prompt",
 *   "response": "agent's response (on task_complete)",
 *   "error": "error message (on task_error)",
 *   "tool_name": "tool name (on tool_call)",
 *   "cwd": "/current/working/directory"
 * }
 *
 * Env vars available:
 *   CODEX_SESSION_ID, CODEX_HOOK_EVENT, CODEX_HOOK_DATA
 *
 * Config example (~/.codex/config.json):
 * {
 *   "hooks": {
 *     "on_task_complete": "node /path/to/codex-notifyhub.js",
 *     "on_task_error": "node /path/to/codex-notifyhub.js"
 *   }
 * }
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// ===== Config (from env vars) =====
const BASE = process.env.NOTIFYHUB_BASE;
const KEY = process.env.NOTIFYHUB_KEY;

if (!BASE || !KEY) {
  console.error("[NotifyHub] Missing env vars NOTIFYHUB_BASE or NOTIFYHUB_KEY");
  process.exit(1);
}

const API = BASE.replace(/\/+$/, "");

// ===== API helper =====
async function api(method, endpoint, body) {
  const url = `${API}${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

// ===== Read hook input =====
let rawInput = "";
try {
  rawInput = fs.readFileSync(0, "utf-8") || "{}";
} catch {
  rawInput = "{}";
}

let input = {};
try {
  input = JSON.parse(rawInput);
} catch {
  input = {};
}

// Fallback to env vars if stdin is empty
const sessionId = input.session_id || process.env.CODEX_SESSION_ID || "unknown";
const hookEvent = input.hook_event || process.env.CODEX_HOOK_EVENT || "unknown";
const cwd = input.cwd || process.cwd();

// ===== Find or create topic =====
async function ensureTopic(sessionId) {
  const topicName = `codex_${sessionId}`;
  const topicDisplayName = `Codex ${sessionId.split("-")[0]}`;
  const description = `Codex session ${sessionId}`;

  // 1. Search if already exists
  const listRes = await api("GET", `/api/v1/topic?search=${encodeURIComponent(topicName)}`);
  if (listRes.success && listRes.data) {
    const found = listRes.data.find((t) => t.name === topicName);
    if (found) return found.name;
  }

  // 2. Not found — fork from codex preset
  const allRes = await api("GET", `/api/v1/topic?search=codex&limit=50`);
  let presetId = null;
  if (allRes.success && allRes.data) {
    const preset = allRes.data.find((t) => t.name === "codex" && t.preset);
    if (preset) presetId = preset.id;
  }

  const createBody = { name: topicName, displayName: topicDisplayName, description };
  if (presetId) {
    createBody.forkFrom = presetId;
  }

  const createRes = await api("POST", "/api/v1/topic", createBody);
  if (!createRes.success) {
    throw new Error(`Failed to create topic: ${createRes.error}`);
  }

  return topicName;
}

// ===== Basic info =====
const home = os.homedir();
const cwdDisplay = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
const project = path.basename(cwd || "");

// Only notify on meaningful events
const NOTIFY_EVENTS = ["task_complete", "task_error"];
if (!NOTIFY_EVENTS.includes(hookEvent)) {
  process.exit(0);
}

// ===== Build notification =====
let subject = "";
let body = "";

if (hookEvent === "task_complete") {
  subject = `Codex Done | ${project}`;
  body = input.response || "(empty)";
} else if (hookEvent === "task_error") {
  subject = `Codex Error | ${project}`;
  body = input.error || "(unknown error)";
} else {
  subject = `Codex Event | ${hookEvent}`;
  body = input.prompt || "(empty)";
}

// ===== Main =====
(async () => {
  try {
    const topicName = await ensureTopic(sessionId);

    const sendRes = await api("POST", "/api/v1/send", {
      channel: "push",
      to: "*",
      format: "markdown",
      subject,
      body,
      topic: topicName,
    });

    console.log(`[NotifyHub] Sent to topic=${topicName}`, JSON.stringify(sendRes));
  } catch (err) {
    console.error("[NotifyHub] Error:", err.message || err);
    process.exit(1);
  }
})();
