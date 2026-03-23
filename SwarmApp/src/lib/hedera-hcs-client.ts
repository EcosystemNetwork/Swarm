/**
 * Hedera Consensus Service (HCS) Client
 *
 * Real-time event-sourced reputation system using HCS topics.
 * Architecture: Agent Action → HCS Topic → Mirror Node Stream → Scoring Engine → Live UI → Periodic Contract Checkpoint
 *
 * Three Layers:
 * 1. Real-time truth-in-motion: HCS events (every agent action emits signed score event)
 * 2. Fast computed score: Off-chain scorer (consumes HCS stream in real-time)
 * 3. Auditable canonical state: Hedera smart contract (periodic checkpoints only)
 *
 * Requires: @hashgraph/sdk
 * Install: npm install @hashgraph/sdk
 */

import {
    Client,
    TopicId,
    TopicCreateTransaction,
    TopicMessageSubmitTransaction,
    PrivateKey,
    AccountId,
} from "@hashgraph/sdk";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Score delta event — compact JSON submitted to HCS topic */
export interface ScoreEvent {
    /** Event type */
    type: "task_complete" | "task_fail" | "skill_report" | "penalty" | "bonus" | "checkpoint";
    /** Agent ASN */
    asn: string;
    /** Agent wallet address */
    agentAddress: string;
    /** Credit score delta (+ or -) */
    creditDelta: number;
    /** Trust score delta (+ or -) */
    trustDelta: number;
    /** Event timestamp (Unix seconds) */
    timestamp: number;
    /** Event metadata (task ID, reason, etc.) */
    metadata?: Record<string, unknown>;
    /** Signature (ECDSA over event data, signed by platform or agent) */
    signature?: string;
}

/** HCS topic configuration */
export interface HCSTopicConfig {
    /** Topic ID (e.g., "0.0.12345") */
    topicId: string;
    /** Topic memo/description */
    memo: string;
    /** Submit key (who can submit messages) */
    submitKey?: string;
}

// ═══════════════════════════════════════════════════════════════
// Client Setup
// ═══════════════════════════════════════════════════════════════

/** Get Hedera client for testnet */
function getHederaClient(): Client {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
        throw new Error(
            "Hedera HCS not configured: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY required",
        );
    }

    const client = Client.forTestnet();
    client.setOperator(
        AccountId.fromString(operatorId),
        PrivateKey.fromString(operatorKey),
    );

    return client;
}

/** Get the configured HCS topic ID for reputation events */
export function getReputationTopicId(): TopicId | null {
    const topicIdStr = process.env.HEDERA_REPUTATION_TOPIC_ID;
    if (!topicIdStr) {
        console.warn("HEDERA_REPUTATION_TOPIC_ID not set - HCS reputation disabled");
        return null;
    }
    return TopicId.fromString(topicIdStr);
}

// ═══════════════════════════════════════════════════════════════
// Topic Management
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new HCS topic for reputation events.
 * This should be run once during initial setup.
 */
export async function createReputationTopic(memo: string = "Swarm Agent Reputation Events"): Promise<string> {
    const client = getHederaClient();

    const transaction = new TopicCreateTransaction()
        .setTopicMemo(memo)
        .setMaxTransactionFee(2); // 2 HBAR max fee

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const topicId = receipt.topicId;

    if (!topicId) {
        throw new Error("Failed to create HCS topic");
    }

    console.log(`✅ Created HCS topic: ${topicId.toString()}`);
    console.log(`⚙️  Set HEDERA_REPUTATION_TOPIC_ID=${topicId.toString()} in .env`);

    return topicId.toString();
}

// ═══════════════════════════════════════════════════════════════
// Event Submission
// ═══════════════════════════════════════════════════════════════

/**
 * Submit a score event to the HCS reputation topic.
 * Returns the transaction ID and consensus timestamp.
 */
export async function submitScoreEvent(event: ScoreEvent): Promise<{ txId: string; consensusTimestamp: string }> {
    const topicId = getReputationTopicId();
    if (!topicId) {
        throw new Error("HCS reputation topic not configured");
    }

    const client = getHederaClient();

    // Compact JSON encoding (max 1024 bytes per HCS message)
    const eventJson = JSON.stringify(event);
    const eventBytes = Buffer.from(eventJson, "utf-8");

    if (eventBytes.length > 1024) {
        throw new Error(`Score event too large (${eventBytes.length} bytes, max 1024)`);
    }

    const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(eventBytes);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return {
        txId: txResponse.transactionId.toString(),
        consensusTimestamp: receipt.topicSequenceNumber?.toString() || "unknown",
    };
}

/**
 * Batch submit multiple score events (for periodic checkpoint sync).
 * Submits events one by one (HCS doesn't support true batching, but this optimizes API calls).
 */
export async function submitScoreEventBatch(events: ScoreEvent[]): Promise<string[]> {
    const txIds: string[] = [];

    for (const event of events) {
        const result = await submitScoreEvent(event);
        txIds.push(result.txId);
    }

    return txIds;
}

// ═══════════════════════════════════════════════════════════════
// Event Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Create a task completion score event.
 * Increases credit score (+5-20 depending on complexity) and trust score (+1-5).
 */
export function createTaskCompleteEvent(
    asn: string,
    agentAddress: string,
    taskId: string,
    complexity: "simple" | "medium" | "complex" = "medium",
): ScoreEvent {
    const creditDelta = complexity === "complex" ? 20 : complexity === "medium" ? 10 : 5;
    const trustDelta = complexity === "complex" ? 5 : complexity === "medium" ? 2 : 1;

    return {
        type: "task_complete",
        asn,
        agentAddress,
        creditDelta,
        trustDelta,
        timestamp: Math.floor(Date.now() / 1000),
        metadata: { taskId, complexity },
    };
}

/**
 * Create a task failure score event.
 * Decreases credit score (-5-15) and trust score (-1-3).
 */
export function createTaskFailEvent(
    asn: string,
    agentAddress: string,
    taskId: string,
    reason: string,
): ScoreEvent {
    return {
        type: "task_fail",
        asn,
        agentAddress,
        creditDelta: -10,
        trustDelta: -2,
        timestamp: Math.floor(Date.now() / 1000),
        metadata: { taskId, reason },
    };
}

/**
 * Create a skill report event.
 * Small credit boost for self-reporting skills (+2).
 */
export function createSkillReportEvent(
    asn: string,
    agentAddress: string,
    skills: string[],
): ScoreEvent {
    return {
        type: "skill_report",
        asn,
        agentAddress,
        creditDelta: 2,
        trustDelta: 1,
        timestamp: Math.floor(Date.now() / 1000),
        metadata: { skills },
    };
}

/**
 * Create a penalty event.
 * Large credit/trust decrease (requires governance approval for amounts > -50).
 */
export function createPenaltyEvent(
    asn: string,
    agentAddress: string,
    amount: number,
    reason: string,
): ScoreEvent {
    return {
        type: "penalty",
        asn,
        agentAddress,
        creditDelta: -Math.abs(amount),
        trustDelta: -Math.floor(Math.abs(amount) / 5),
        timestamp: Math.floor(Date.now() / 1000),
        metadata: { reason },
    };
}

/**
 * Create a checkpoint event.
 * Records the final computed score to the blockchain (no delta, just snapshot).
 */
export function createCheckpointEvent(
    asn: string,
    agentAddress: string,
    finalCreditScore: number,
    finalTrustScore: number,
): ScoreEvent {
    return {
        type: "checkpoint",
        asn,
        agentAddress,
        creditDelta: 0, // Checkpoint doesn't change score, just records it
        trustDelta: 0,
        timestamp: Math.floor(Date.now() / 1000),
        metadata: {
            checkpoint: true,
            finalCreditScore,
            finalTrustScore,
        },
    };
}

// ═══════════════════════════════════════════════════════════════
// Configuration Check
// ═══════════════════════════════════════════════════════════════

/** Check if HCS is configured and ready to use */
export function isHCSConfigured(): boolean {
    return !!(
        process.env.HEDERA_OPERATOR_ID &&
        process.env.HEDERA_OPERATOR_KEY &&
        process.env.HEDERA_REPUTATION_TOPIC_ID
    );
}
