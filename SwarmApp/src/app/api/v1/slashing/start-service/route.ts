/**
 * POST /api/v1/slashing/start-service
 *
 * Start the auto-slashing service for missed deadlines.
 * Checks for overdue tasks every 15 minutes and auto-penalizes agents.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { startSlashingService } from "@/lib/hedera-slashing";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // TODO: Add admin check

        startSlashingService();

        return NextResponse.json({
            success: true,
            message: "⚔️ Auto-slashing service started - agents will be penalized for missed deadlines",
            info: "Checks every 15 minutes for overdue tasks and applies penalties based on lateness",
            penalties: {
                "< 24h late": "-5 credit, -1 trust",
                "> 24h late": "-15 credit, -3 trust",
                "> 7 days late": "-30 credit, -5 trust (abandoned)",
            },
        });
    } catch (error) {
        console.error("Start slashing service error:", error);
        return NextResponse.json(
            {
                error: "Failed to start slashing service",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
