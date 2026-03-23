/**
 * POST /api/v1/hcs/start-checkpoint
 *
 * Start the periodic checkpoint service.
 * Writes computed scores to the NFT contract every hour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { startCheckpointService } from "@/lib/hedera-checkpoint-service";
import { isHCSConfigured } from "@/lib/hedera-hcs-client";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // TODO: Add admin check - only platform admins should be able to start checkpoint service

        if (!isHCSConfigured()) {
            return NextResponse.json(
                {
                    error: "HCS not configured",
                    hint: "Set HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, and HEDERA_REPUTATION_TOPIC_ID in .env",
                },
                { status: 503 },
            );
        }

        const platformKey = process.env.HEDERA_PLATFORM_KEY;
        if (!platformKey) {
            return NextResponse.json(
                {
                    error: "HEDERA_PLATFORM_KEY not set - required for checkpointing scores to NFT contract",
                },
                { status: 503 },
            );
        }

        // Start checkpoint service (runs in background)
        startCheckpointService();

        return NextResponse.json({
            success: true,
            message: "✅ Checkpoint service started - scores will be written to NFT contract every hour",
            info: "Periodic checkpoints create auditable on-chain state while keeping real-time scores fast",
        });
    } catch (error) {
        console.error("HCS start checkpoint error:", error);
        return NextResponse.json(
            {
                error: "Failed to start checkpoint service",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
