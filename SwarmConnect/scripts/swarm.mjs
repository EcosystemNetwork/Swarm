#!/usr/bin/env node

/**
 * Swarm Connect CLI — manage your agent's connection to the Swarm platform.
 *
 * Usage:
 *   node swarm.mjs register --org <orgId> --name <name> --type <type> --api-key <key>
 *   node swarm.mjs status
 *   node swarm.mjs tasks list
 *   node swarm.mjs tasks update <taskId> --status <status>
 *   node swarm.mjs inbox list
 *   node swarm.mjs inbox count
 *   node swarm.mjs chat send <channelId> <message>
 *   node swarm.mjs chat listen <channelId>
 *   node swarm.mjs chat poll              — check all project channels for new messages
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SWARM_DIR = join(homedir(), ".swarm");
const CREDS_PATH = join(SWARM_DIR, "credentials.json");
const STATE_PATH = join(SWARM_DIR, "poll-state.json");

// ---------------------------------------------------------------------------
// Firebase config — uses the same project as the Swarm webapp
// ---------------------------------------------------------------------------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAwsFqFmZpw2QN0ZR1UmpgsC4ApTqHmoOM",
  authDomain: "lucky-st.firebaseapp.com",
  projectId: "lucky-st",
  storageBucket: "lucky-st.firebasestorage.app",
  messagingSenderId: "1075065834255",
  appId: "1:1075065834255:web:f66fd6e4fa05f812c18c7a",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadCreds() {
  if (!existsSync(CREDS_PATH)) {
    console.error("❌ Not registered. Run `swarm.mjs register` first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
}

function saveCreds(creds) {
  mkdirSync(SWARM_DIR, { recursive: true });
  writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2) + "\n");
}

function getDb() {
  const app = initializeApp(FIREBASE_CONFIG);
  return getFirestore(app);
}

function arg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length
    ? process.argv[idx + 1]
    : undefined;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdHeartbeat() {
  const creds = loadCreds();
  const db = getDb();
  await updateDoc(doc(db, "agents", creds.agentId), {
    lastSeen: serverTimestamp(),
    status: "online",
  });
  console.log("💓 Heartbeat sent");
}

async function cmdLog(level, message) {
  const creds = loadCreds();
  const db = getDb();
  await addDoc(collection(db, "agent-logs"), {
    agentId: creds.agentId,
    orgId: creds.orgId,
    level,
    message,
    createdAt: serverTimestamp(),
  });
}

async function cmdRegister() {
  const orgId = arg("--org");
  const name = arg("--name");
  const type = arg("--type");
  const apiKey = arg("--api-key");
  const agentId = arg("--agent-id");

  if (!orgId || !name || !type || !apiKey) {
    console.error(
      "Usage: swarm.mjs register --org <orgId> --name <name> --type <type> --api-key <key> [--agent-id <id>]"
    );
    process.exit(1);
  }

  // Use provided agent ID (from dashboard) or generate a local one
  const finalAgentId = agentId || `agent_${Date.now().toString(36)}`;

  const creds = {
    orgId,
    agentId: finalAgentId,
    agentName: name,
    agentType: type,
    apiKey,
    platformUrl: "https://swarm.perkos.xyz",
  };

  saveCreds(creds);

  // Update agent status to online in Firestore
  if (agentId) {
    try {
      const db = getDb();
      await updateDoc(doc(db, "agents", agentId), { status: "online" });
      console.log(`✅ Registered and connected as "${name}" (${type})`);
      await cmdLog("info", `Agent "${name}" registered and connected`);
    } catch {
      console.log(`✅ Registered as "${name}" (${type}) (could not update Firestore status)`);
      await cmdLog("error", `Agent "${name}" registered but failed to update Firestore status`);
    }
  } else {
    console.log(`✅ Registered as "${name}" (${type})`);
    try { await cmdLog("info", `Agent "${name}" registered (no Firestore ID)`); } catch {}
  }

  console.log(`   Org:      ${orgId}`);
  console.log(`   Agent ID: ${finalAgentId}`);
  console.log(`   Creds:    ${CREDS_PATH}`);
}

async function cmdStatus() {
  const creds = loadCreds();
  console.log("🐝 Swarm Connect Status");
  console.log(`   Agent:    ${creds.agentName} (${creds.agentType || "unknown"})`);
  console.log(`   Org:      ${creds.orgId}`);
  console.log(`   Agent ID: ${creds.agentId}`);
  console.log(`   Platform: ${creds.platformUrl}`);

  // Try to read agent doc from Firestore
  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "agents", creds.agentId));
    if (snap.exists()) {
      const data = snap.data();
      console.log(`   Status:   ${data.status || "unknown"}`);
      console.log(`   Projects: ${(data.projectIds || []).length}`);
    } else {
      console.log("   (agent doc not found in Firestore — register via dashboard first)");
    }
  } catch {
    console.log("   (could not reach Firestore)");
  }
}

async function cmdTasksList() {
  const creds = loadCreds();
  const db = getDb();

  const q = query(
    collection(db, "tasks"),
    where("assignedTo", "==", creds.agentId)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("📋 No tasks assigned to you.");
    return;
  }

  console.log(`📋 Tasks (${snap.size}):\n`);
  snap.forEach((d) => {
    const t = d.data();
    console.log(`  [${t.status || "todo"}] ${d.id} — ${t.title || "(untitled)"}`);
  });
}

async function cmdTasksUpdate() {
  const taskId = process.argv[4];
  const status = arg("--status");

  if (!taskId || !status) {
    console.error("Usage: swarm.mjs tasks update <taskId> --status <status>");
    process.exit(1);
  }

  const db = getDb();
  await updateDoc(doc(db, "tasks", taskId), { status, updatedAt: serverTimestamp() });
  console.log(`✅ Task ${taskId} → ${status}`);
}

async function cmdInboxList() {
  const creds = loadCreds();
  const db = getDb();

  const q = query(
    collection(db, "messages"),
    where("recipientId", "==", creds.agentId)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("📬 Inbox empty.");
    return;
  }

  console.log(`📬 Inbox (${snap.size}):\n`);
  snap.forEach((d) => {
    const m = d.data();
    const from = m.senderName || m.senderId || "unknown";
    const text = m.text || "(no text)";
    console.log(`  [${from}] ${text}`);
  });
}

async function cmdInboxCount() {
  const creds = loadCreds();
  const db = getDb();

  const q = query(
    collection(db, "messages"),
    where("recipientId", "==", creds.agentId)
  );

  const snap = await getDocs(q);
  console.log(`📬 ${snap.size} message(s)`);
}

async function cmdChatSend() {
  const channelId = process.argv[4];
  const message = process.argv.slice(5).join(" ");

  if (!channelId || !message) {
    console.error("Usage: swarm.mjs chat send <channelId> <message>");
    process.exit(1);
  }

  const creds = loadCreds();
  const db = getDb();

  await addDoc(collection(db, "messages"), {
    channelId,
    senderId: creds.agentId,
    senderName: creds.agentName,
    senderType: "agent",
    content: message,
    orgId: creds.orgId,
    createdAt: serverTimestamp(),
  });

  console.log(`💬 Sent to #${channelId}`);
}

async function cmdChatPoll() {
  const creds = loadCreds();
  const db = getDb();

  // Load poll state (tracks last seen timestamp per channel)
  let pollState = {};
  if (existsSync(STATE_PATH)) {
    try { pollState = JSON.parse(readFileSync(STATE_PATH, "utf-8")); } catch {}
  }

  // 1. Get agent doc to find projectIds
  const agentSnap = await getDoc(doc(db, "agents", creds.agentId));
  if (!agentSnap.exists()) {
    console.log("❌ Agent not found in Firestore. Re-register.");
    return;
  }
  const agentData = agentSnap.data();
  const projectIds = agentData.projectIds || [];

  if (projectIds.length === 0) {
    console.log("📭 No projects assigned. Nothing to poll.");
    return;
  }

  // 2. Find channels for each project
  let totalNew = 0;

  for (const projectId of projectIds) {
    // Get project name
    const projSnap = await getDoc(doc(db, "projects", projectId));
    const projName = projSnap.exists() ? projSnap.data().name : projectId;

    // Find channels for this project
    const channelsQ = query(
      collection(db, "channels"),
      where("projectId", "==", projectId)
    );
    const channelsSnap = await getDocs(channelsQ);

    for (const chDoc of channelsSnap.docs) {
      const chData = chDoc.data();
      const channelId = chDoc.id;
      const channelName = chData.name || "Project Channel";
      const lastSeen = pollState[channelId] || 0;

      // Get messages in this channel
      let messagesQ;
      if (lastSeen > 0) {
        const lastTs = Timestamp.fromMillis(lastSeen);
        messagesQ = query(
          collection(db, "messages"),
          where("channelId", "==", channelId),
          where("createdAt", ">", lastTs)
        );
      } else {
        // First poll — get last 10 messages
        messagesQ = query(
          collection(db, "messages"),
          where("channelId", "==", channelId)
        );
      }

      const msgsSnap = await getDocs(messagesQ);
      const messages = [];
      let maxTs = lastSeen;

      for (const mDoc of msgsSnap.docs) {
        const m = mDoc.data();
        // Skip own messages
        if (m.senderId === creds.agentId) {
          const mTs = m.createdAt?.toMillis?.() || 0;
          if (mTs > maxTs) maxTs = mTs;
          continue;
        }
        const mTs = m.createdAt?.toMillis?.() || 0;
        if (mTs > maxTs) maxTs = mTs;
        messages.push({
          id: mDoc.id,
          from: m.senderName || m.senderId || "unknown",
          type: m.senderType || "user",
          text: m.content || m.text || "",
          time: m.createdAt?.toDate?.()?.toISOString?.() || "",
        });
      }

      if (messages.length > 0) {
        console.log(`\n📢 [${projName}] #${channelName} (${channelId}) — ${messages.length} new message(s):`);
        for (const msg of messages) {
          const icon = msg.type === "agent" ? "🤖" : "👤";
          console.log(`  ${icon} ${msg.from}: ${msg.text}`);
        }
        console.log(`  ↳ Reply with: node swarm.mjs chat send ${channelId} "<your message>"`);
        totalNew += messages.length;
      }

      // Update state
      if (maxTs > lastSeen) {
        pollState[channelId] = maxTs;
      }
    }
  }

  if (totalNew === 0) {
    console.log("📭 No new messages.");
  }

  // Save poll state
  mkdirSync(SWARM_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(pollState, null, 2) + "\n");

  // Heartbeat + log
  try {
    await updateDoc(doc(db, "agents", creds.agentId), {
      lastSeen: serverTimestamp(),
      status: "online",
      lastPollResult: { messageCount: totalNew, at: new Date().toISOString() },
    });
    if (totalNew > 0) {
      await cmdLog("info", `Poll found ${totalNew} new message(s)`);
    }
  } catch {}
}

async function cmdChatListen() {
  const channelId = process.argv[4];

  if (!channelId) {
    console.error("Usage: swarm.mjs chat listen <channelId>");
    process.exit(1);
  }

  const db = getDb();
  let lastSeen = null;

  console.log(`👂 Listening to #${channelId} (poll every 5s, Ctrl+C to stop)\n`);

  const poll = async () => {
    try {
      let q;
      if (lastSeen) {
        q = query(
          collection(db, "messages"),
          where("channelId", "==", channelId),
          where("createdAt", ">", lastSeen),
          orderBy("createdAt", "asc")
        );
      } else {
        q = query(
          collection(db, "messages"),
          where("channelId", "==", channelId),
          orderBy("createdAt", "asc")
        );
      }

      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const m = d.data();
        const icon = m.senderType === "agent" ? "🤖" : "👤";
        const time = m.createdAt?.toDate?.()
          ? m.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";
        console.log(`${icon} [${time}] ${m.senderName}: ${m.content || m.text || ""}`);
        if (m.createdAt) lastSeen = m.createdAt;
      }
    } catch (err) {
      // Silently retry on transient errors
    }
  };

  await poll();
  setInterval(poll, 5000);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const cmd = process.argv[2];
const sub = process.argv[3];

try {
  if (cmd === "register") await cmdRegister();
  else if (cmd === "heartbeat") await cmdHeartbeat();
  else if (cmd === "log") await cmdLog(process.argv[3] || "info", process.argv.slice(4).join(" "));
  else if (cmd === "status") await cmdStatus();
  else if (cmd === "tasks" && sub === "list") await cmdTasksList();
  else if (cmd === "tasks" && sub === "update") await cmdTasksUpdate();
  else if (cmd === "inbox" && sub === "list") await cmdInboxList();
  else if (cmd === "inbox" && sub === "count") await cmdInboxCount();
  else if (cmd === "chat" && sub === "send") await cmdChatSend();
  else if (cmd === "chat" && sub === "poll") await cmdChatPoll();
  else if (cmd === "chat" && sub === "listen") await cmdChatListen();
  else {
    console.log(`Swarm Connect CLI

Commands:
  register  --org <id> --name <n> --type <t> --api-key <k>
  heartbeat
  log <level> <message>
  status
  tasks list
  tasks update <taskId> --status <status>
  inbox list
  inbox count
  chat send <channelId> <message>
  chat poll
  chat listen <channelId>`);
  }
} catch (err) {
  console.error("Error:", err.message || err);
  process.exit(1);
}
