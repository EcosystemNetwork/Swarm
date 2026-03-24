/**
 * Hedera Trust Layer — Initialization & Orchestration
 *
 * Single entry point to start/stop all trust layer services:
 * - Mirror node subscriber (real-time HCS event processing)
 * - Checkpoint service (periodic on-chain score snapshots)
 * - Reconciliation service (periodic consistency checks)
 *
 * Safe for Netlify: logs warnings instead of calling process.exit().
 */

import { startMirrorNodeSubscriber, stopMirrorNodeSubscriber } from "./hedera-mirror-subscriber";
import { startCheckpointService, stopCheckpointService } from "./hedera-checkpoint-service";
import { startReconciliationService, stopReconciliationService } from "./hedera-reconciliation";
import { isHCSConfigured } from "./hedera-hcs-client";

export interface TrustLayerInitResult {
    subscriberStarted: boolean;
    checkpointStarted: boolean;
    reconciliationStarted: boolean;
    warnings: string[];
}

/**
 * Initialize and start all trust layer services.
 */
export async function initTrustLayer(): Promise<TrustLayerInitResult> {
    const warnings: string[] = [];
    let subscriberStarted = false;
    let checkpointStarted = false;
    let reconciliationStarted = false;

    // Check prerequisites
    if (!isHCSConfigured()) {
        warnings.push("HCS not configured (HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_REPUTATION_TOPIC_ID required)");
        console.warn("[TrustLayer] HCS not configured — trust layer running in degraded mode");
        return { subscriberStarted, checkpointStarted, reconciliationStarted, warnings };
    }

    // Start mirror node subscriber
    try {
        await startMirrorNodeSubscriber();
        subscriberStarted = true;
        console.log("[TrustLayer] Mirror node subscriber started");
    } catch (error) {
        const msg = `Mirror node subscriber failed: ${error instanceof Error ? error.message : "Unknown error"}`;
        warnings.push(msg);
        console.error(`[TrustLayer] ${msg}`);
    }

    // Start checkpoint service
    try {
        startCheckpointService();
        checkpointStarted = true;
        console.log("[TrustLayer] Checkpoint service started");
    } catch (error) {
        const msg = `Checkpoint service failed: ${error instanceof Error ? error.message : "Unknown error"}`;
        warnings.push(msg);
        console.error(`[TrustLayer] ${msg}`);
    }

    // Start reconciliation service
    try {
        startReconciliationService();
        reconciliationStarted = true;
        console.log("[TrustLayer] Reconciliation service started");
    } catch (error) {
        const msg = `Reconciliation service failed: ${error instanceof Error ? error.message : "Unknown error"}`;
        warnings.push(msg);
        console.error(`[TrustLayer] ${msg}`);
    }

    console.log(
        `[TrustLayer] Initialized: subscriber=${subscriberStarted}, checkpoint=${checkpointStarted}, reconciliation=${reconciliationStarted}`,
    );

    return { subscriberStarted, checkpointStarted, reconciliationStarted, warnings };
}

/**
 * Stop all trust layer services gracefully.
 */
export function stopTrustLayer(): void {
    stopMirrorNodeSubscriber();
    stopCheckpointService();
    stopReconciliationService();
    console.log("[TrustLayer] All services stopped");
}
