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
 *   node swarm.mjs daemon                — real-time listener, responds instantly via OpenClaw API
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
  onSnapshot,
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

async function cmdTaskCreate() {
  const creds = loadCreds();
  const db = getDb();

  const projectId = process.argv[4];
  const title = process.argv[5];
  const description = arg("--description") || "";
  const priority = arg("--priority") || "medium";
  const assignee = arg("--assignee") || "";

  if (!projectId || !title) {
    console.error("Usage: swarm.mjs task create <projectId> \"<title>\" --description \"<desc>\" --priority <low|medium|high> --assignee <agentId>");
    process.exit(1);
  }

  const taskData = {
    title,
    description,
    projectId,
    orgId: creds.orgId,
    organizationId: creds.orgId,
    status: "todo",
    priority,
    createdBy: creds.agentId,
    createdAt: serverTimestamp(),
  };
  if (assignee) { taskData.assignedTo = assignee; taskData.assigneeAgentId = assignee; }

  const ref = await addDoc(collection(db, "tasks"), taskData);
  console.log(`✅ Task created: ${ref.id} — "${title}" [${priority}]`);
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

async function cmdTaskAssign() {
  const taskId = process.argv[4];
  const assignee = arg("--to") || arg("--assignee") || process.argv[5];

  if (!taskId || !assignee) {
    console.error("Usage: swarm.mjs task assign <taskId> --to <agentId|agentName>");
    process.exit(1);
  }

  const db = getDb();
  // Try to find agent by name if not an ID
  let agentId = assignee;
  const creds = loadCredentials();
  try {
    const agentsSnap = await getDocs(collection(db, "agents"));
    const match = agentsSnap.docs.find(d => {
      const a = d.data();
      return a.organizationId === creds.orgId && (d.id === assignee || (a.name || "").toLowerCase() === assignee.toLowerCase());
    });
    if (match) agentId = match.id;
  } catch {}

  await updateDoc(doc(db, "tasks", taskId), { assignedTo: agentId, updatedAt: serverTimestamp() });
  console.log(`✅ Task ${taskId} assigned to ${agentId}`);
}

async function cmdTaskComplete() {
  const taskId = process.argv[4];
  if (!taskId) {
    console.error("Usage: swarm.mjs task complete <taskId>");
    process.exit(1);
  }

  const db = getDb();
  await updateDoc(doc(db, "tasks", taskId), { status: "done", completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  console.log(`✅ Task ${taskId} marked complete`);
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

// ---------------------------------------------------------------------------
// Daemon — real-time Firestore listener + OpenClaw API for instant responses
// ---------------------------------------------------------------------------

async function cmdDaemon() {
  const creds = loadCreds();
  const db = getDb();
  const hubUrl = arg("--hub") || process.env.SWARM_HUB_URL || "https://hub.perkos.xyz";
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://localhost:18789";
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || arg("--gateway-token") || "";

  console.log(`🐝 Swarm Daemon starting for ${creds.agentName} (${creds.agentType})`);
  console.log(`   Hub: ${hubUrl}`);
  console.log(`   Gateway: ${gatewayUrl}`);

  // --- Helper: trigger OpenClaw agent to respond ---
  // Track other agents in channels to coordinate turn-taking
  const channelAgents = {}; // channelId -> [agentId, ...]

  // --- Helper: detect and execute task operations directly ---
  async function handleTaskOperations(text, projId, channelId, channelName) {
    const lower = text.toLowerCase();
    const results = { created: [], assigned: [], completed: [], statusChanged: [] };

    try {
      // --- ASSIGN tasks ---
      if (lower.includes("assign") && lower.includes("task")) {
        // Assign all project tasks to agents
        const tasksSnap = await getDocs(query(collection(db, "tasks"), where("projectId", "==", projId)));
        const allTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const unassigned = allTasks.filter(t => !t.assigneeAgentId && t.status !== "done");

        // Get agents in this org
        const agentsSnap = await getDocs(collection(db, "agents"));
        const orgAgents = agentsSnap.docs.filter(d => d.data().organizationId === creds.orgId).map(d => ({ id: d.id, ...d.data() }));

        if (unassigned.length > 0 && orgAgents.length > 0) {
          for (let i = 0; i < unassigned.length; i++) {
            const agent = orgAgents[i % orgAgents.length];
            await updateDoc(doc(db, "tasks", unassigned[i].id), {
              assigneeAgentId: agent.id,
              assignedTo: agent.id,
              updatedAt: serverTimestamp(),
            });
            results.assigned.push({ task: unassigned[i].title, agent: agent.name });
          }
          console.log(`   👤 Assigned ${results.assigned.length} tasks`);
        }
      }

      // --- COMPLETE / DONE tasks ---
      if ((lower.includes("done") || lower.includes("complete") || lower.includes("finish")) && lower.includes("task")) {
        const tasksSnap = await getDocs(query(collection(db, "tasks"), where("projectId", "==", projId)));
        const allTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const activeTasks = allTasks.filter(t => t.status !== "done");

        // If "all" mentioned, complete all. Otherwise complete assigned to this agent.
        const toComplete = lower.includes("all")
          ? activeTasks
          : activeTasks.filter(t => t.assigneeAgentId === creds.agentId || t.assignedTo === creds.agentId);

        for (const task of toComplete) {
          await updateDoc(doc(db, "tasks", task.id), {
            status: "done",
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          results.completed.push(task.title);
        }
        if (toComplete.length > 0) console.log(`   ✅ Completed ${toComplete.length} tasks`);
      }

      // --- CHANGE STATUS (in progress, review) ---
      if (lower.includes("start") || lower.includes("in progress") || lower.includes("begin") || lower.includes("work on")) {
        const tasksSnap = await getDocs(query(collection(db, "tasks"), where("projectId", "==", projId)));
        const allTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const todoTasks = allTasks.filter(t => t.status === "todo" && (t.assigneeAgentId === creds.agentId || t.assignedTo === creds.agentId));

        for (const task of todoTasks) {
          await updateDoc(doc(db, "tasks", task.id), {
            status: "in_progress",
            updatedAt: serverTimestamp(),
          });
          results.statusChanged.push(task.title);
        }
        if (todoTasks.length > 0) console.log(`   🔄 Started ${todoTasks.length} tasks`);
      }

      // --- CREATE tasks ---
      const isCreateRequest = lower.includes("create task") || lower.includes("create the") || lower.includes("make task") ||
        (lower.includes("task") && (lower.includes("create") || lower.includes("add") || lower.includes("make")));

      if (isCreateRequest && projId && !results.assigned.length && !results.completed.length) {
        const topic = text.replace(/@\w+/g, "").replace(/create\s*(the\s*)?(necessary\s*)?tasks?\s*(to|for|about)?/gi, "").trim();
        if (topic) {
          const taskTitles = [
            `Research and plan: ${topic}`,
            `Prepare resources for: ${topic}`,
            `Execute: ${topic}`,
            `Quality check: ${topic}`,
            `Document and review: ${topic}`,
          ];

          for (const title of taskTitles) {
            const taskRef = await addDoc(collection(db, "tasks"), {
              title,
              description: `Auto-created from chat: "${text}"`,
              projectId: projId,
              orgId: creds.orgId,
              organizationId: creds.orgId,
              status: "todo",
              priority: "medium",
              assigneeAgentId: creds.agentId,
              assignedTo: creds.agentId,
              createdBy: creds.agentId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            results.created.push({ id: taskRef.id, title });
          }
          console.log(`   📝 Created ${results.created.length} tasks`);
        }
      }

      const hasActions = results.created.length || results.assigned.length || results.completed.length || results.statusChanged.length;
      return hasActions ? results : null;
    } catch (err) {
      console.log(`   ⚠️ Task operation error: ${err.message}`);
      return null;
    }
  }

  async function triggerAgentResponse(channelId, channelName, projName, from, text, projId) {
    // --- Turn-taking: check if message is directed at us or our specialty ---
    const myName = creds.agentName.toLowerCase();
    const myType = (creds.agentType || "").toLowerCase();
    const msgLower = text.toLowerCase();
    const mentionsMe = msgLower.includes(myName) || msgLower.includes(`@${myName}`);

    // If there are other agents in this channel and message doesn't mention us,
    // add a small random delay (1-4s) so not everyone responds at once.
    // If we're directly mentioned, respond immediately.
    const otherAgents = (channelAgents[channelId] || []).filter(id => id !== creds.agentId);
    if (otherAgents.length > 0 && !mentionsMe) {
      const delay = 1000 + Math.random() * 3000;
      console.log(`   ⏳ ${otherAgents.length} other agent(s) in channel. Waiting ${Math.round(delay/1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }

    // --- Handle task operations directly (instant, no agent needed) ---
    const taskResults = await handleTaskOperations(text, projId, channelId, channelName);

    // --- Build context for conversational response ---
    let taskContext = "";
    if (taskResults) {
      const parts = [];
      if (taskResults.created?.length) parts.push(`Created ${taskResults.created.length} tasks: ${taskResults.created.map(t => t.title).join(", ")}`);
      if (taskResults.assigned?.length) parts.push(`Assigned ${taskResults.assigned.length} tasks: ${taskResults.assigned.map(a => `"${a.task}" → ${a.agent}`).join(", ")}`);
      if (taskResults.completed?.length) parts.push(`Completed ${taskResults.completed.length} tasks: ${taskResults.completed.join(", ")}`);
      if (taskResults.statusChanged?.length) parts.push(`Started ${taskResults.statusChanged.length} tasks: ${taskResults.statusChanged.join(", ")}`);
      taskContext = `\n\nActions already executed: ${parts.join(". ")}. Confirm this to the user with specifics.`;
    }

    const taskMsg = `[Swarm Channel Message]
Channel: #${channelName} | Project: ${projName} | From: ${from}
Message: "${text}"${taskContext}

You are ${creds.agentName}, a ${creds.agentType} agent in this swarm. ALWAYS respond to every message — you are part of a team.

IMPORTANT: You MUST run this command to send your reply (without it, nobody sees your response):
node ~/.openclaw/skills/swarm-connect/scripts/swarm.mjs chat send ${channelId} "<your reply>"

Rules:
- ALWAYS run the chat send command above with your reply text.
- Keep responses SHORT (1-3 sentences). Be natural and collaborative.
- Bring your ${creds.agentType} perspective to every conversation.
- If tasks were just created, confirm what was created and offer to start working on them.
- Be friendly, use emoji occasionally, feel like a real teammate.`;

    const headers = { "Content-Type": "application/json" };
    if (gatewayToken) headers["Authorization"] = `Bearer ${gatewayToken}`;

    try {
      // Use openclaw agent CLI to trigger an isolated agent turn
      const { execSync } = await import("node:child_process");
      const escapedMsg = taskMsg.replace(/'/g, "'\\''");
      execSync(`openclaw agent --agent main --message '${escapedMsg}' --json`, {
        timeout: 120000,
        stdio: 'pipe',
      });
      console.log(`   ✅ Triggered agent response`);
      return;
    } catch (cronErr) {
      console.log(`   ⚠️ Agent trigger failed: ${cronErr.message?.substring(0, 200)}`);
    }

    // Fallback: direct Firestore response
    try {
      await addDoc(collection(db, "messages"), {
        channelId,
        senderId: creds.agentId,
        senderName: creds.agentName,
        senderType: "agent",
        content: `👋 Hey ${from}! I received your message. Let me look into that.`,
        orgId: creds.orgId,
        createdAt: serverTimestamp(),
      });
      console.log(`   📤 Sent fallback response`);
    } catch {}
  }

  // --- Step 1: Authenticate with Hub and get JWT ---
  let jwt = null;
  let refreshToken = null;
  let ws = null;

  async function authenticate() {
    try {
      const resp = await fetch(`${hubUrl}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: creds.agentId, apiKey: creds.apiKey }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        console.log(`   ⚠️ Hub auth failed (${resp.status}): ${body}`);
        return false;
      }
      const data = await resp.json();
      jwt = data.token || data.accessToken;
      refreshToken = data.refreshToken || null;
      console.log(`   🔑 Authenticated with Hub (JWT obtained)`);
      return true;
    } catch (err) {
      console.log(`   ⚠️ Hub unreachable: ${err.message}`);
      return false;
    }
  }

  async function refreshJwt() {
    if (!refreshToken) return authenticate();
    try {
      const resp = await fetch(`${hubUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!resp.ok) return authenticate();
      const data = await resp.json();
      jwt = data.token || data.accessToken;
      if (data.refreshToken) refreshToken = data.refreshToken;
      console.log(`   🔄 JWT refreshed`);
      return true;
    } catch {
      return authenticate();
    }
  }

  // --- Step 2: Connect via WebSocket ---
  async function connectWebSocket() {
    const { default: WebSocket } = await import("ws");
    const wsUrl = hubUrl.replace(/^http/, "ws") + `?token=${jwt}`;

    ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log(`   🔗 WebSocket connected to Hub (secure)`);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "message") {
          // Skip own messages
          if (msg.senderId === creds.agentId) return;
          if (msg.senderType === "agent") return;

          const from = msg.senderName || msg.senderId || "unknown";
          const text = msg.content || "";
          const channelName = msg.channelName || msg.channelId;
          const projName = msg.projectName || "Project";
          console.log(`\n📨 [${projName}] #${channelName} — ${from}: ${text}`);
          triggerAgentResponse(msg.channelId, channelName, projName, from, text, msg.projectId);
        } else if (msg.type === "agent:online" || msg.type === "agent:offline") {
          console.log(`   ${msg.type === "agent:online" ? "🟢" : "🔴"} ${msg.agentName || msg.agentId} ${msg.type.split(":")[1]}`);
        }
      } catch {}
    });

    ws.on("close", (code) => {
      console.log(`   🔌 WebSocket closed (${code}). Reconnecting in 5s...`);
      setTimeout(async () => {
        const ok = await refreshJwt();
        if (ok) connectWebSocket();
        else {
          console.log(`   ⚠️ Hub reconnect failed. Falling back to Firestore listeners.`);
          startFirestorePolling();
        }
      }, 5000);
    });

    ws.on("error", (err) => {
      console.log(`   ⚠️ WebSocket error: ${err.message}`);
    });
  }

  // --- Step 3: Firestore fallback listeners ---
  const activeListeners = [];
  const processedMessages = new Set();
  let firestoreActive = false;

  // Channel info cache
  const channelInfo = {}; // channelId -> { name, projName, projId }

  async function startFirestorePolling() {
    if (firestoreActive) return;
    firestoreActive = true;
    console.log(`   📡 Starting Firestore polling (every 5s)`);

    const agentSnap = await getDoc(doc(db, "agents", creds.agentId));
    if (!agentSnap.exists()) return;
    const projectIds = agentSnap.data().projectIds || [];

    // Discover channels and mark existing messages
    for (const projectId of projectIds) {
      const projSnap = await getDoc(doc(db, "projects", projectId));
      const projName = projSnap.exists() ? projSnap.data().name : projectId;
      const channelsQ = query(collection(db, "channels"), where("projectId", "==", projectId));
      const channelsSnap = await getDocs(channelsQ);

      for (const chDoc of channelsSnap.docs) {
        const channelId = chDoc.id;
        const channelName = chDoc.data().name || "Channel";
        channelInfo[channelId] = { name: channelName, projName, projId: projectId };

        const messagesQ = query(collection(db, "messages"), where("channelId", "==", channelId));
        const existing = await getDocs(messagesQ);
        existing.forEach((d) => processedMessages.add(d.id));
        console.log(`   👂 Watching: [${projName}] #${channelName} (${existing.size} existing msgs)`);
      }
    }

    // Poll every 5 seconds for new messages
    setInterval(async () => {
      for (const [channelId, info] of Object.entries(channelInfo)) {
        try {
          const messagesQ = query(collection(db, "messages"), where("channelId", "==", channelId));
          const snap = await getDocs(messagesQ);
          for (const d of snap.docs) {
            if (processedMessages.has(d.id)) continue;
            processedMessages.add(d.id);
            const m = d.data();
            if (m.senderId === creds.agentId || m.senderType === "agent") continue;
            const from = m.senderName || m.senderId || "unknown";
            const text = m.content || m.text || "";
            console.log(`\n📨 [${info.projName}] #${info.name} — ${from}: ${text}`);
            triggerAgentResponse(channelId, info.name, info.projName, from, text, info.projId);
          }
        } catch {}
      }
    }, 5000);
  }

  // --- Step 4: Start ---
  // Update status
  try {
    await updateDoc(doc(db, "agents", creds.agentId), { status: "online", lastSeen: serverTimestamp() });
  } catch {}

  // ALWAYS start Firestore listeners (webapp writes directly to Firestore)
  await startFirestorePolling();

  // ALSO connect to Hub for agent-to-agent communication
  const hubOk = await authenticate();
  if (hubOk) {
    // Dynamic import ws for WebSocket client
    try {
      const { default: WebSocket } = await import("ws");
      const wsUrl = hubUrl.replace(/^http/, "ws") + `?token=${jwt}`;
      ws = new WebSocket(wsUrl);

      ws.on("open", () => {
        console.log(`   🔗 WebSocket connected to Hub (secure)`);
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "message") {
            if (msg.senderId === creds.agentId || msg.senderType === "agent") return;
            const from = msg.senderName || msg.senderId || "unknown";
            const text = msg.content || "";
            const channelName = msg.channelName || msg.channelId;
            const projName = msg.projectName || "Project";
            console.log(`\n📨 [WSS] [${projName}] #${channelName} — ${from}: ${text}`);
            triggerAgentResponse(msg.channelId, channelName, projName, from, text, msg.projectId);
          } else if (msg.type === "agent:online") {
            console.log(`   🟢 ${msg.agentName || msg.agentId} online`);
            // Track agent in their channels
            if (msg.channelId) {
              if (!channelAgents[msg.channelId]) channelAgents[msg.channelId] = [];
              if (!channelAgents[msg.channelId].includes(msg.agentId)) channelAgents[msg.channelId].push(msg.agentId);
            }
          } else if (msg.type === "agent:offline") {
            console.log(`   🔴 ${msg.agentName || msg.agentId} offline`);
          }
        } catch {}
      });

      ws.on("close", (code) => {
        console.log(`   🔌 WebSocket closed (${code}). Reconnecting in 5s...`);
        setTimeout(async () => {
          const ok = await refreshJwt();
          if (ok) {
            const { default: WS } = await import("ws");
            const url = hubUrl.replace(/^http/, "ws") + `?token=${jwt}`;
            ws = new WS(url);
            // Re-attach handlers (simplified reconnect)
            ws.on("open", () => console.log(`   🔗 Reconnected to Hub`));
            ws.on("message", ws.listeners("message")[0]);
            ws.on("close", ws.listeners("close")[0]);
          } else {
            console.log(`   ⚠️ Hub reconnect failed. Firestore listeners still active.`);
          }
        }, 5000);
      });

      ws.on("error", (err) => console.log(`   ⚠️ WS error: ${err.message}`));
    } catch (err) {
      console.log(`   ⚠️ WebSocket client failed: ${err.message}. Firestore listeners active.`);
    }
  } else {
    console.log(`   📡 Hub unavailable. Firestore listeners active.`);
  }

  // Heartbeat every 60s
  setInterval(async () => {
    try {
      await updateDoc(doc(db, "agents", creds.agentId), { lastSeen: serverTimestamp(), status: "online" });
    } catch {}
  }, 60000);

  // Refresh JWT every 12 min
  setInterval(() => refreshJwt(), 720000);

  console.log(`\n🟢 Daemon running. Ctrl+C to stop.`);

  process.on("SIGINT", () => {
    console.log("\n🔴 Daemon stopping...");
    if (ws) ws.close();
    activeListeners.forEach((unsub) => unsub());
    updateDoc(doc(db, "agents", creds.agentId), { status: "offline" }).catch(() => {});
    setTimeout(() => process.exit(0), 1000);
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const cmd = process.argv[2];
const sub = process.argv[3];

try {
  if (cmd === "register") await cmdRegister();
  else if (cmd === "daemon") await cmdDaemon();
  else if (cmd === "heartbeat") await cmdHeartbeat();
  else if (cmd === "log") await cmdLog(process.argv[3] || "info", process.argv.slice(4).join(" "));
  else if (cmd === "status") await cmdStatus();
  else if (cmd === "tasks" && sub === "list") await cmdTasksList();
  else if (cmd === "tasks" && sub === "update") await cmdTasksUpdate();
  else if (cmd === "task" && sub === "create") await cmdTaskCreate();
  else if (cmd === "task" && sub === "assign") await cmdTaskAssign();
  else if (cmd === "task" && sub === "complete") await cmdTaskComplete();
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
  task create <projectId> "<title>" --description "<desc>" --priority <low|medium|high> --assignee <agentId>
  task assign <taskId> --to <agentId|agentName>
  task complete <taskId>
  inbox list
  inbox count
  chat send <channelId> <message>
  chat poll
  chat listen <channelId>
  daemon                  — real-time listener (instant responses)`);
  }
} catch (err) {
  console.error("Error:", err.message || err);
  process.exit(1);
}
