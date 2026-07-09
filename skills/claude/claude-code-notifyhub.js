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
const input = JSON.parse(fs.readFileSync(0, "utf-8") || "{}");
/**
 * Exapmple input:
 {
   "session_id":"226652c9-1c7b-42be-8ab1-ebe0b9711e78",
   "transcript_path":"/home/xuranus/.claude/projects/-home-xuranus-workspace-notifier/226652c9-1c7b-42be-8ab1-ebe0b9711e78.jsonl",
   "cwd":"/home/xuranus/workspace/notifier",
   "prompt_id":"3037111e-720f-4a27-a038-162b0b169056",
   "permission_mode":"bypassPermissions",
   "effort":{ "level":"high" },
   "hook_event_name":"Stop",
   "stop_hook_active":false,
   "last_assistant_message":"Committed bbd5ebd:\n\n- v1 topic list: preset topics now visible to all users (enables hook to fork them)\n- Desktop notifications: markdown/HTML stripped to plain text before display (tables, bold, code, links, headers, lists all converted)",
   "background_tasks":[],
   "session_crons":[]
 }
 */

// ===== Find or create topic =====
async function ensureTopic(sessionId) {
  const topicName = `claudecode_${sessionId}`;
  const topicDisplayName = `Claude Code ${sessionId.split('-')[0]}`
  const description = `Session ${sessionId}`

  // 1. Search if already exists
  const listRes = await api("GET", `/api/v1/topic?search=${encodeURIComponent(topicName)}`);
  if (listRes.success && listRes.data) {
    const found = listRes.data.find((t) => t.name === topicName);
    if (found) return found.name;
  }

  // 2. Not found — fork from claudecode preset
  const allRes = await api("GET", `/api/v1/topic?search=claudecode&limit=50`);
  let presetId = null;
  if (allRes.success && allRes.data) {
    const preset = allRes.data.find((t) => t.name === "claudecode" && t.preset);
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
const cwd = input.cwd || "";
const cwdDisplay = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
const project = path.basename(cwd || "");
const session = input.session_id || "unknown";
const lastAssistantMessage = input.last_assistant_message || ""
const hookEventName = input.hook_event_name || "unknown";

if (lastAssistantMessage == "") {
   console.error("[NotifyHub] last_assistant_message empty:", JSON.stringify(input));
   process.exit(0);
}

// ===== Build notification =====
let subject = "";
if (hookEventName === "Stop") {
  subject = `Claude Done | ${project}`;
} else if (hookEventName === "Notification") {
  subject = `Claude Reminder | ${project}`;
} else {
  subject = `Claude Hook Event | ${hookEventName}`;
}

// Summary (no truncation)
const summary = lastAssistantMessage || "(empty)";

const body = [
  summary,
  "---",
  `📁 \`${cwdDisplay}\``,
].join("\n");

// ===== Main =====
(async () => {
  try {
    const topicName = await ensureTopic(session);

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
