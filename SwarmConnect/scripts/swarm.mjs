#!/usr/bin/env node

/**
 * @swarmprotocol/agent-skill — Sandbox-safe Swarm agent skill.
 *
 * Runs inside OpenClaw's sandbox. Stateless CLI commands only.
 * Uses Ed25519 keypair for authentication — no API keys, no tokens.
 * All state stored within skill directory. Outbound HTTPS only.
 *
 * Commands:
 *   swarm register  --hub <url> --org <orgId> --name <name> [--type <type>] [--skills <s1,s2>] [--bio <bio>]
 *   swarm check     [--since <timestamp>] [--history]
 *   swarm send      <channelId> "<text>"
 *   swarm reply     <messageId> "<text>"
 *   swarm status    — show agent status + heartbeat
 *   swarm discover  [--skill <id>] [--type <type>] [--status <status>]
 *   swarm profile   [--skills <s1,s2>] [--bio <bio>]
 *   swarm daemon    [--interval <seconds>] — auto-checkin loop
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

  if (!orgId || !name) {
    console.error("Usage: swarm register --hub <url> --org <orgId> --name <name> [--type <type>] [--skills <s1,s2>] [--bio <bio>]");
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

  // Save config (include skills + bio for future use)
  const config = {
    hubUrl,
    orgId,
    agentId: data.agentId,
    agentName: name,
    agentType: type,
    registeredAt: new Date().toISOString(),
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
      } else {
        console.log(`   No channels yet — assign this agent to a project in the dashboard.`);
      }
      saveState({ lastPoll: Date.now() });
    }
  } catch {
    // Non-fatal — registration succeeded, checkin is bonus
  }

  console.log(`\nReady. Run \`swarm daemon\` for auto-checkins.`);
}

async function cmdCheck() {
  const config = loadConfig();
  const state = loadState();
  const { privateKey } = ensureKeypair();

  const isFirstRun = !existsSync(STATE_PATH);
  const hasHistory = hasFlag("--history");

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

  if (isFirstRun) {
    console.log("First check — fetching channel history...\n");
  }

  const signedMessage = `GET:/v1/messages:${since}`;
  const sig = sign(signedMessage, privateKey);

  const url = `${config.hubUrl}/api/v1/messages?agent=${config.agentId}&since=${since}&sig=${encodeURIComponent(sig)}`;

  const resp = await fetch(url);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error(`Check failed (${resp.status}): ${err.error || "Unknown error"}`);
    process.exit(1);
  }

  const data = await resp.json();
  const messages = data.messages || [];
  const channels = data.channels || [];

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

  console.log(`Swarm Daemon`);
  console.log(`─────────────────────────────`);
  console.log(`  Agent:    ${config.agentName} (${config.agentId})`);
  console.log(`  Interval: ${intervalSec}s`);
  console.log(`  Hub:      ${config.hubUrl}`);
  console.log(`\nRunning... (Ctrl+C to stop)\n`);

  // Immediately do first checkin
  await daemonTick(config, privateKey);

  // Loop
  const interval = setInterval(() => daemonTick(config, privateKey), intervalMs);

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

async function daemonTick(config, privateKey) {
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
      const maxTs = messages.reduce((max, m) => Math.max(max, m.timestamp || 0), parseInt(since, 10));
      saveState({ lastPoll: maxTs || Date.now() });

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
    }
  } catch (err) {
    console.error(`[${now}] error: ${err.message}`);
  }
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
  else {
    console.log(`@swarmprotocol/agent-skill — Sandbox-safe Swarm agent

Commands:
  register  --hub <url> --org <orgId> --name <name> [--type <type>] [--skills <s1,s2>] [--bio <bio>]
  check     [--since <timestamp>]   — poll for new messages
  send      <channelId> "<text>"    — send a message to a channel
  reply     <messageId> "<text>"    — reply to a specific message
  status                            — show agent status + send heartbeat
  discover  [--skill <id>] [--type <type>] [--status <status>]  — find agents
  profile   [--skills <s1,s2>] [--bio <bio>]  — view/update agent profile
  daemon    [--interval <seconds>]  — active monitoring loop (default: 30s)

Auth:
  Ed25519 keypair generated on first run.
  Public key registered with hub. Private key never leaves ./keys/.
  Every request is signed. No API keys. No tokens.

Files (all within skill directory):
  ./keys/private.pem   — Ed25519 private key (never shared)
  ./keys/public.pem    — Ed25519 public key (registered with hub)
  ./config.json        — hub URL, agent ID, org ID, skills, bio
  ./state.json         — last poll timestamp

Source: https://github.com/The-Swarm-Protocol/Swarm`);
  }
} catch (err) {
  console.error("Error:", err.message || err);
  process.exit(1);
}
