/**
 * GET /api/v1/trust/status
 *
 * Trust layer health check. Returns service status, reachability,
 * latest checkpoint info, and overall health assessment.
 *
 * Public endpoint — no authentication required.
 */

import { NextResponse } from "next/server";
import { getTrustLayerStatus } from "@/lib/hedera-trust-verification";

export async function GET() {
    try {
        const status = await getTrustLayerStatus();
        return NextResponse.json(status);
    } catch (error) {
        console.error("Trust layer status error:", error);
        return NextResponse.json(
            {
                error: "Failed to get trust layer status",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
