/**
 * POST /api/v1/hcs/start-subscriber
 *
 * Start the Mirror Node subscriber to listen for HCS score events.
 * This should be called once after server startup to begin real-time score computation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { startMirrorNodeSubscriber } from "@/lib/hedera-mirror-subscriber";
import { isHCSConfigured } from "@/lib/hedera-hcs-client";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // TODO: Add admin check - only platform admins should be able to start subscriber

        if (!isHCSConfigured()) {
            return NextResponse.json(
                {
                    error: "HCS not configured",
                    hint: "Set HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, and HEDERA_REPUTATION_TOPIC_ID in .env",
                },
                { status: 503 },
            );
        }

        // Start subscriber (runs in background)
        await startMirrorNodeSubscriber();

        return NextResponse.json({
            success: true,
            message: "✅ Mirror Node subscriber started - now listening for score events",
            info: "Subscriber polls Mirror Node API every 10 seconds for new HCS messages",
        });
    } catch (error) {
        console.error("HCS start subscriber error:", error);
        return NextResponse.json(
            {
                error: "Failed to start subscriber",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
