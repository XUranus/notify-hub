/**
 * NotifyHub hook for OpenClaw
 *
 * OpenClaw uses a hook system based on `@openclaw/sdk` with `defineHook()`.
 * Hooks are TypeScript files placed in the workspace `hooks/` directory.
 *
 * Installation:
 *   1. Copy this file to your OpenClaw workspace hooks/ directory
 *   2. Restart OpenClaw: `openclaw restart`
 *   3. Set env vars: NOTIFYHUB_BASE, NOTIFYHUB_KEY
 *
 * Hook trigger points (28 available):
 *   Agent: before_agent_start, agent_end, before_model_resolve, before_prompt_build, llm_input, llm_output, before_reset
 *   Message: message_received, before_dispatch, message_sending, message_sent
 *   Tool: before_tool_call, after_tool_call
 *   Session: session_start, session_end
 *   Gateway: gateway_start, gateway_stop
 */

import { defineHook } from "@openclaw/sdk";

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
  const topicName = `openclaw_${sessionId}`;
  const topicDisplayName = `OpenClaw ${sessionId.split("-")[0]}`;
  const description = `OpenClaw session ${sessionId}`;

  // 1. Search if already exists
  const listRes = await api("GET", `/api/v1/topic?search=${encodeURIComponent(topicName)}`);
  if (listRes.success && listRes.data) {
    const found = listRes.data.find((t: any) => t.name === topicName);
    if (found) return found.name;
  }

  // 2. Not found — fork from openclaw preset
  const allRes = await api("GET", `/api/v1/topic?search=openclaw&limit=50`);
  let presetId: string | null = null;
  if (allRes.success && allRes.data) {
    const preset = allRes.data.find((t: any) => t.name === "openclaw" && t.preset);
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

// ===== Hook: agent_end =====
// Fires when the agent finishes processing a request.
// This is the primary notification point — sends the agent's reply.
export default defineHook("agent_end", async (event, ctx) => {
  const sessionId = ctx.sessionId || "unknown";
  const reply = event.reply || "";
  const usage = event.usage || {};

  if (!reply) return; // Skip empty replies

  const project = "OpenClaw";
  const subject = `OpenClaw Done | ${project}`;

  // Include token usage summary
  const tokenInfo = usage.totalTokens
    ? `\n\n---\n_Tokens: ${usage.promptTokens || "?"} prompt + ${usage.completionTokens || "?"} completion = ${usage.totalTokens || "?"} total_`
    : "";

  const body = reply + tokenInfo;

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

// ===== Optional: session_end hook =====
// Can be enabled to notify when a session ends
/*
defineHook("session_end", async (event, ctx) => {
  const sessionId = ctx.sessionId || "unknown";
  try {
    const topicName = await ensureTopic(sessionId);
    await api("POST", "/api/v1/send", {
      channel: "push",
      to: "*",
      format: "markdown",
      subject: "OpenClaw Session Ended",
      body: `Session \`${sessionId}\` has ended.`,
      topic: topicName,
    });
  } catch (err: any) {
    console.error("[NotifyHub] Error:", err.message || err);
  }
});
*/
