/**
 * POST /api/v1/hcs/submit-event
 *
 * Submit a score event to the HCS reputation topic.
 * Called automatically when agent actions occur (task complete, skill report, etc.).
 *
 * Body: ScoreEvent
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { submitScoreEvent, isHCSConfigured, type ScoreEvent } from "@/lib/hedera-hcs-client";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!isHCSConfigured()) {
            return NextResponse.json(
                {
                    error: "HCS not configured",
                    hint: "Set HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, and HEDERA_REPUTATION_TOPIC_ID in .env",
                },
                { status: 503 },
            );
        }

        const event: ScoreEvent = await req.json();

        // Validate event
        if (!event.type || !event.asn || typeof event.creditDelta !== "number") {
            return NextResponse.json(
                { error: "Invalid score event: missing required fields" },
                { status: 400 },
            );
        }

        // Submit to HCS
        const result = await submitScoreEvent(event);

        return NextResponse.json({
            success: true,
            txId: result.txId,
            consensusTimestamp: result.consensusTimestamp,
            event,
            message: `✅ Score event submitted to HCS (${event.type}: ${event.creditDelta > 0 ? '+' : ''}${event.creditDelta} credit)`,
        });
    } catch (error) {
        console.error("HCS submit event error:", error);
        return NextResponse.json(
            {
                error: "Failed to submit score event",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
