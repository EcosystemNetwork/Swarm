/**
 * Heartbeat / Agent Status Monitor
 *
 * Track agent uptime with online/offline/degraded status.
 */

import {
    collection,
    doc,
    setDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type AgentStatus = "online" | "offline" | "degraded" | "paused";

export interface AgentHeartbeat {
    agentId: string;
    agentName?: string;
    status: AgentStatus;
    lastSeen: Date | null;
    latencyMs?: number;
    version?: string;
    uptime?: number; // seconds
}

export const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string }> = {
    online: { label: "Online", color: "text-emerald-400", dot: "bg-emerald-400" },
    offline: { label: "Offline", color: "text-red-400", dot: "bg-red-400" },
    degraded: { label: "Degraded", color: "text-amber-400", dot: "bg-amber-400" },
    paused: { label: "Paused", color: "text-gray-400", dot: "bg-gray-400" },
};

// ═══════════════════════════════════════════════════════════════
// Firestore
// ═══════════════════════════════════════════════════════════════

const HEARTBEAT_COLLECTION = "agentHeartbeats";

/** Record/update an agent's heartbeat */
export async function recordHeartbeat(
    orgId: string,
    agentId: string,
    data?: { agentName?: string; latencyMs?: number; version?: string; uptime?: number }
): Promise<void> {
    const ref = doc(db, HEARTBEAT_COLLECTION, `${orgId}_${agentId}`);
    await setDoc(ref, {
        orgId,
        agentId,
        agentName: data?.agentName || agentId,
        status: "online" as AgentStatus,
        lastSeen: serverTimestamp(),
        latencyMs: data?.latencyMs,
        version: data?.version,
        uptime: data?.uptime,
    }, { merge: true });
}

/** Get all agent heartbeats for an org */
export async function getHeartbeats(orgId: string): Promise<AgentHeartbeat[]> {
    const q = query(
        collection(db, HEARTBEAT_COLLECTION),
        where("orgId", "==", orgId),
    );
    const snap = await getDocs(q);
    const now = Date.now();
    const STALE_MS = 5 * 60 * 1000; // 5 minutes

    return snap.docs.map((d) => {
        const data = d.data();
        const lastSeen = data.lastSeen instanceof Timestamp ? data.lastSeen.toDate() : null;
        const elapsed = lastSeen ? now - lastSeen.getTime() : Infinity;

        let status: AgentStatus = "offline";
        if (elapsed < STALE_MS) status = "online";
        else if (elapsed < STALE_MS * 3) status = "degraded";

        return {
            agentId: data.agentId,
            agentName: data.agentName,
            status,
            lastSeen,
            latencyMs: data.latencyMs,
            version: data.version,
            uptime: data.uptime,
        } as AgentHeartbeat;
    });
}

/** Check for stale agents that haven't checked in */
export async function getStaleAgents(orgId: string): Promise<AgentHeartbeat[]> {
    const all = await getHeartbeats(orgId);
    return all.filter(a => a.status !== "online");
}

// ═══════════════════════════════════════════════════════════════
// Pause / Resume
// ═══════════════════════════════════════════════════════════════

/** Pause an agent (prevents message processing) */
export async function pauseAgent(
    orgId: string,
    agentId: string,
    pausedBy: string,
    reason?: string
): Promise<void> {
    // Update agent status in agents collection
    const agentRef = doc(db, "agents", agentId);
    await setDoc(agentRef, {
        status: "paused",
        pausedAt: serverTimestamp(),
        pausedBy,
        pauseReason: reason || "",
    }, { merge: true });

    // Update heartbeat status
    const heartbeatRef = doc(db, HEARTBEAT_COLLECTION, `${orgId}_${agentId}`);
    await setDoc(heartbeatRef, {
        status: "paused" as AgentStatus,
        pausedAt: serverTimestamp(),
    }, { merge: true });
}

/** Resume a paused agent */
export async function resumeAgent(
    orgId: string,
    agentId: string
): Promise<void> {
    // Update agent status in agents collection
    const agentRef = doc(db, "agents", agentId);
    await setDoc(agentRef, {
        status: "online",
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
    }, { merge: true });

    // Update heartbeat status
    const heartbeatRef = doc(db, HEARTBEAT_COLLECTION, `${orgId}_${agentId}`);
    await setDoc(heartbeatRef, {
        status: "online" as AgentStatus,
        lastSeen: serverTimestamp(),
    }, { merge: true });
}
