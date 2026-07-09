/**
 * NotifyHub plugin for OpenCode (SST)
 *
 * OpenCode uses a plugin system based on `@opencode-ai/plugin` SDK.
 * Plugins are TypeScript/JavaScript files that export a plugin definition.
 *
 * Installation:
 *   1. Copy this file to your OpenCode plugins directory
 *   2. Add to ~/.config/opencode/config.json:
 *      {
 *        "plugin": ["./opencode-notifyhub.ts"]
 *      }
 *   3. Set env vars: NOTIFYHUB_BASE, NOTIFYHUB_KEY
 *
 * Events available:
 *   session.created, session.deleted, session.idle, session.status, session.error
 *   message.created, message.updated, message.removed
 *   tool.call
 *   permission.asked, permission.answered
 */

import { definePlugin } from "@opencode-ai/plugin";

const BASE = process.env.NOTIFYHUB_BASE;
const KEY = process.env.NOTIFYHUB_KEY;

if (!BASE || !KEY) {
  console.error("[NotifyHub] Missing env vars NOTIFYHUB_BASE or NOTIFYHUB_KEY");
}

const API = (BASE || "").replace(/\/+$/, "");

async function api(method: string, endpoint: string, body?: any) {
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

async function ensureTopic(sessionId: string): Promise<string> {
  const topicName = `opencode_${sessionId}`;
  const topicDisplayName = `OpenCode ${sessionId.split("-")[0]}`;
  const description = `OpenCode session ${sessionId}`;

  // 1. Search if already exists
  const listRes = await api("GET", `/api/v1/topic?search=${encodeURIComponent(topicName)}`);
  if (listRes.success && listRes.data) {
    const found = listRes.data.find((t: any) => t.name === topicName);
    if (found) return found.name;
  }

  // 2. Not found — fork from opencode preset
  const allRes = await api("GET", `/api/v1/topic?search=opencode&limit=50`);
  let presetId: string | null = null;
  if (allRes.success && allRes.data) {
    const preset = allRes.data.find((t: any) => t.name === "opencode" && t.preset);
    if (preset) presetId = preset.id;
  }

  const createBody: any = { name: topicName, displayName: topicDisplayName, description };
  if (presetId) {
    createBody.forkFrom = presetId;
  }

  const createRes = await api("POST", "/api/v1/topic", createBody);
  if (!createRes.success) {
    throw new Error(`Failed to create topic: ${createRes.error}`);
  }

  return topicName;
}

export default definePlugin({
  name: "notifyhub",
  setup({ event }) {
    // Track session info
    const sessionMap = new Map<string, { cwd: string; sessionId: string }>();

    event.subscribe("session.created", async (data) => {
      const sessionId = data.id || "unknown";
      const cwd = data.cwd || process.cwd();
      sessionMap.set(data.id, { cwd, sessionId });
    });

    event.subscribe("session.status", async (data) => {
      const { id: sessionId, status } = data;
      const sessionInfo = sessionMap.get(sessionId);
      const cwd = sessionInfo?.cwd || process.cwd();
      const project = cwd.split("/").pop() || "unknown";

      if (status !== "idle" && status !== "completed" && status !== "error") {
        return;
      }

      // Get last assistant message from the session
      const lastMessage = data.lastAssistantMessage || data.lastMessage || "";

      let subject = "";
      if (status === "completed") {
        subject = `OpenCode Done | ${project}`;
      } else if (status === "error") {
        subject = `OpenCode Error | ${project}`;
      } else if (status === "idle") {
        subject = `OpenCode Idle | ${project}`;
      } else {
        return;
      }

      const body = lastMessage || "(empty)";

      try {
        const topicName = await ensureTopic(sessionId);
        await api("POST", "/api/v1/send", {
          channel: "push",
          to: "*",
          format: "markdown",
          subject,
          body,
          topic: topicName,
        });
        console.log(`[NotifyHub] Sent to topic=${topicName}`);
      } catch (err: any) {
        console.error("[NotifyHub] Error:", err.message || err);
      }
    });

    event.subscribe("session.error", async (data) => {
      const sessionId = data.id || "unknown";
      const sessionInfo = sessionMap.get(sessionId);
      const cwd = sessionInfo?.cwd || process.cwd();
      const project = cwd.split("/").pop() || "unknown";
      const errorMsg = data.error || "Unknown error";

      try {
        const topicName = await ensureTopic(sessionId);
        await api("POST", "/api/v1/send", {
          channel: "push",
          to: "*",
          format: "markdown",
          subject: `OpenCode Error | ${project}`,
          body: errorMsg,
          topic: topicName,
        });
      } catch (err: any) {
        console.error("[NotifyHub] Error:", err.message || err);
      }
    });

    // Clean up on session end
    event.subscribe("session.deleted", (data) => {
      sessionMap.delete(data.id);
    });
  },
});
