/**
 * Hedera Score Event Emitter
 *
 * Helper functions to emit score events from anywhere in the codebase.
 * Automatically submits events to HCS if configured, otherwise logs a warning.
 */

import {
    submitScoreEvent,
    isHCSConfigured,
    createTaskCompleteEvent,
    createTaskFailEvent,
    createSkillReportEvent,
    createPenaltyEvent,
    createAdminOverrideEvent,
    type ScoreEvent,
} from "./hedera-hcs-client";

// ═══════════════════════════════════════════════════════════════
// Event Emitters
// ═══════════════════════════════════════════════════════════════

/**
 * Emit a score event (submits to HCS if configured, otherwise no-op).
 * Non-blocking — errors are logged but don't interrupt the calling code.
 */
async function emitScoreEvent(event: ScoreEvent): Promise<void> {
    if (!isHCSConfigured()) {
        console.warn("⚠️  HCS not configured - score event not submitted:", event.type);
        return;
    }

    try {
        const result = await submitScoreEvent(event);
        console.log(`✅ Score event submitted: ${event.type} (${event.creditDelta > 0 ? '+' : ''}${event.creditDelta} credit) - TX ${result.txId}`);
    } catch (error) {
        console.error("Failed to emit score event:", error);
    }
}

/**
 * Emit a task completion event.
 * Call this when an agent completes a task successfully.
 */
export async function emitTaskComplete(
    asn: string,
    agentAddress: string,
    taskId: string,
    complexity: "simple" | "medium" | "complex" = "medium",
): Promise<void> {
    const event = createTaskCompleteEvent(asn, agentAddress, taskId, complexity);
    await emitScoreEvent(event);
}

/**
 * Emit a task failure event.
 * Call this when an agent fails a task.
 */
export async function emitTaskFail(
    asn: string,
    agentAddress: string,
    taskId: string,
    reason: string,
): Promise<void> {
    const event = createTaskFailEvent(asn, agentAddress, taskId, reason);
    await emitScoreEvent(event);
}

/**
 * Emit a skill report event.
 * Call this when an agent reports new skills on registration/heartbeat.
 */
export async function emitSkillReport(
    asn: string,
    agentAddress: string,
    skills: string[],
): Promise<void> {
    const event = createSkillReportEvent(asn, agentAddress, skills);
    await emitScoreEvent(event);
}

/**
 * Emit a penalty event.
 * Call this when an agent receives a penalty (requires governance approval for large amounts).
 */
export async function emitPenalty(
    asn: string,
    agentAddress: string,
    amount: number,
    reason: string,
): Promise<void> {
    const event = createPenaltyEvent(asn, agentAddress, amount, reason);

    // Large penalties (> -50 credit) should require governance approval
    if (Math.abs(amount) > 50) {
        console.warn(`⚠️  Large penalty (${amount}) - should use Hedera Schedule Service for multi-party approval`);
        // TODO: Implement Scheduled Transaction flow for governance
    }

    await emitScoreEvent(event);
}

/**
 * Emit an admin override event.
 * Call this when a platform admin manually adjusts an agent's score.
 */
export async function emitAdminOverride(
    asn: string,
    agentAddress: string,
    creditDelta: number,
    trustDelta: number,
    reason: string,
    overrideId?: string,
): Promise<void> {
    const event = createAdminOverrideEvent(asn, agentAddress, creditDelta, trustDelta, reason, overrideId);
    await emitScoreEvent(event);
}
