/**
 * GET /api/v1/analytics/score-history?asn=ASN-SWM-2026-XXXX-XXXX-XX&limit=100
 *
 * Fetch full score event history for an agent from HCS Mirror Node.
 * Returns timeline of all score events with cumulative scores.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { getReputationTopicId, type ScoreEvent } from "@/lib/hedera-hcs-client";

const MIRROR_NODE_URL = process.env.HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";

interface MirrorMessage {
    consensus_timestamp: string;
    message: string; // Base64
    sequence_number: number;
}

interface ScoreHistoryEntry {
    timestamp: string;
    sequenceNumber: number;
    event: ScoreEvent;
    cumulativeCreditScore: number;
    cumulativeTrustScore: number;
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const asn = searchParams.get("asn");
        const limit = parseInt(searchParams.get("limit") || "100");

        if (!asn) {
            return NextResponse.json(
                { error: "Missing ASN parameter" },
                { status: 400 },
            );
        }

        const topicId = getReputationTopicId();
        if (!topicId) {
            return NextResponse.json(
                { error: "HCS reputation topic not configured" },
                { status: 503 },
            );
        }

        // Fetch messages from Mirror Node
        const url = `${MIRROR_NODE_URL}/api/v1/topics/${topicId.toString()}/messages?limit=${limit}&order=asc`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Mirror Node API error: ${response.status}`);
        }

        const data = await response.json();
        const messages: MirrorMessage[] = data.messages || [];

        // Decode and filter events for this ASN
        const history: ScoreHistoryEntry[] = [];
        let cumulativeCredit = 680; // Default starting score
        let cumulativeTrust = 50;
        let foundFirst = false;

        for (const message of messages) {
            try {
                const jsonStr = Buffer.from(message.message, "base64").toString("utf-8");
                const event = JSON.parse(jsonStr) as ScoreEvent;

                if (event.asn === asn) {
                    // First event for this ASN sets the baseline
                    if (!foundFirst) {
                        foundFirst = true;
                        // If there's checkpoint data, use it
                        if (event.type === "checkpoint" && event.metadata?.finalCreditScore) {
                            cumulativeCredit = event.metadata.finalCreditScore as number;
                            cumulativeTrust = event.metadata.finalTrustScore as number;
                        }
                    }

                    // Apply delta
                    cumulativeCredit += event.creditDelta;
                    cumulativeTrust += event.trustDelta;

                    // Clamp to valid ranges
                    cumulativeCredit = Math.max(300, Math.min(900, cumulativeCredit));
                    cumulativeTrust = Math.max(0, Math.min(100, cumulativeTrust));

                    history.push({
                        timestamp: message.consensus_timestamp,
                        sequenceNumber: message.sequence_number,
                        event,
                        cumulativeCreditScore: cumulativeCredit,
                        cumulativeTrustScore: cumulativeTrust,
                    });
                }
            } catch (error) {
                // Skip invalid messages
                continue;
            }
        }

        return NextResponse.json({
            asn,
            eventCount: history.length,
            currentCreditScore: cumulativeCredit,
            currentTrustScore: cumulativeTrust,
            history,
        });
    } catch (error) {
        console.error("Score history error:", error);
        return NextResponse.json(
            {
                error: "Failed to fetch score history",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
