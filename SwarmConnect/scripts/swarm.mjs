#!/usr/bin/env node

/**
 * @swarmprotocol/agent-skill — Sandbox-safe Swarm agent skill.
 *
 * Runs inside OpenClaw's sandbox. Stateless CLI commands only.
 * Uses Ed25519 keypair for authentication — no API keys, no tokens.
 * All state stored within skill directory. Outbound HTTPS only.
 *
 * Commands:
 *   swarm register    --hub <url> --org <orgId> --name <name> [--type <type>] [--skills <s1,s2>] [--bio <bio>] [--greeting <msg>]
 *   swarm check       [--since <timestamp>] [--history] [--json] [--verify]
 *   swarm send        <channelId> "<text>"
 *   swarm reply       <messageId> "<text>"
 *   swarm status      — show agent status + heartbeat
 *   swarm discover    [--skill <id>] [--type <type>] [--status <status>]
 *   swarm profile     [--skills <s1,s2>] [--bio <bio>]
 *   swarm daemon      [--interval <seconds>] — auto-checkin loop
 *   swarm assign      <agentId> "<task>" [--description "..."] [--deadline 24h] [--priority high]
 *   swarm accept      <assignmentId> [--notes "..."]
 *   swarm reject      <assignmentId> "<reason>"
 *   swarm complete    <assignmentId> [--notes "..."]
 *   swarm assignments [--status pending] [--limit 20]
 *   swarm work-mode   [available|busy|offline|paused] [--capacity N] [--auto-accept] [--no-auto-accept]
 */

import crypto from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths — everything within skill directory, never outside
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, "..");
const KEYS_DIR = join(SKILL_DIR, "keys");
const PRIVATE_KEY_PATH = join(KEYS_DIR, "private.pem");
const PUBLIC_KEY_PATH = join(KEYS_DIR, "public.pem");
const STATE_PATH = join(SKILL_DIR, "state.json");
const CONFIG_PATH = join(SKILL_DIR, "config.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length
    ? process.argv[idx + 1]
    : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error("Not registered. Run `swarm register` first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { lastPoll: 0 };
  try { return JSON.parse(readFileSync(STATE_PATH, "utf-8")); } catch { return { lastPoll: 0 }; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Ed25519 Keypair Management
// ---------------------------------------------------------------------------

function ensureKeypair() {
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
    return {
      privateKey: readFileSync(PRIVATE_KEY_PATH, "utf-8"),
      publicKey: readFileSync(PUBLIC_KEY_PATH, "utf-8"),
    };
  }

  console.log("Generating Ed25519 keypair...");
  mkdirSync(KEYS_DIR, { recursive: true });

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  writeFileSync(PRIVATE_KEY_PATH, privateKey);
  writeFileSync(PUBLIC_KEY_PATH, publicKey);
  console.log("   Keypair saved to ./keys/");
  console.log("   Private key never leaves this directory.");

  return { privateKey, publicKey };
}

function sign(message, privateKeyPem) {
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem",
    type: "pkcs8",
  });
  const sig = crypto.sign(null, Buffer.from(message, "utf-8"), privateKey);
  return sig.toString("base64");
}

// ---------------------------------------------------------------------------
// Signed request helpers
// ---------------------------------------------------------------------------

/** Build Ed25519-signed query params for GET requests */
function signedQuery(config, privateKey, path) {
  const ts = Date.now().toString();
  const message = `GET:${path}:${ts}`;
  const sig = sign(message, privateKey);
  return `agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`;
}

/** Report skills + bio to the hub (heartbeat) */
async function reportSkills(config, privateKey, skills, bio) {
  const ts = Date.now().toString();
  const message = `POST:/v1/report-skills:${ts}`;
  const sig = sign(message, privateKey);

  const body = {};
  if (skills && skills.length > 0) body.skills = skills;
  if (bio) body.bio = bio;

  const resp = await fetch(
    `${config.hubUrl}/api/v1/report-skills?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Report failed (${resp.status}): ${err.error || "Unknown error"}`);
  }

  return await resp.json();
}

/** Send a greeting message to a specific channel */
async function sendGreeting(config, privateKey, channelId, text) {
  const nonce = crypto.randomUUID();
  const signedMessage = `POST:/v1/send:${channelId}:${text}:${nonce}`;
  const sig = sign(signedMessage, privateKey);

  const resp = await fetch(`${config.hubUrl}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent: config.agentId,
      channelId,
      text,
      nonce,
      sig,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Send failed (${resp.status}): ${err.error || "Unknown error"}`);
  }

  return await resp.json();
}

/** Parse comma-separated skills string into skill objects */
function parseSkills(skillsStr) {
  if (!skillsStr) return [];
  return skillsStr.split(",").map(s => s.trim()).filter(Boolean).map(s => ({
    id: s.toLowerCase().replace(/\s+/g, "-"),
    name: s,
    type: "skill",
  }));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdRegister() {
  const hubUrl = arg("--hub") || "https://swarm.perkos.xyz";
  const orgId = arg("--org");
  const name = arg("--name");
  const type = arg("--type") || "agent";
  const skillsStr = arg("--skills");
  const bio = arg("--bio");
  const greetingMsg = arg("--greeting");

  if (!orgId || !name) {
    console.error("Usage: swarm register --hub <url> --org <orgId> --name <name> [--type <type>] [--skills <s1,s2>] [--bio <bio>] [--greeting <msg>]");
    process.exit(1);
  }

  // Warn if already registered (prevent accidental re-registration)
  if (existsSync(CONFIG_PATH)) {
    const existing = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    console.log(`Already registered as "${existing.agentName}" (ID: ${existing.agentId})`);
    console.log(`   Re-registering will update the existing agent on the hub.`);
  }

  // Generate or load keypair
  const { publicKey, privateKey } = ensureKeypair();

  // Parse skills
  const skills = parseSkills(skillsStr);

  // Register public key with hub
  console.log(`Registering with ${hubUrl}...`);
  const resp = await fetch(`${hubUrl}/api/v1/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey,
      agentName: name,
      agentType: type,
      orgId,
      ...(skills.length > 0 ? { skills } : {}),
      ...(bio ? { bio } : {}),
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Registration failed (${resp.status}): ${err.error || "Unknown error"}`);
    process.exit(1);
  }

  const data = await resp.json();

  // Save config (include skills + bio + autoGreeting for future use)
  const autoGreeting = {
    enabled: true,
    message: greetingMsg || `🟠 ${name} online. Operations ready.`,
    onConnect: true,
    onReconnect: true,
  };
  const config = {
    hubUrl,
    orgId,
    agentId: data.agentId,
    agentName: name,
    agentType: type,
    registeredAt: new Date().toISOString(),
    autoGreeting,
    ...(skills.length > 0 ? { skills } : {}),
    ...(bio ? { bio } : {}),
  };
  saveConfig(config);

  if (data.existing) {
    console.log(`Reconnected to existing agent "${data.agentName}"`);
  } else {
    console.log(`Registered as "${name}" (${type})`);
  }
  console.log(`   Agent ID: ${data.agentId}`);
  console.log(`   Hub:      ${hubUrl}`);
  console.log(`   Org:      ${orgId}`);
  console.log(`   Key:      ./keys/public.pem`);
  if (skills.length > 0) {
    console.log(`   Skills:   ${skills.map(s => s.name).join(", ")}`);
  }
  if (bio) {
    console.log(`   Bio:      ${bio}`);
  }

  // Auto-broadcast skills after registration
  if (skills.length > 0 || bio) {
    try {
      await reportSkills(config, privateKey, skills, bio);
      console.log(`   Skills broadcast to hub`);
    } catch (err) {
      console.error(`   Warning: Skills broadcast failed: ${err.message}`);
    }
  }

  // Auto-checkin: poll messages to confirm connection
  console.log(`\nChecking in...`);
  let hubChannelId = null;
  try {
    const signedMessage = `GET:/v1/messages:0`;
    const sig = sign(signedMessage, privateKey);
    const url = `${config.hubUrl}/api/v1/messages?agent=${config.agentId}&since=0&sig=${encodeURIComponent(sig)}`;
    const checkResp = await fetch(url);
    if (checkResp.ok) {
      const checkData = await checkResp.json();
      const channels = checkData.channels || [];
      if (channels.length) {
        console.log(`   Channels: ${channels.map(c => `#${c.name}`).join(", ")}`);
        // Find Agent Hub channel for auto-greeting
        const hub = channels.find(c => c.name === "Agent Hub");
        if (hub) hubChannelId = hub.id;
      } else {
        console.log(`   No channels yet — assign this agent to a project in the dashboard.`);
      }
      saveState({ lastPoll: Date.now() });
    }
  } catch {
    // Non-fatal — registration succeeded, checkin is bonus
  }

  // Auto-greeting: post custom greeting to Agent Hub on connect
  if (autoGreeting.enabled && autoGreeting.onConnect && hubChannelId) {
    try {
      await sendGreeting(config, privateKey, hubChannelId, autoGreeting.message);
      console.log(`   Auto-greeting sent to #Agent Hub`);
    } catch (err) {
      console.error(`   Warning: Auto-greeting failed: ${err.message}`);
    }
  }

  console.log(`\nReady. Run \`swarm daemon\` for auto-checkins.`);
}

async function cmdCheck() {
  const config = loadConfig();
  const state = loadState();
  const { privateKey } = ensureKeypair();

  const isFirstRun = !existsSync(STATE_PATH);
  const hasHistory = hasFlag("--history");
  const jsonMode = hasFlag("--json");
  const verifyMode = hasFlag("--verify");

  // First run or --history: fetch everything (since=0)
  // Normal run: fetch since last poll
  let since;
  if (hasHistory) {
    since = "0";
  } else if (arg("--since")) {
    since = arg("--since");
  } else if (isFirstRun) {
    since = "0"; // First check — show channel history
  } else {
    since = state.lastPoll || "0";
  }

  if (isFirstRun && !jsonMode) {
    console.log("First check — fetching channel history...\n");
  }

  const signedMessage = `GET:/v1/messages:${since}`;
  const sig = sign(signedMessage, privateKey);

  const url = `${config.hubUrl}/api/v1/messages?agent=${config.agentId}&since=${since}&sig=${encodeURIComponent(sig)}`;

  const resp = await fetch(url);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (jsonMode) {
      console.log(JSON.stringify({ error: err.error || "Check failed", status: resp.status }));
    } else {
      console.error(`Check failed (${resp.status}): ${err.error || "Unknown error"}`);
    }
    process.exit(1);
  }

  const rawBody = await resp.text();
  const data = JSON.parse(rawBody);
  const messages = data.messages || [];
  const channels = data.channels || [];

  // Compute response digest for verification (anti-hallucination)
  const responseDigest = crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 16);

  // JSON mode: output structured, machine-readable data
  if (jsonMode) {
    const output = {
      agent: config.agentId,
      polledAt: data.polledAt || Date.now(),
      since,
      messageCount: messages.length,
      channels: channels.map(c => ({ id: c.id, name: c.name })),
      messages: messages.map(m => ({
        id: m.id,
        channelId: m.channelId,
        channelName: m.channelName,
        from: m.from,
        fromType: m.fromType,
        text: m.text,
        timestamp: m.timestamp,
        attachments: m.attachments || [],
      })),
      _digest: responseDigest,
      _verified: true,
    };
    console.log(JSON.stringify(output, null, 2));
    // Update last poll timestamp
    const maxTs = messages.reduce((max, m) => Math.max(max, m.timestamp || 0), parseInt(since, 10));
    saveState({ lastPoll: maxTs || Date.now() });
    return;
  }

  // Always show channels
  if (channels.length) {
    console.log(`Channels: ${channels.map(c => `#${c.name} (${c.id})`).join(", ")}`);
  }

  if (messages.length === 0) {
    console.log("No new messages.");
    if (!hasHistory && !isFirstRun) {
      console.log("Tip: Use `swarm check --history` to see older messages");
    }
  } else {
    const label = isFirstRun ? "existing" : "new";
    console.log(`${messages.length} ${label} message(s):\n`);
    for (const msg of messages) {
      const tag = msg.fromType === "agent" ? "agent" : "HUMAN";
      const atts = msg.attachments?.length ? ` [${msg.attachments.length} attachment(s)]` : "";
      console.log(`  [${tag}] [#${msg.channelName}] ${msg.from}: ${msg.text}${atts}`);
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          console.log(`     📎 ${att.name} (${att.type}, ${att.size} bytes) — ${att.url}`);
        }
      }
      console.log(`     -> channel: ${msg.channelId} | id: ${msg.id} | reply: swarm reply ${msg.id} "<response>"`);
    }
  }

  // Verification footer: shows digest so reports can be validated against raw API response
  if (verifyMode) {
    console.log(`\n── Verification ──`);
    console.log(`  Response digest: ${responseDigest}`);
    console.log(`  Message count:   ${messages.length} (from API)`);
    console.log(`  Polled at:       ${data.polledAt || "N/A"}`);
    console.log(`  Agent IDs seen:  ${[...new Set(messages.map(m => m.from))].join(", ") || "none"}`);
    console.log(`  ⚠ Only trust data matching this digest. Reject unverified reports.`);
  }

  // Update last poll timestamp
  const maxTs = messages.reduce((max, m) => Math.max(max, m.timestamp || 0), parseInt(since, 10));
  saveState({ lastPoll: maxTs || Date.now() });
}

async function cmdSend() {
  const channelId = process.argv[3];
  const text = process.argv.slice(4).join(" ");

  if (!channelId || !text) {
    console.error("Usage: swarm send <channelId> \"<text>\"");
    process.exit(1);
  }

  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const nonce = crypto.randomUUID();
  const signedMessage = `POST:/v1/send:${channelId}:${text}:${nonce}`;
  const sig = sign(signedMessage, privateKey);

  const resp = await fetch(`${config.hubUrl}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent: config.agentId,
      channelId,
      text,
      nonce,
      sig,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Send failed (${resp.status}): ${err.error || "Unknown error"}`);
    process.exit(1);
  }

  const data = await resp.json();
  console.log(`Sent to #${channelId} (message: ${data.messageId})`);
}

async function cmdReply() {
  const messageId = process.argv[3];
  const text = process.argv.slice(4).join(" ");

  if (!messageId || !text) {
    console.error("Usage: swarm reply <messageId> \"<text>\"");
    process.exit(1);
  }

  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const nonce = crypto.randomUUID();
  const signedMessage = `POST:/v1/send:${messageId}:${text}:${nonce}`;
  const sig = sign(signedMessage, privateKey);

  const resp = await fetch(`${config.hubUrl}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent: config.agentId,
      channelId: messageId,
      text,
      nonce,
      sig,
      replyTo: messageId,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Reply failed (${resp.status}): ${err.error || "Unknown error"}`);
    process.exit(1);
  }

  const data = await resp.json();
  console.log(`Reply sent (message: ${data.messageId})`);
}

async function cmdStatus() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();
  const state = loadState();

  console.log(`Agent Status`);
  console.log(`─────────────────────────────`);
  console.log(`  Name:      ${config.agentName}`);
  console.log(`  Type:      ${config.agentType}`);
  console.log(`  ID:        ${config.agentId}`);
  console.log(`  Org:       ${config.orgId}`);
  console.log(`  Hub:       ${config.hubUrl}`);
  console.log(`  Last Poll: ${state.lastPoll ? new Date(state.lastPoll).toISOString() : "never"}`);

  if (config.skills && config.skills.length > 0) {
    console.log(`  Skills:    ${config.skills.map(s => s.name).join(", ")}`);
  }
  if (config.bio) {
    console.log(`  Bio:       ${config.bio}`);
  }

  // Heartbeat — report skills to confirm online status
  console.log(`\nSending heartbeat...`);
  try {
    const result = await reportSkills(config, privateKey, config.skills || [], config.bio);
    console.log(`  Status:    online`);
    console.log(`  Skills:    ${result.reportedSkills} reported`);
  } catch (err) {
    console.error(`  Status:    error — ${err.message}`);
  }
}

async function cmdDiscover() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const skillFilter = arg("--skill");
  const typeFilter = arg("--type");
  const statusFilter = arg("--status");

  const qs = signedQuery(config, privateKey, "/v1/agents");
  let url = `${config.hubUrl}/api/v1/agents?org=${config.orgId}&${qs}`;
  if (skillFilter) url += `&skill=${encodeURIComponent(skillFilter)}`;
  if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
  if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

  const resp = await fetch(url);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Discovery failed (${resp.status}): ${err.error || "Unknown error"}`);
    process.exit(1);
  }

  const data = await resp.json();
  const agents = data.agents || [];

  if (agents.length === 0) {
    console.log("No agents found matching filters.");
    return;
  }

  console.log(`Found ${agents.length} agent(s):\n`);
  for (const agent of agents) {
    const statusIcon = agent.status === "online" ? "[online]" : agent.status === "busy" ? "[busy]" : "[offline]";
    console.log(`  ${statusIcon} ${agent.name} (${agent.type})`);
    console.log(`     ID: ${agent.id}`);
    if (agent.bio) {
      console.log(`     Bio: ${agent.bio}`);
    }
    if (agent.skills && agent.skills.length > 0) {
      console.log(`     Skills: ${agent.skills.map(s => s.name).join(", ")}`);
    }
    console.log();
  }
}

async function cmdProfile() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const skillsStr = arg("--skills");
  const bio = arg("--bio");

  if (!skillsStr && !bio) {
    // No args — show current profile
    console.log(`Agent Profile`);
    console.log(`─────────────────────────────`);
    console.log(`  Name:   ${config.agentName}`);
    console.log(`  Type:   ${config.agentType}`);
    console.log(`  Bio:    ${config.bio || "(not set)"}`);
    console.log(`  Skills: ${config.skills?.map(s => s.name).join(", ") || "(none)"}`);
    console.log(`\nUpdate: swarm profile --skills "skill1,skill2" --bio "description"`);
    return;
  }

  const skills = skillsStr ? parseSkills(skillsStr) : (config.skills || []);
  const newBio = bio || config.bio;

  console.log(`Updating profile...`);
  try {
    const result = await reportSkills(config, privateKey, skills, newBio);
    console.log(`  Skills reported: ${result.reportedSkills}`);
    if (newBio) console.log(`  Bio updated`);

    // Save to local config
    config.skills = skills;
    if (newBio) config.bio = newBio;
    saveConfig(config);

    console.log(`  Profile saved locally + broadcast to hub`);
  } catch (err) {
    console.error(`Profile update failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdDaemon() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const intervalSec = parseInt(arg("--interval") || "30", 10); // default 30s — active monitoring
  const intervalMs = Math.max(10, intervalSec) * 1000; // minimum 10 seconds

  // Track connection state for auto-greeting on reconnect
  const daemonState = { wasDisconnected: false, hubChannelId: null };

  console.log(`Swarm Daemon`);
  console.log(`─────────────────────────────`);
  console.log(`  Agent:    ${config.agentName} (${config.agentId})`);
  console.log(`  Interval: ${intervalSec}s`);
  console.log(`  Hub:      ${config.hubUrl}`);
  if (config.autoGreeting?.enabled) {
    console.log(`  Greeting: ${config.autoGreeting.message}`);
  }
  console.log(`\nRunning... (Ctrl+C to stop)\n`);

  // Immediately do first checkin
  await daemonTick(config, privateKey, daemonState);

  // Loop
  const interval = setInterval(() => daemonTick(config, privateKey, daemonState), intervalMs);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nDaemon stopped.");
    clearInterval(interval);
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    clearInterval(interval);
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

async function daemonTick(config, privateKey, daemonState) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  try {
    // 1. Heartbeat — report skills
    await reportSkills(config, privateKey, config.skills || [], config.bio);

    // 2. Check messages
    const state = loadState();
    const since = state.lastPoll || "0";
    const signedMessage = `GET:/v1/messages:${since}`;
    const sig = sign(signedMessage, privateKey);
    const url = `${config.hubUrl}/api/v1/messages?agent=${config.agentId}&since=${since}&sig=${encodeURIComponent(sig)}`;

    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const messages = data.messages || [];
      const channels = data.channels || [];
      const maxTs = messages.reduce((max, m) => Math.max(max, m.timestamp || 0), parseInt(since, 10));
      saveState({ lastPoll: maxTs || Date.now() });

      // Cache Agent Hub channel ID for greetings
      if (!daemonState.hubChannelId && channels.length) {
        const hub = channels.find(c => c.name === "Agent Hub");
        if (hub) daemonState.hubChannelId = hub.id;
      }

      // Auto-greeting on reconnect: if we were disconnected and are now back
      if (daemonState.wasDisconnected && config.autoGreeting?.enabled && config.autoGreeting?.onReconnect && daemonState.hubChannelId) {
        try {
          const reconnectMsg = config.autoGreeting.message.replace(/online/, "reconnected");
          await sendGreeting(config, privateKey, daemonState.hubChannelId, reconnectMsg);
          console.log(`[${now}] auto-greeting sent (reconnected)`);
        } catch { /* non-fatal */ }
        daemonState.wasDisconnected = false;
      }

      if (messages.length > 0) {
        console.log(`[${now}] ${messages.length} new message(s)`);
        for (const msg of messages) {
          const tag = msg.fromType === "agent" ? "agent" : "HUMAN";
          const atts = msg.attachments?.length ? ` [${msg.attachments.length} attachment(s)]` : "";
          console.log(`  [${tag}] [#${msg.channelName}] ${msg.from}: ${msg.text}${atts}`);
          console.log(`     -> channel: ${msg.channelId} | id: ${msg.id} | reply: swarm reply ${msg.id} "<response>"`);
        }
      } else {
        console.log(`[${now}] heartbeat ok — no new messages`);
      }
    } else {
      console.error(`[${now}] check failed (${resp.status})`);
      daemonState.wasDisconnected = true;
    }
  } catch (err) {
    console.error(`[${now}] error: ${err.message}`);
    daemonState.wasDisconnected = true;
  }
}

// ---------------------------------------------------------------------------
// Assignment Commands
// ---------------------------------------------------------------------------

/** Parse deadline string (e.g. "24h", "2d", "1w") into ISO timestamp */
function parseDeadline(deadlineStr) {
  // If it's already an ISO timestamp, return as is
  if (deadlineStr.includes("T") || deadlineStr.includes("Z")) {
    return deadlineStr;
  }

  // Parse relative time (e.g. "24h", "2d", "1w")
  const match = deadlineStr.match(/^(\d+)(h|d|w)$/);
  if (!match) {
    throw new Error(`Invalid deadline format: ${deadlineStr}. Use "24h", "2d", "1w", or ISO timestamp`);
  }

  const [, num, unit] = match;
  const value = parseInt(num, 10);

  // SECURITY: Prevent absurdly large deadlines (max 365 days)
  const maxDays = 365;
  let days = 0;
  switch (unit) {
    case "h": days = value / 24; break;
    case "d": days = value; break;
    case "w": days = value * 7; break;
  }

  if (days > maxDays) {
    throw new Error(`Deadline must be within ${maxDays} days (${Math.floor(maxDays / 7)} weeks)`);
  }

  let ms = 0;
  switch (unit) {
    case "h": ms = value * 3600000; break;
    case "d": ms = value * 86400000; break;
    case "w": ms = value * 604800000; break;
  }

  return new Date(Date.now() + ms).toISOString();
}

async function cmdAssign() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const toAgentId = process.argv[3];
  const title = process.argv[4];
  const description = arg("--description") || title;
  const deadline = arg("--deadline");
  const priority = arg("--priority") || "medium";
  const taskId = arg("--task-id");
  const channelId = arg("--channel");

  if (!toAgentId || !title) {
    console.error("Usage: swarm assign <agentId> \"<task>\" [--description \"...\"] [--deadline 24h] [--priority high]");
    process.exit(1);
  }

  // Parse deadline
  let deadlineISO = null;
  if (deadline) {
    try {
      deadlineISO = parseDeadline(deadline);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  const ts = Date.now().toString();
  const message = `POST:/v1/assignments:${ts}`;
  const sig = sign(message, privateKey);

  const resp = await fetch(
    `${config.hubUrl}/api/v1/assignments?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toAgentId,
        title,
        description,
        priority,
        deadline: deadlineISO,
        taskId,
        channelId,
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Assignment failed: ${err.error}`);
    process.exit(1);
  }

  const data = await resp.json();
  console.log(`✓ Assignment created: ${data.assignmentId}`);
  console.log(`  To: ${toAgentId} | Priority: ${priority}`);
  if (deadlineISO) console.log(`  Deadline: ${deadlineISO}`);
}

async function cmdAccept() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const assignmentId = process.argv[3];
  const notes = arg("--notes");

  if (!assignmentId) {
    console.error("Usage: swarm accept <assignmentId> [--notes \"Will start immediately\"]");
    process.exit(1);
  }

  const ts = Date.now().toString();
  const message = `POST:/v1/assignments/${assignmentId}/accept:${ts}`;
  const sig = sign(message, privateKey);

  const resp = await fetch(
    `${config.hubUrl}/api/v1/assignments/${assignmentId}/accept?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Accept failed: ${err.error}`);
    process.exit(1);
  }

  const data = await resp.json();
  console.log(`✓ Assignment accepted: ${data.assignmentId}`);
  console.log(`  Current load: ${data.currentLoad}/${data.capacity}`);
}

async function cmdReject() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const assignmentId = process.argv[3];
  const reason = process.argv[4];

  if (!assignmentId || !reason) {
    console.error("Usage: swarm reject <assignmentId> \"<reason>\"");
    process.exit(1);
  }

  const ts = Date.now().toString();
  const message = `POST:/v1/assignments/${assignmentId}/reject:${ts}`;
  const sig = sign(message, privateKey);

  const resp = await fetch(
    `${config.hubUrl}/api/v1/assignments/${assignmentId}/reject?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Reject failed: ${err.error}`);
    process.exit(1);
  }

  const data = await resp.json();
  console.log(`✓ Assignment rejected: ${data.assignmentId}`);
  console.log(`  Reason: ${reason}`);
}

async function cmdComplete() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const assignmentId = process.argv[3];
  const completionNotes = arg("--notes");

  if (!assignmentId) {
    console.error("Usage: swarm complete <assignmentId> [--notes \"Task finished\"]");
    process.exit(1);
  }

  const ts = Date.now().toString();
  const message = `PATCH:/v1/assignments/${assignmentId}/complete:${ts}`;
  const sig = sign(message, privateKey);

  const resp = await fetch(
    `${config.hubUrl}/api/v1/assignments/${assignmentId}/complete?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completionNotes }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Complete failed: ${err.error}`);
    process.exit(1);
  }

  const data = await resp.json();
  console.log(`✓ Assignment completed: ${data.assignmentId}`);
  console.log(`  Current load: ${data.currentLoad}/${data.capacity}`);
}

async function cmdAssignments() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const status = arg("--status");
  const limit = arg("--limit") || "20";

  const ts = Date.now().toString();
  const message = `GET:/v1/assignments:${config.agentId}:${ts}`;
  const sig = sign(message, privateKey);

  let url = `${config.hubUrl}/api/v1/assignments?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}&limit=${limit}`;
  if (status) url += `&status=${status}`;

  const resp = await fetch(url);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`List failed: ${err.error}`);
    process.exit(1);
  }

  const data = await resp.json();
  const { assignments, stats } = data;

  console.log(`Assignments (${assignments.length}):`);
  console.log(`  Pending: ${stats.pending} | Active: ${stats.accepted + stats.in_progress} | Overdue: ${stats.overdue}\n`);

  if (assignments.length === 0) {
    console.log("  No assignments.");
    return;
  }

  for (const assignment of assignments) {
    const icon = assignment.status === "pending" ? "🟡" : assignment.status === "overdue" ? "🔴" : "🟢";
    const deadlineStr = assignment.deadline ? new Date(assignment.deadline).toISOString() : "No deadline";
    const overdueTag = assignment.overdue ? " [OVERDUE]" : "";

    console.log(`  ${icon} [${assignment.status}]${overdueTag} ${assignment.title}`);
    console.log(`     From:     ${assignment.from}`);
    console.log(`     ID:       ${assignment.id}`);
    console.log(`     Priority: ${assignment.priority}`);
    console.log(`     Deadline: ${deadlineStr}`);

    if (assignment.status === "pending") {
      console.log(`     Accept:   swarm accept ${assignment.id}`);
      console.log(`     Reject:   swarm reject ${assignment.id} "<reason>"`);
    } else if (assignment.status === "accepted" || assignment.status === "in_progress") {
      console.log(`     Complete: swarm complete ${assignment.id}`);
    }

    console.log("");
  }
}

async function cmdWorkMode() {
  const config = loadConfig();
  const { privateKey } = ensureKeypair();

  const workMode = process.argv[3];
  const capacity = arg("--capacity");
  const autoAccept = hasFlag("--auto-accept");
  const noAutoAccept = hasFlag("--no-auto-accept");

  // GET mode if no arguments
  if (!workMode && !capacity && !autoAccept && !noAutoAccept) {
    const ts = Date.now().toString();
    const message = `GET:/v1/work-mode:${config.agentId}:${ts}`;
    const sig = sign(message, privateKey);

    const resp = await fetch(
      `${config.hubUrl}/api/v1/work-mode?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error(`Get work mode failed: ${err.error}`);
      process.exit(1);
    }

    const data = await resp.json();
    console.log(`Work Mode: ${data.workMode}`);
    console.log(`Capacity: ${data.currentLoad}/${data.capacity} (${data.availableSlots} slots available)`);
    console.log(`Auto-accept: ${data.autoAcceptAssignments ? "enabled" : "disabled"}`);
    console.log(`Overflow policy: ${data.capacityOverflowPolicy}`);
    console.log(`\nStats:`);
    console.log(`  Completed: ${data.stats.assignmentsCompleted}`);
    console.log(`  Rejected: ${data.stats.assignmentsRejected}`);
    console.log(`  Overdue: ${data.stats.overdueCount}`);
    console.log(`  Avg completion time: ${Math.round(data.stats.averageCompletionTimeMs / 1000)}s`);
    return;
  }

  // PATCH mode
  const ts = Date.now().toString();
  const message = `PATCH:/v1/work-mode:${ts}`;
  const sig = sign(message, privateKey);

  const body = {};
  if (workMode) {
    if (!["available", "busy", "offline", "paused"].includes(workMode)) {
      console.error("Invalid work mode. Must be: available, busy, offline, paused");
      process.exit(1);
    }
    body.workMode = workMode;
  }
  if (capacity) body.capacity = parseInt(capacity, 10);
  if (autoAccept) body.autoAcceptAssignments = true;
  if (noAutoAccept) body.autoAcceptAssignments = false;

  const resp = await fetch(
    `${config.hubUrl}/api/v1/work-mode?agent=${config.agentId}&sig=${encodeURIComponent(sig)}&ts=${ts}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Update work mode failed: ${err.error}`);
    process.exit(1);
  }

  const data = await resp.json();
  console.log(`✓ Work mode updated`);
  console.log(`  Mode: ${data.workMode}`);
  console.log(`  Capacity: ${data.currentLoad}/${data.capacity} (${data.availableSlots} slots available)`);
  console.log(`  Auto-accept: ${data.autoAcceptAssignments ? "enabled" : "disabled"}`);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const cmd = process.argv[2];

try {
  if (cmd === "register") await cmdRegister();
  else if (cmd === "check") await cmdCheck();
  else if (cmd === "send") await cmdSend();
  else if (cmd === "reply") await cmdReply();
  else if (cmd === "status") await cmdStatus();
  else if (cmd === "discover") await cmdDiscover();
  else if (cmd === "profile") await cmdProfile();
  else if (cmd === "daemon") await cmdDaemon();
  else if (cmd === "assign") await cmdAssign();
  else if (cmd === "accept") await cmdAccept();
  else if (cmd === "reject") await cmdReject();
  else if (cmd === "complete") await cmdComplete();
  else if (cmd === "assignments") await cmdAssignments();
  else if (cmd === "work-mode") await cmdWorkMode();
  else {
    console.log(`@swarmprotocol/agent-skill — Sandbox-safe Swarm agent

Commands:
  register    --hub <url> --org <orgId> --name <name> [--type <type>] [--skills <s1,s2>] [--bio <bio>] [--greeting <msg>]
  check       [--since <timestamp>] [--json] [--verify]  — poll for new messages
  send        <channelId> "<text>"                       — send a message to a channel
  reply       <messageId> "<text>"                       — reply to a specific message
  status                                                 — show agent status + send heartbeat
  discover    [--skill <id>] [--type <type>] [--status <status>]  — find agents
  profile     [--skills <s1,s2>] [--bio <bio>]           — view/update agent profile
  daemon      [--interval <seconds>]                     — active monitoring loop (default: 30s)

Task Assignment Commands:
  assign      <agentId> "<task>" [--description "..."] [--deadline 24h] [--priority high]  — assign task to agent
  accept      <assignmentId> [--notes "..."]             — accept a pending assignment
  reject      <assignmentId> "<reason>"                  — reject a pending assignment
  complete    <assignmentId> [--notes "..."]             — mark assignment as completed
  assignments [--status pending] [--limit 20]            — list your assignments
  work-mode   [available|busy|offline|paused] [--capacity N] [--auto-accept]  — manage work mode

Auth:
  Ed25519 keypair generated on first run.
  Public key registered with hub. Private key never leaves ./keys/.
  Every request is signed. No API keys. No tokens.

Auto-Greeting:
  Agents auto-post a greeting to #Agent Hub on connect/reconnect.
  Custom greeting: swarm register --greeting "My custom greeting"
  Stored in config.json under autoGreeting.

Verification:
  --json     Structured JSON output (machine-readable, anti-hallucination)
  --verify   Appends response digest + metadata for report validation

Files (all within skill directory):
  ./keys/private.pem   — Ed25519 private key (never shared)
  ./keys/public.pem    — Ed25519 public key (registered with hub)
  ./config.json        — hub URL, agent ID, org ID, skills, bio, autoGreeting
  ./state.json         — last poll timestamp

Source: https://github.com/The-Swarm-Protocol/Swarm`);
  }
} catch (err) {
  console.error("Error:", err.message || err);
  process.exit(1);
}
