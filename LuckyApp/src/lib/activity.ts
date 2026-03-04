/**
 * Activity Timeline — Types + Firestore Helpers
 *
 * Audit log of every system action: who did what, when.
 */

import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ActivityEventType =
    | "task.created"
    | "task.completed"
    | "task.failed"
    | "agent.connected"
    | "agent.disconnected"
    | "job.dispatched"
    | "job.completed"
    | "approval.requested"
    | "approval.approved"
    | "approval.rejected"
    | "skill.installed"
    | "skill.removed"
    | "cron.created"
    | "cron.triggered"
    | "config.changed"
    | "member.joined"
    | "member.left";

export type ActivityActor = "agent" | "user" | "system" | "cron";

export interface ActivityEvent {
    id: string;
    orgId: string;
    projectId?: string;
    /** What happened */
    eventType: ActivityEventType;
    /** Who initiated it */
    actorType: ActivityActor;
    actorId?: string;
    actorName?: string;
    /** What was affected */
    targetType?: string;
    targetId?: string;
    targetName?: string;
    /** Human-readable description */
    description: string;
    /** Extra data */
    metadata?: Record<string, unknown>;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Event Type Config
// ═══════════════════════════════════════════════════════════════

export const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
    "task.created": { label: "Task Created", icon: "📋", color: "text-blue-400" },
    "task.completed": { label: "Task Completed", icon: "✅", color: "text-emerald-400" },
    "task.failed": { label: "Task Failed", icon: "❌", color: "text-red-400" },
    "agent.connected": { label: "Agent Connected", icon: "🟢", color: "text-emerald-400" },
    "agent.disconnected": { label: "Agent Disconnected", icon: "🔴", color: "text-red-400" },
    "job.dispatched": { label: "Job Dispatched", icon: "🚀", color: "text-blue-400" },
    "job.completed": { label: "Job Completed", icon: "✅", color: "text-emerald-400" },
    "approval.requested": { label: "Approval Requested", icon: "🛡️", color: "text-amber-400" },
    "approval.approved": { label: "Approved", icon: "✅", color: "text-emerald-400" },
    "approval.rejected": { label: "Rejected", icon: "🚫", color: "text-red-400" },
    "skill.installed": { label: "Skill Installed", icon: "🧩", color: "text-purple-400" },
    "skill.removed": { label: "Skill Removed", icon: "🗑️", color: "text-muted-foreground" },
    "cron.created": { label: "Cron Created", icon: "⏰", color: "text-amber-400" },
    "cron.triggered": { label: "Cron Triggered", icon: "⚡", color: "text-amber-400" },
    "config.changed": { label: "Config Changed", icon: "⚙️", color: "text-cyan-400" },
    "member.joined": { label: "Member Joined", icon: "👋", color: "text-emerald-400" },
    "member.left": { label: "Member Left", icon: "👤", color: "text-muted-foreground" },
};

export const ACTOR_ICONS: Record<ActivityActor, string> = {
    agent: "🤖",
    user: "👤",
    system: "⚙️",
    cron: "⏰",
};

// ═══════════════════════════════════════════════════════════════
// Firestore
// ═══════════════════════════════════════════════════════════════

const ACTIVITY_COLLECTION = "activityEvents";

/** Log an activity event */
export async function logActivity(event: Omit<ActivityEvent, "id" | "createdAt">): Promise<string> {
    const ref = await addDoc(collection(db, ACTIVITY_COLLECTION), {
        ...event,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

/** Get activity feed for an org */
export async function getActivityFeed(
    orgId: string,
    opts?: { eventType?: ActivityEventType; actorType?: ActivityActor; max?: number },
): Promise<ActivityEvent[]> {
    const constraints: Parameters<typeof query>[1][] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        limit(opts?.max || 100),
    ];
    if (opts?.eventType) constraints.splice(1, 0, where("eventType", "==", opts.eventType));
    if (opts?.actorType) constraints.splice(1, 0, where("actorType", "==", opts.actorType));

    const q = query(collection(db, ACTIVITY_COLLECTION), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            projectId: data.projectId,
            eventType: data.eventType,
            actorType: data.actorType,
            actorId: data.actorId,
            actorName: data.actorName,
            targetType: data.targetType,
            targetId: data.targetId,
            targetName: data.targetName,
            description: data.description,
            metadata: data.metadata,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        } as ActivityEvent;
    });
}
