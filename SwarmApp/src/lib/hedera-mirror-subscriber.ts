/**
 * Hedera Mirror Node Subscriber
 *
 * Subscribes to HCS topic messages via Mirror Node REST API.
 * Computes real-time reputation scores from score event stream.
 *
 * Architecture:
 * - Polls Mirror Node API for new messages on the reputation topic
 * - Parses score delta events
 * - Computes running credit/trust scores
 * - Updates Firestore in real-time
 * - Triggers UI live updates via Firestore listeners
 *
 * Mirror Node API: https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages
 */

import { db } from "@/lib/firebase";
import { collection, doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { getReputationTopicId, type ScoreEvent } from "./hedera-hcs-client";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Mirror Node message response */
interface MirrorMessage {
    consensus_timestamp: string;
    topic_id: string;
    message: string; // Base64-encoded
    sequence_number: number;
    running_hash: string;
    running_hash_version: number;
}

interface MirrorMessagesResponse {
    messages: MirrorMessage[];
    links: {
        next: string | null;
    };
}

/** Score accumulator state */
interface ScoreState {
    asn: string;
    agentAddress: string;
    creditScore: number;
    trustScore: number;
    lastEventTimestamp: number;
    eventCount: number;
}

// ═══════════════════════════════════════════════════════════════
// Mirror Node API
// ═══════════════════════════════════════════════════════════════

const MIRROR_NODE_URL = process.env.HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";

/**
 * Fetch messages from HCS topic via Mirror Node API.
 * Supports pagination via `next` link.
 */
async function fetchTopicMessages(
    topicId: string,
    sequenceNumber?: number,
): Promise<MirrorMessagesResponse> {
    const url = sequenceNumber
        ? `${MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages?sequencenumber=gte:${sequenceNumber}&limit=100`
        : `${MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages?limit=100`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Mirror Node API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Decode a Base64-encoded HCS message to a ScoreEvent.
 */
function decodeScoreEvent(base64Message: string): ScoreEvent | null {
    try {
        const jsonStr = Buffer.from(base64Message, "base64").toString("utf-8");
        const event = JSON.parse(jsonStr) as ScoreEvent;

        // Validate event structure
        if (!event.type || !event.asn || typeof event.creditDelta !== "number") {
            console.warn("Invalid score event structure:", event);
            return null;
        }

        return event;
    } catch (error) {
        console.error("Failed to decode score event:", error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// Score Computation
// ═══════════════════════════════════════════════════════════════

/** In-memory score state cache (ASN → ScoreState) */
const scoreCache = new Map<string, ScoreState>();

/**
 * Process a score event and update running scores.
 * Returns the updated score state.
 */
function processScoreEvent(event: ScoreEvent): ScoreState {
    let state = scoreCache.get(event.asn);

    if (!state) {
        // Initialize state from event (or use defaults)
        state = {
            asn: event.asn,
            agentAddress: event.agentAddress,
            creditScore: 680, // Default starting score
            trustScore: 50,
            lastEventTimestamp: event.timestamp,
            eventCount: 0,
        };
    }

    // Apply delta
    state.creditScore += event.creditDelta;
    state.trustScore += event.trustDelta;

    // Clamp scores to valid ranges
    state.creditScore = Math.max(300, Math.min(900, state.creditScore)); // 300-900
    state.trustScore = Math.max(0, Math.min(100, state.trustScore)); // 0-100

    state.lastEventTimestamp = event.timestamp;
    state.eventCount++;

    scoreCache.set(event.asn, state);

    return state;
}

/**
 * Sync computed scores to Firestore.
 * Updates all agents with matching ASN.
 */
async function syncScoresToFirestore(state: ScoreState): Promise<void> {
    try {
        // Find agent by ASN
        const agentsRef = collection(db, "agents");
        const agentQuery = await getDoc(doc(agentsRef, state.asn)); // Assuming ASN is doc ID or we query by field

        // For now, let's query by agentAddress (more reliable)
        // In production, you'd have an ASN index
        const snapshot = await getDoc(doc(agentsRef, state.agentAddress));

        if (!snapshot.exists()) {
            console.warn(`No agent found for ASN ${state.asn}, skipping Firestore sync`);
            return;
        }

        // Update Firestore with new scores
        await updateDoc(doc(agentsRef, snapshot.id), {
            creditScore: state.creditScore,
            trustScore: state.trustScore,
            lastScoreUpdate: serverTimestamp(),
            scoreEventCount: state.eventCount,
        });

        console.log(`✅ Synced scores for ASN ${state.asn}: credit=${state.creditScore}, trust=${state.trustScore}`);
    } catch (error) {
        console.error("Failed to sync scores to Firestore:", error);
    }
}

// ═══════════════════════════════════════════════════════════════
// Subscriber
// ═══════════════════════════════════════════════════════════════

let isSubscribing = false;
let lastProcessedSequence = 0;

/**
 * Start subscribing to HCS topic messages.
 * Polls Mirror Node API every 10 seconds for new messages.
 */
export async function startMirrorNodeSubscriber(): Promise<void> {
    const topicId = getReputationTopicId();
    if (!topicId) {
        console.warn("⚠️  HCS reputation topic not configured - subscriber disabled");
        return;
    }

    if (isSubscribing) {
        console.warn("Mirror Node subscriber already running");
        return;
    }

    isSubscribing = true;
    console.log(`🔄 Starting Mirror Node subscriber for topic ${topicId.toString()}`);

    // Poll every 10 seconds
    setInterval(async () => {
        try {
            const response = await fetchTopicMessages(
                topicId.toString(),
                lastProcessedSequence > 0 ? lastProcessedSequence + 1 : undefined,
            );

            for (const message of response.messages) {
                const event = decodeScoreEvent(message.message);
                if (!event) continue;

                // Process event and compute new scores
                const state = processScoreEvent(event);

                // Sync to Firestore (triggers live UI updates via listeners)
                await syncScoresToFirestore(state);

                // Update last processed sequence
                lastProcessedSequence = message.sequence_number;
            }

            if (response.messages.length > 0) {
                console.log(`✅ Processed ${response.messages.length} score events (seq ${lastProcessedSequence})`);
            }
        } catch (error) {
            console.error("Mirror Node subscriber error:", error);
        }
    }, 10000); // Poll every 10 seconds
}

/**
 * Stop the subscriber.
 */
export function stopMirrorNodeSubscriber(): void {
    isSubscribing = false;
    console.log("🛑 Stopped Mirror Node subscriber");
}

/**
 * Get current score state from cache (for debugging).
 */
export function getScoreState(asn: string): ScoreState | undefined {
    return scoreCache.get(asn);
}

/**
 * Get all cached score states (for debugging).
 */
export function getAllScoreStates(): ScoreState[] {
    return Array.from(scoreCache.values());
}
