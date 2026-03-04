/**
 * Cron Scheduler — Firestore CRUD + Types
 *
 * Schedule agent tasks to run automatically on intervals.
 * Actual execution is handled server-side (Cloud Functions / Hub).
 * This module manages schedule definitions stored in Firestore.
 */

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ScheduleType = "interval" | "daily" | "weekly" | "monthly" | "custom";

export interface CronJob {
    id: string;
    orgId: string;
    projectId?: string;
    name: string;
    /** The prompt/message to send to agents */
    message: string;
    /** Cron expression (e.g., "0 9 * * *") */
    schedule: string;
    /** Human-readable schedule label */
    scheduleLabel?: string;
    /** Which channel to send results to */
    targetChannelId?: string;
    /** Which agents to assign */
    agentIds?: string[];
    /** Priority level */
    priority?: "low" | "medium" | "high";
    /** Is this job active? */
    enabled: boolean;
    /** Created by wallet address */
    createdBy: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    /** Last execution info */
    lastRun?: {
        time: Date;
        success: boolean;
        error?: string;
        durationMs?: number;
    };
    /** Next scheduled run (computed) */
    nextRun?: Date;
}

export interface CronJobCreateInput {
    orgId: string;
    projectId?: string;
    name: string;
    message: string;
    schedule: string;
    scheduleLabel?: string;
    targetChannelId?: string;
    agentIds?: string[];
    priority?: "low" | "medium" | "high";
    enabled?: boolean;
    createdBy: string;
}

export interface CronJobUpdateInput {
    name?: string;
    message?: string;
    schedule?: string;
    scheduleLabel?: string;
    targetChannelId?: string;
    agentIds?: string[];
    priority?: "low" | "medium" | "high";
    enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Schedule Presets
// ═══════════════════════════════════════════════════════════════

export const SCHEDULE_PRESETS: { label: string; value: string; type: ScheduleType; icon: string }[] = [
    { label: "Every 5 minutes", value: "*/5 * * * *", type: "interval", icon: "⚡" },
    { label: "Every 15 minutes", value: "*/15 * * * *", type: "interval", icon: "🔄" },
    { label: "Every hour", value: "0 * * * *", type: "interval", icon: "🕐" },
    { label: "Every 6 hours", value: "0 */6 * * *", type: "interval", icon: "🕕" },
    { label: "Daily at 9 AM", value: "0 9 * * *", type: "daily", icon: "☀️" },
    { label: "Daily at 6 PM", value: "0 18 * * *", type: "daily", icon: "🌅" },
    { label: "Weekly — Mon 9 AM", value: "0 9 * * 1", type: "weekly", icon: "📅" },
    { label: "Monthly — 1st 9 AM", value: "0 9 1 * *", type: "monthly", icon: "📆" },
];

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Parse a cron expression to human-readable text */
export function parseCronToHuman(cron: string): string {
    const preset = SCHEDULE_PRESETS.find((p) => p.value === cron);
    if (preset) return preset.label;

    const parts = cron.split(" ");
    if (parts.length !== 5) return cron;

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    if (minute === "*" && hour === "*") return "Every minute";
    if (minute.startsWith("*/")) return `Every ${minute.slice(2)} minutes`;
    if (hour === "*" && minute === "0") return "Every hour";
    if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
    if (dayOfWeek !== "*" && dayOfMonth === "*") {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return `Weekly on ${days[parseInt(dayOfWeek)] ?? dayOfWeek} at ${hour}:${minute.padStart(2, "0")}`;
    }
    if (dayOfMonth !== "*") {
        return `Monthly on day ${dayOfMonth} at ${hour}:${minute.padStart(2, "0")}`;
    }
    if (hour !== "*") {
        return `Daily at ${hour}:${minute.padStart(2, "0")}`;
    }

    return cron;
}

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

const CRON_COLLECTION = "cronJobs";

/** Create a new cron job */
export async function createCronJob(input: CronJobCreateInput): Promise<string> {
    const ref = await addDoc(collection(db, CRON_COLLECTION), {
        ...input,
        enabled: input.enabled ?? true,
        scheduleLabel: input.scheduleLabel || parseCronToHuman(input.schedule),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
}

/** Update a cron job */
export async function updateCronJob(id: string, input: CronJobUpdateInput): Promise<void> {
    const ref = doc(db, CRON_COLLECTION, id);
    await updateDoc(ref, {
        ...input,
        ...(input.schedule ? { scheduleLabel: input.scheduleLabel || parseCronToHuman(input.schedule) } : {}),
        updatedAt: serverTimestamp(),
    });
}

/** Delete a cron job */
export async function deleteCronJob(id: string): Promise<void> {
    await deleteDoc(doc(db, CRON_COLLECTION, id));
}

/** Toggle a cron job enabled/disabled */
export async function toggleCronJob(id: string, enabled: boolean): Promise<void> {
    await updateCronJob(id, { enabled });
}

/** Get all cron jobs for an org */
export async function getCronJobs(orgId: string): Promise<CronJob[]> {
    const q = query(
        collection(db, CRON_COLLECTION),
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            projectId: data.projectId,
            name: data.name,
            message: data.message,
            schedule: data.schedule,
            scheduleLabel: data.scheduleLabel,
            targetChannelId: data.targetChannelId,
            agentIds: data.agentIds,
            priority: data.priority,
            enabled: data.enabled ?? true,
            createdBy: data.createdBy,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
            lastRun: data.lastRun
                ? {
                    time: data.lastRun.time instanceof Timestamp ? data.lastRun.time.toDate() : new Date(data.lastRun.time),
                    success: data.lastRun.success,
                    error: data.lastRun.error,
                    durationMs: data.lastRun.durationMs,
                }
                : undefined,
            nextRun: data.nextRun instanceof Timestamp ? data.nextRun.toDate() : undefined,
        } as CronJob;
    });
}
