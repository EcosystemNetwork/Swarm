/**
 * POST /api/v1/hcs/init
 *
 * Initialize HCS reputation system by creating a new topic.
 * Run this once during initial setup.
 * Returns the topic ID to set in HEDERA_REPUTATION_TOPIC_ID env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { createReputationTopic } from "@/lib/hedera-hcs-client";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // TODO: Add admin check - only platform admins should be able to create topics

        const topicId = await createReputationTopic();

        return NextResponse.json({
            success: true,
            topicId,
            message: `✅ Created HCS reputation topic: ${topicId}`,
            nextSteps: [
                `Set HEDERA_REPUTATION_TOPIC_ID=${topicId} in .env`,
                "Restart the application",
                "Start the mirror node subscriber via POST /api/v1/hcs/start-subscriber",
            ],
        });
    } catch (error) {
        console.error("HCS init error:", error);
        return NextResponse.json(
            {
                error: "Failed to initialize HCS",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
