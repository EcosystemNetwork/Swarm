/**
 * POST /api/v1/trust/init
 *
 * Initialize all trust layer services:
 * - Mirror node subscriber
 * - Checkpoint service
 * - Reconciliation service
 *
 * Auth: session required (platform admin).
 */

import { NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import { initTrustLayer } from "@/lib/hedera-trust-init";

export async function POST() {
    try {
        const session = await validateSession();
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result = await initTrustLayer();

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error("Trust layer init error:", error);
        return NextResponse.json(
            {
                error: "Failed to initialize trust layer",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
