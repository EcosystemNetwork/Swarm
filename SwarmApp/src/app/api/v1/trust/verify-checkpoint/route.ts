/**
 * GET /api/v1/trust/verify-checkpoint?epoch=42
 *
 * Verify a checkpoint's hash against stored and recomputed values.
 * Recomputes SHA-256 state hash from the snapshot's agents array
 * and compares against the stored hash and HCS-published hash.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import { verifyCheckpoint } from "@/lib/hedera-trust-verification";

export async function GET(req: NextRequest) {
    try {
        const session = await validateSession();
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const epochStr = searchParams.get("epoch");

        if (!epochStr) {
            return NextResponse.json(
                { error: "Missing required parameter: epoch" },
                { status: 400 },
            );
        }

        const epoch = parseInt(epochStr, 10);
        if (isNaN(epoch) || epoch < 1) {
            return NextResponse.json(
                { error: "Invalid epoch: must be a positive integer" },
                { status: 400 },
            );
        }

        const result = await verifyCheckpoint(epoch);
        return NextResponse.json(result);
    } catch (error) {
        console.error("Checkpoint verification error:", error);
        return NextResponse.json(
            {
                error: "Failed to verify checkpoint",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
