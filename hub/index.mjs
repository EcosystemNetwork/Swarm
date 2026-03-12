import "dotenv/config";
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import crypto from "crypto";

/**
 * SECURITY NOTE: This hub currently uses the Firebase client SDK instead of
 * the Firebase Admin SDK. For production deployments, migrate to firebase-admin
 * to avoid exposing API keys and to get better server-side performance.
 *
 * Migration steps:
 * 1. npm install firebase-admin
 * 2. Replace these imports with: import admin from 'firebase-admin';
 * 3. Add FIREBASE_SERVICE_ACCOUNT env var (base64 JSON service account key)
 * 4. Initialize with: admin.initializeApp({ credential: admin.credential.cert(...) })
 */
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// ── Config ──────────────────────────────────────────────────────────────────

/**
 * Load and validate a required environment variable.
 * Exits the process with a clear message if missing.
 */
function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`[FATAL] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

/**
 * Load an optional env var with a default.
 */
function optionalEnv(name, fallback) {
  return process.env[name] || fallback;
}

const PORT = parseInt(optionalEnv("PORT", "8400"), 10);
const RATE_LIMIT_WINDOW = parseInt(optionalEnv("RATE_LIMIT_WINDOW_MS", "60000"), 10);
const RATE_LIMIT_MAX = parseInt(optionalEnv("RATE_LIMIT_MAX", "60"), 10);
const MAX_CONNECTIONS_PER_AGENT = parseInt(optionalEnv("MAX_CONNECTIONS_PER_AGENT", "5"), 10);
const AUTH_WINDOW_MS = parseInt(optionalEnv("AUTH_WINDOW_MS", String(5 * 60 * 1000)), 10);

// Multi-region gateway configuration
const HUB_REGION = optionalEnv("HUB_REGION", "us-east");
const HUB_GATEWAY_ID = optionalEnv("HUB_GATEWAY_ID", "");
const GATEWAY_HEARTBEAT_INTERVAL = parseInt(optionalEnv("GATEWAY_HEARTBEAT_INTERVAL_MS", "60000"), 10);

// Firebase — loaded from environment, never hardcoded
const FIREBASE_CONFIG = {
  apiKey: requireEnv("FIREBASE_API_KEY"),
  authDomain: requireEnv("FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("FIREBASE_PROJECT_ID"),
  storageBucket: optionalEnv("FIREBASE_STORAGE_BUCKET", ""),
  messagingSenderId: optionalEnv("FIREBASE_MESSAGING_SENDER_ID", ""),
  appId: requireEnv("FIREBASE_APP_ID"),
};

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

// ── Logging ─────────────────────────────────────────────────────────────────
function log(level, msg, meta = {}) {
  const ts = new Date().toISOString();
  const extra = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  console.log(`[${ts}] [${level.toUpperCase()}] ${msg}${extra}`);
}

// ── State ───────────────────────────────────────────────────────────────────
// agentId → Set<ws>
const agentConnections = new Map();
// channelId → Set<ws>
const channelSubscribers = new Map();
// ws → { agentId, orgId, agentName, agentType, channels: Set, unsubs: Function[] }
const wsState = new Map();
// agentId → { timestamps: number[] }
const rateLimits = new Map();

// ── Heartbeat ───────────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 30_000; // ping every 30s

setInterval(() => {
  for (const [ws, state] of wsState) {
    if (ws._pongPending) {
      // Previous ping never got a pong — connection is dead
      log("warn", "Heartbeat timeout — terminating connection", { agentId: state.agentId });
      ws.terminate();
      continue;
    }
    ws._pongPending = true;
    // Send ping with request for vitals
    ws.ping(JSON.stringify({ request_vitals: true }));
  }
}, HEARTBEAT_INTERVAL_MS);

// ── Ed25519 Auth ────────────────────────────────────────────────────────────

/**
 * Verify an Ed25519 signature against a PEM public key stored in Firestore.
 * Returns agent data on success, null on failure.
 */
async function verifyEd25519(agentId, message, signatureBase64) {
  if (!agentId || !signatureBase64) return null;

  try {
    const agentSnap = await getDoc(doc(db, "agents", agentId));
    if (!agentSnap.exists()) return null;

    const data = agentSnap.data();
    const publicKeyPem = data.publicKey;
    if (!publicKeyPem) return null;

    const publicKey = crypto.createPublicKey({
      key: publicKeyPem,
      format: "pem",
      type: "spki",
    });

    const valid = crypto.verify(
      null, // Ed25519 doesn't use a separate hash
      Buffer.from(message, "utf-8"),
      publicKey,
      Buffer.from(signatureBase64, "base64")
    );

    if (!valid) return null;

    return {
      agentId,
      agentName: data.name || agentId,
      orgId: data.orgId || data.organizationId || "",
      agentType: data.type || "agent",
      projectIds: data.projectIds || [],
    };
  } catch (err) {
    log("error", "Ed25519 verify failed", { agentId, error: err.message });
    return null;
  }
}

/**
 * Check if IP address is whitelisted in Tailscale devices
 */
async function checkTailscaleWhitelist(orgId, ip) {
  if (!orgId || !ip) return false;

  try {
    // Normalize IP (remove ::ffff: prefix if present)
    const normalizedIP = ip.startsWith("::ffff:") ? ip.substring(7) : ip;

    const q = query(
      collection(db, "tailscaleDevices"),
      where("orgId", "==", orgId),
      where("status", "==", "active")
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.some((doc) => {
      const device = doc.data();
      return device.tailscaleIp === normalizedIP || device.publicIp === normalizedIP;
    });
  } catch (err) {
    log("error", "Tailscale whitelist check failed", { orgId, ip, error: err.message });
    return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function checkRateLimit(agentId) {
  const now = Date.now();
  let entry = rateLimits.get(agentId);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimits.set(agentId, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (entry.timestamps.length >= RATE_LIMIT_MAX) return false;
  entry.timestamps.push(now);
  return true;
}

function broadcastToChannel(channelId, message, excludeWs = null) {
  const subs = channelSubscribers.get(channelId);
  if (!subs) return;
  const data = typeof message === "string" ? message : JSON.stringify(message);
  for (const ws of subs) {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(data);
    }
  }
}

function subscribeToChannel(ws, channelId) {
  const state = wsState.get(ws);
  if (!state) return;
  if (!channelSubscribers.has(channelId)) {
    channelSubscribers.set(channelId, new Set());
  }
  channelSubscribers.get(channelId).add(ws);
  state.channels.add(channelId);
}

function unsubscribeFromChannel(ws, channelId) {
  const state = wsState.get(ws);
  if (!state) return;
  const subs = channelSubscribers.get(channelId);
  if (subs) {
    subs.delete(ws);
    if (subs.size === 0) channelSubscribers.delete(channelId);
  }
  state.channels.delete(channelId);
}

async function persistMessage(agentId, agentName, orgId, channelId, content) {
  try {
    const ref = await addDoc(collection(db, "messages"), {
      channelId,
      senderId: agentId,
      senderName: agentName || agentId,
      senderType: "agent",
      content,
      orgId,
      verified: true,
      createdAt: serverTimestamp(),
    });

    // Dual-write to agentComms for the Agent Comms dashboard feed
    let channelName = `#${channelId}`;
    try {
      const chSnap = await getDoc(doc(db, "channels", channelId));
      if (chSnap.exists()) channelName = `#${chSnap.data().name || channelId}`;
    } catch { /* use default */ }

    await addDoc(collection(db, "agentComms"), {
      orgId,
      fromAgentId: agentId,
      fromAgentName: agentName,
      toAgentId: channelId,
      toAgentName: channelName,
      type: "message",
      content,
      metadata: { channelId, messageId: ref.id, verified: true, source: "websocket" },
      createdAt: serverTimestamp(),
    }).catch((err) => {
      // Log dual-write failure (non-blocking)
      log("warn", "Failed to dual-write to agentComms", {
        channelId,
        messageId: ref.id,
        error: err.message,
      });
    });

    return ref.id;
  } catch (err) {
    log("error", "Failed to persist message", { channelId, error: err.message });
    return null;
  }
}

async function isAgentPaused(agentId) {
  try {
    const agentSnap = await getDoc(doc(db, "agents", agentId));
    if (!agentSnap.exists()) return false;
    const agentData = agentSnap.data();
    return agentData.status === "paused";
  } catch (err) {
    log("error", "Failed to check agent pause status", { agentId, error: err.message });
    return false; // Fail open — don't block if can't check
  }
}

async function getAgentChannels(agentId) {
  try {
    const agentSnap = await getDoc(doc(db, "agents", agentId));
    if (!agentSnap.exists()) return [];
    const agentData = agentSnap.data();
    const projectIds = agentData.projectIds || [];
    const orgId = agentData.orgId || agentData.organizationId || "";

    const channels = [];
    const seenIds = new Set();

    // 1. Fetch project-specific channels
    for (let i = 0; i < projectIds.length; i += 10) {
      const batch = projectIds.slice(i, i + 10);
      const channelsQuery = query(
        collection(db, "channels"),
        where("projectId", "in", batch)
      );
      const snap = await getDocs(channelsQuery);
      for (const d of snap.docs) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          channels.push({ id: d.id, name: d.data().name || "Channel", projectId: d.data().projectId });
        }
      }
    }

    // 2. Always include the org-wide "Agent Hub" channel so all agents
    //    in the same org can communicate regardless of project assignment.
    if (orgId) {
      const hubQuery = query(
        collection(db, "channels"),
        where("orgId", "==", orgId),
        where("name", "==", "Agent Hub")
      );
      const hubSnap = await getDocs(hubQuery);
      for (const d of hubSnap.docs) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          channels.push({ id: d.id, name: "Agent Hub", projectId: "org" });
        }
      }
    }

    return channels;
  } catch (err) {
    log("error", "Failed to fetch agent channels", { agentId, error: err.message });
    return [];
  }
}

// ── Firestore Real-Time Streaming ───────────────────────────────────────────

/**
 * Subscribe to real-time Firestore changes for a channel and push
 * new messages to the WebSocket client.
 */
function streamChannel(ws, channelId, channelName, agentId) {
  const state = wsState.get(ws);
  if (!state) return null;

  const q = query(
    collection(db, "messages"),
    where("channelId", "==", channelId),
    orderBy("createdAt", "asc")
  );

  // Track whether we've seen the initial snapshot (skip initial docs)
  let initialLoad = true;

  const unsub = onSnapshot(q, (snap) => {
    if (initialLoad) {
      initialLoad = false;
      return; // Skip initial snapshot — replay handles history
    }

    snap.docChanges().forEach((change) => {
      if (change.type === "added") {
        const m = change.doc.data();
        // Don't echo the agent's own messages back
        if (m.senderId === agentId) return;

        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: "message",
            channelId,
            channelName,
            messageId: change.doc.id,
            from: m.senderName || m.senderId || "unknown",
            fromType: m.senderType || "user",
            text: m.content || m.text || "",
            ts: m.createdAt?.toMillis?.() || Date.now(),
          }));
        }
      }
    });
  }, (err) => {
    log("error", "onSnapshot error", { channelId, error: err.message });
  });

  // Store unsub so we can clean up on disconnect
  state.unsubs.push(unsub);
  return unsub;
}

/**
 * Replay messages since a given timestamp for a specific channel.
 */
async function replayChannel(ws, channelId, channelName, agentId, sinceMs) {
  try {
    const sinceTs = Timestamp.fromMillis(sinceMs);
    const q = query(
      collection(db, "messages"),
      where("channelId", "==", channelId),
      where("createdAt", ">", sinceTs),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    let count = 0;

    for (const d of snap.docs) {
      const m = d.data();
      if (m.senderId === agentId) continue; // skip own messages

      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: "message",
          channelId,
          channelName,
          messageId: d.id,
          from: m.senderName || m.senderId || "unknown",
          fromType: m.senderType || "user",
          text: m.content || m.text || "",
          ts: m.createdAt?.toMillis?.() || 0,
          replay: true,
        }));
        count++;
      }
    }
    return count;
  } catch (err) {
    log("error", "Replay failed", { channelId, error: err.message });
    return 0;
  }
}

// ── Express ─────────────────────────────────────────────────────────────────
const app = express();

// Security: Lock down CORS to only allow requests from the main app
const ALLOWED_ORIGINS = optionalEnv("ALLOWED_ORIGINS", "https://swarm.perkos.xyz,http://localhost:3000")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      log("warn", "CORS blocked origin", { origin });
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

// Security: Limit request body size to prevent DoS attacks (1MB max)
app.use(express.json({ limit: "1mb" }));

// GET /health
app.get("/health", (_req, res) => {
  let totalConnections = 0;
  for (const conns of agentConnections.values()) totalConnections += conns.size;
  res.json({
    status: "ok",
    auth: "ed25519",
    uptime: process.uptime(),
    agents: agentConnections.size,
    connections: totalConnections,
    channels: channelSubscribers.size,
    ts: new Date().toISOString(),
  });
});

// GET /agents/online (no auth required — public info)
app.get("/agents/online", (_req, res) => {
  const online = [];
  for (const [agentId, conns] of agentConnections) {
    if (conns.size > 0) {
      const first = conns.values().next().value;
      const state = wsState.get(first);
      online.push({
        agentId,
        agentName: state?.agentName || agentId,
        agentType: state?.agentType || "agent",
        connections: conns.size,
      });
    }
  }
  res.json({ agents: online });
});

// ── HTTP + WS Server ────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

/**
 * WebSocket upgrade handler.
 * URL: /ws/agents/{agentId}?sig={base64}&ts={ms}&since={ms}
 * Auth: Ed25519.sign("WS:connect:{agentId}:{ts}")
 */
server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  // Expect: /ws/agents/{agentId}
  if (pathParts.length !== 3 || pathParts[0] !== "ws" || pathParts[1] !== "agents") {
    log("warn", "WS upgrade rejected — invalid path", { path: url.pathname });
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  const agentId = pathParts[2];

  // Validate agentId format (alphanumeric, hyphens, underscores, max 128 chars)
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(agentId)) {
    log("warn", "WS upgrade rejected — invalid agentId format", { agentId });
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const sig = url.searchParams.get("sig");
  const ts = url.searchParams.get("ts");
  const sinceParam = url.searchParams.get("since") || "0";

  if (!sig || !ts) {
    log("warn", "WS upgrade rejected — missing sig or ts", { agentId });
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // Check timestamp freshness (prevent replay of connection URLs)
  const tsMs = parseInt(ts, 10);
  if (Math.abs(Date.now() - tsMs) > AUTH_WINDOW_MS) {
    log("warn", "WS upgrade rejected — stale timestamp", { agentId });
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // Verify Ed25519 signature: agent signed "WS:connect:{agentId}:{ts}"
  const signedMessage = `WS:connect:${agentId}:${ts}`;
  const agentData = await verifyEd25519(agentId, signedMessage, sig);
  if (!agentData) {
    log("warn", "WS upgrade rejected — invalid signature", { agentId });
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // Tailscale IP whitelisting (if enabled)
  const TAILSCALE_WHITELIST_MODE = optionalEnv("TAILSCALE_WHITELIST_MODE", "disabled");
  if (TAILSCALE_WHITELIST_MODE !== "disabled") {
    const clientIP = req.socket.remoteAddress || "";
    const isWhitelisted = await checkTailscaleWhitelist(agentData.orgId, clientIP);

    if (!isWhitelisted) {
      if (TAILSCALE_WHITELIST_MODE === "enforce") {
        log("warn", "WS upgrade rejected — IP not whitelisted", { agentId, clientIP });
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      } else if (TAILSCALE_WHITELIST_MODE === "warn") {
        log("warn", "WS connection from non-whitelisted IP", { agentId, clientIP });
      }
    }
  }

  // Check max connections per agent
  const existing = agentConnections.get(agentId);
  if (existing && existing.size >= MAX_CONNECTIONS_PER_AGENT) {
    log("warn", "WS upgrade rejected — max connections", { agentId });
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
    return;
  }

  // Authenticated — upgrade to WebSocket
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws._agentData = agentData;
    ws._sinceMs = parseInt(sinceParam, 10);
    wss.emit("connection", ws, req);
  });
});

// ── WebSocket Connection Handler ────────────────────────────────────────────

wss.on("connection", async (ws, _req) => {
  const { agentId, orgId, agentName, agentType } = ws._agentData;
  const sinceMs = ws._sinceMs || 0;
  delete ws._agentData;
  delete ws._sinceMs;

  // Track connection
  if (!agentConnections.has(agentId)) agentConnections.set(agentId, new Set());
  agentConnections.get(agentId).add(ws);

  const state = { agentId, orgId, agentName, agentType, channels: new Set(), unsubs: [] };
  wsState.set(ws, state);

  log("info", "Agent connected (Ed25519)", { agentId, agentName });

  // Send welcome message
  ws.send(JSON.stringify({
    type: "connected",
    agentId,
    agentName,
    ts: Date.now(),
  }));

  // Auto-subscribe to agent's project channels
  const channels = await getAgentChannels(agentId);
  let totalReplayed = 0;

  for (const ch of channels) {
    subscribeToChannel(ws, ch.id);

    // Replay missed messages if since > 0
    if (sinceMs > 0) {
      const count = await replayChannel(ws, ch.id, ch.name, agentId, sinceMs);
      totalReplayed += count;
    }

    // Start real-time Firestore streaming for this channel
    streamChannel(ws, ch.id, ch.name, agentId);

    // Broadcast online status to channel (exclude self)
    broadcastToChannel(ch.id, {
      type: "agent:online",
      agentId,
      agentName,
      ts: Date.now(),
    }, ws);
  }

  // Send replay summary
  if (sinceMs > 0) {
    ws.send(JSON.stringify({
      type: "replay:end",
      count: totalReplayed,
      channels: channels.length,
      ts: Date.now(),
    }));
  }

  // Send channel list
  ws.send(JSON.stringify({
    type: "channels",
    channels: channels.map(c => ({ id: c.id, name: c.name })),
    ts: Date.now(),
  }));

  // ── Heartbeat pong handler ──────────────────────────────────────────────
  ws._pongPending = false;
  ws.on("pong", async (data) => {
    ws._pongPending = false;

    // Parse vitals from pong data if provided
    if (data && data.length > 0) {
      try {
        const vitals = JSON.parse(data.toString());
        if (vitals.cpu !== undefined && vitals.memory !== undefined && vitals.disk !== undefined) {
          // Record vitals to Firestore
          await addDoc(collection(db, "agentVitals"), {
            orgId,
            agentId,
            agentName,
            vitals: {
              cpu: vitals.cpu,
              memory: vitals.memory,
              disk: vitals.disk,
              memoryUsedMB: vitals.memoryUsedMB,
              memoryTotalMB: vitals.memoryTotalMB,
              diskUsedGB: vitals.diskUsedGB,
              diskTotalGB: vitals.diskTotalGB,
            },
            timestamp: serverTimestamp(),
          });
        }
      } catch (err) {
        // Ignore vitals parsing errors
      }
    }
  });

  // ── Message Handler ─────────────────────────────────────────────────────

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Rate limit
    if (!checkRateLimit(agentId)) {
      ws.send(JSON.stringify({ error: "Rate limit exceeded", type: "error" }));
      return;
    }

    // Check if agent is paused
    const paused = await isAgentPaused(agentId);
    if (paused) {
      ws.send(JSON.stringify({ error: "Agent is paused", type: "error", code: "AGENT_PAUSED" }));
      return;
    }

    const { type, channelId, content } = msg;

    // Subscribe/unsubscribe
    if (type === "subscribe" && channelId) {
      subscribeToChannel(ws, channelId);
      streamChannel(ws, channelId, channelId, agentId);
      log("info", "Subscribed", { agentId, channelId });
      ws.send(JSON.stringify({ type: "subscribed", channelId }));
      return;
    }

    if (type === "unsubscribe" && channelId) {
      unsubscribeFromChannel(ws, channelId);
      log("info", "Unsubscribed", { agentId, channelId });
      ws.send(JSON.stringify({ type: "unsubscribed", channelId }));
      return;
    }

    // Send message
    if (type === "message" && channelId && content) {
      const messageId = await persistMessage(agentId, agentName, orgId, channelId, content);

      // Warn if persistence failed
      if (!messageId) {
        log("warn", "Message persistence failed, using fallback ID", { agentId, channelId });
      }

      const outgoing = {
        type: "message",
        channelId,
        messageId: messageId || crypto.randomUUID(),
        from: agentName,
        fromType: "agent",
        text: content,
        ts: Date.now(),
      };

      // Broadcast to other WS clients in the channel (not via onSnapshot — immediate)
      broadcastToChannel(channelId, outgoing, ws);

      // Confirm delivery to sender
      ws.send(JSON.stringify({
        type: "message:sent",
        messageId: outgoing.messageId,
        channelId,
        ts: Date.now(),
      }));

      log("info", "Message sent", { agentId, channelId });
      return;
    }

    // Typing indicator
    if (type === "typing" && channelId) {
      broadcastToChannel(channelId, {
        type: "typing",
        agentId,
        agentName,
        channelId,
        ts: Date.now(),
      }, ws);
      return;
    }

    // Message acknowledgment — receiver confirms they got a message
    if (type === "message:ack" && msg.messageId) {
      broadcastToChannel(channelId || "", {
        type: "message:ack",
        messageId: msg.messageId,
        agentId,
        agentName,
        ts: Date.now(),
      }, ws);
      return;
    }

    // Task broadcast — agent assigns work to others via a channel
    if (type === "task:assign" && channelId) {
      const taskPayload = {
        type: "task:assign",
        channelId,
        from: agentName,
        fromId: agentId,
        taskId: msg.taskId || crypto.randomUUID(),
        title: msg.title || "",
        description: msg.description || content || "",
        priority: msg.priority || "normal",
        requiredSkills: msg.requiredSkills || [],
        ts: Date.now(),
      };

      // Persist as a message so polling agents also see it
      await persistMessage(agentId, agentName, orgId, channelId,
        `[TASK] ${msg.title || "New task"}: ${msg.description || content || ""}`);

      broadcastToChannel(channelId, taskPayload, ws);

      ws.send(JSON.stringify({
        type: "task:assigned",
        taskId: taskPayload.taskId,
        channelId,
        ts: Date.now(),
      }));

      log("info", "Task broadcast", { agentId, channelId, taskId: taskPayload.taskId });
      return;
    }

    // Task acceptance — agent confirms they're working on a broadcast task
    if (type === "task:accept" && msg.taskId) {
      const acceptPayload = {
        type: "task:accepted",
        taskId: msg.taskId,
        agentId,
        agentName,
        channelId: channelId || "",
        ts: Date.now(),
      };

      if (channelId) {
        broadcastToChannel(channelId, acceptPayload, ws);
        await persistMessage(agentId, agentName, orgId, channelId,
          `[ACK] ${agentName} accepted task ${msg.taskId}`);
      }

      ws.send(JSON.stringify(acceptPayload));
      log("info", "Task accepted", { agentId, taskId: msg.taskId });
      return;
    }

    ws.send(JSON.stringify({ error: "Invalid message type or missing fields", type: "error" }));
  });

  // ── Disconnect Handler ──────────────────────────────────────────────────

  ws.on("close", () => {
    log("info", "Agent disconnected", { agentId, agentName });

    // Clean up Firestore listeners
    for (const unsub of state.unsubs) {
      try { unsub(); } catch { /* ignore */ }
    }
    state.unsubs = [];

    // Broadcast offline to all subscribed channels
    for (const chId of state.channels) {
      broadcastToChannel(chId, {
        type: "agent:offline",
        agentId,
        agentName,
        ts: Date.now(),
      }, ws);
      const subs = channelSubscribers.get(chId);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) channelSubscribers.delete(chId);
      }
    }

    // Remove from agent pool
    const conns = agentConnections.get(agentId);
    if (conns) {
      conns.delete(ws);
      if (conns.size === 0) agentConnections.delete(agentId);
    }
    wsState.delete(ws);
  });

  ws.on("error", (err) => {
    log("error", "WebSocket error", { agentId, error: err.message });
  });
});

// ── Gateway Heartbeat ───────────────────────────────────────────────────────

/**
 * Report gateway metrics to Firestore (if HUB_GATEWAY_ID is configured)
 */
async function reportGatewayHeartbeat() {
  if (!HUB_GATEWAY_ID) {
    return; // Heartbeat disabled (gateway not registered)
  }

  try {
    // Calculate metrics
    const totalAgentConnections = agentConnections.size;
    let activeConnections = 0;
    for (const conns of agentConnections.values()) {
      activeConnections += conns.size;
    }

    // Calculate average latency (simplified - use ping times if available)
    const avgLatencyMs = 50; // Placeholder - would need to track actual ping times

    // Calculate requests per minute (simplified)
    const requestsPerMinute = 0; // Placeholder - would need to track request counts

    // Calculate error rate (simplified)
    const errorRate = 0; // Placeholder - would need to track error counts

    // Get system metrics
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();

    const metrics = {
      activeConnections,
      avgLatencyMs,
      requestsPerMinute,
      errorRate,
      uptime: 99.9, // Placeholder - would track actual uptime
    };

    const capacity = {
      maxConnections: 1000, // Configurable
      cpuUsage: 0, // Would calculate from cpuUsage
      memoryUsage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    };

    // Update Firestore
    const gatewayRef = doc(db, "gateways", HUB_GATEWAY_ID);
    const gatewayDoc = await getDoc(gatewayRef);

    if (gatewayDoc.exists()) {
      await gatewayDoc.ref.update({
        metrics,
        capacity,
        lastHeartbeat: serverTimestamp(),
        status: "connected",
        agentsConnected: totalAgentConnections,
      });

      log("debug", "Gateway heartbeat sent", {
        gatewayId: HUB_GATEWAY_ID,
        region: HUB_REGION,
        activeConnections: totalAgents
      });
    }
  } catch (err) {
    log("error", "Gateway heartbeat failed", { error: err.message });
  }
}

// ── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  log("info", `Swarm Hub (Ed25519) listening on port ${PORT}`);
  log("info", `Region: ${HUB_REGION}`);
  if (HUB_GATEWAY_ID) {
    log("info", `Gateway ID: ${HUB_GATEWAY_ID}`);
  }
  log("info", `Health: http://localhost:${PORT}/health`);
  log("info", `WebSocket: ws://localhost:${PORT}/ws/agents/{agentId}?sig=...&ts=...`);

  // Start gateway heartbeat
  if (HUB_GATEWAY_ID) {
    reportGatewayHeartbeat(); // Initial heartbeat
    setInterval(reportGatewayHeartbeat, GATEWAY_HEARTBEAT_INTERVAL);
    log("info", `Gateway heartbeat enabled (interval: ${GATEWAY_HEARTBEAT_INTERVAL}ms)`);
  }
});
