/**
 * Hedera Slashing System
 *
 * Auto-penalize agents that miss task deadlines or violate SLAs.
 * Runs as a background job checking for overdue tasks.
 *
 * Slashing Rules:
 * - Missed deadline (< 24h late): -5 credit, -1 trust
 * - Severely late (> 24h): -15 credit, -3 trust
 * - Abandoned task (> 7 days): -30 credit, -5 trust
 * - SLA violation: Custom penalty based on severity
 */

import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { emitPenalty } from "./hedera-score-emitter";
import { flagAgentForReview } from "./credit-ops/review";
import type { Task, Agent } from "./firestore";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SlashingEvent {
    taskId: string;
    agentId: string;
    asn: string;
    agentAddress: string;
    reason: "missed_deadline" | "severely_late" | "abandoned" | "sla_violation";
    creditPenalty: number;
    trustPenalty: number;
    slashedAt: unknown;
}

interface TaskWithDeadline extends Task {
    deadline?: number; // Unix timestamp
    assignedAt?: unknown;
}

// ═══════════════════════════════════════════════════════════════
// Slashing Logic
// ═══════════════════════════════════════════════════════════════

/**
 * Check all in-progress tasks and slash agents for missed deadlines.
 */
export async function checkAndSlashOverdueTasks(): Promise<SlashingEvent[]> {
    const now = Math.floor(Date.now() / 1000);
    const slashingEvents: SlashingEvent[] = [];

    // Fetch all in-progress tasks
    const tasksRef = collection(db, "tasks");
    const q = query(tasksRef, where("status", "==", "in_progress"));
    const snapshot = await getDocs(q);

    for (const taskDoc of snapshot.docs) {
        const task = { id: taskDoc.id, ...taskDoc.data() } as TaskWithDeadline;

        if (!task.deadline || !task.assigneeAgentId) continue;

        const hoursLate = (now - task.deadline) / 3600;

        if (hoursLate <= 0) continue; // Not late yet

        // Get agent details
        const agentDoc = await getDocs(
            query(collection(db, "agents"), where("id", "==", task.assigneeAgentId)),
        );

        if (agentDoc.empty) continue;

        const agent = agentDoc.docs[0].data() as Agent;

        if (!agent.asn || !agent.walletAddress) continue;

        // Determine penalty based on lateness
        let creditPenalty: number;
        let trustPenalty: number;
        let reason: SlashingEvent["reason"];

        if (hoursLate > 168) { // > 7 days
            creditPenalty = 30;
            trustPenalty = 5;
            reason = "abandoned";
        } else if (hoursLate > 24) { // > 1 day
            creditPenalty = 15;
            trustPenalty = 3;
            reason = "severely_late";
        } else { // < 24 hours
            creditPenalty = 5;
            trustPenalty = 1;
            reason = "missed_deadline";
        }

        // Check if already slashed for this task
        const alreadySlashed = await checkIfAlreadySlashed(task.id);
        if (alreadySlashed) continue;

        // Emit penalty
        await emitPenalty(
            agent.asn,
            agent.walletAddress,
            -creditPenalty,
            `AUTO-SLASH: ${reason.replace(/_/g, " ")} for task ${task.id} (${hoursLate.toFixed(1)}h late)`,
        );

        // Record slashing event
        const slashingEvent: SlashingEvent = {
            taskId: task.id,
            agentId: task.assigneeAgentId,
            asn: agent.asn,
            agentAddress: agent.walletAddress,
            reason,
            creditPenalty: -creditPenalty,
            trustPenalty: -trustPenalty,
            slashedAt: serverTimestamp(),
        };

        await recordSlashingEvent(slashingEvent);
        slashingEvents.push(slashingEvent);

        // Auto-flag agent for credit ops review
        try {
            await flagAgentForReview({
                agentId: task.assigneeAgentId,
                asn: agent.asn,
                agentAddress: agent.walletAddress,
                orgId: (agent as Record<string, unknown>).orgId as string || "",
                flagType: "slashing",
                flagReason: `Auto-slash: ${reason.replace(/_/g, " ")} for task ${task.id} (${hoursLate.toFixed(1)}h late)`,
                flaggedBy: "system",
                sourceEventId: task.id,
                priority: creditPenalty >= 30 ? "high" : "medium",
            });
        } catch (flagError) {
            console.error("Failed to flag agent for review:", flagError);
        }

        console.log(`⚔️ SLASHED ${agent.asn}: ${reason} (-${creditPenalty} credit, task ${task.id})`);
    }

    return slashingEvents;
}

/**
 * Check if task has already been slashed.
 */
async function checkIfAlreadySlashed(taskId: string): Promise<boolean> {
    const slashingRef = collection(db, "slashingEvents");
    const q = query(slashingRef, where("taskId", "==", taskId));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

/**
 * Record slashing event in Firestore.
 */
async function recordSlashingEvent(event: SlashingEvent): Promise<void> {
    const slashingRef = collection(db, "slashingEvents");
    await addDoc(slashingRef, event);
}

/**
 * Get slashing history for an agent.
 */
export async function getAgentSlashingHistory(asn: string): Promise<SlashingEvent[]> {
    const slashingRef = collection(db, "slashingEvents");
    const q = query(slashingRef, where("asn", "==", asn));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as SlashingEvent);
}

// ═══════════════════════════════════════════════════════════════
// Background Service
// ═══════════════════════════════════════════════════════════════

let slashingInterval: NodeJS.Timeout | null = null;

/**
 * Start the auto-slashing service.
 * Checks for overdue tasks every 15 minutes.
 */
export function startSlashingService(): void {
    if (slashingInterval) {
        console.warn("Slashing service already running");
        return;
    }

    console.log("⚔️ Starting auto-slashing service (interval: 15 minutes)");

    // Run immediately on start
    checkAndSlashOverdueTasks().catch(error => {
        console.error("Initial slashing check failed:", error);
    });

    // Then run every 15 minutes
    slashingInterval = setInterval(async () => {
        try {
            const events = await checkAndSlashOverdueTasks();
            if (events.length > 0) {
                console.log(`⚔️ Slashed ${events.length} agents for missed deadlines`);
            }
        } catch (error) {
            console.error("Slashing service error:", error);
        }
    }, 15 * 60 * 1000); // 15 minutes
}

/**
 * Stop the auto-slashing service.
 */
export function stopSlashingService(): void {
    if (slashingInterval) {
        clearInterval(slashingInterval);
        slashingInterval = null;
        console.log("🛑 Stopped slashing service");
    }
}
