/**
 * POST /api/v1/staking/resolve-stake
 *
 * Resolve a validation stake (org owner decision).
 *
 * Body: { stakeId, actualOutcome: "correct" | "incorrect" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { resolveValidationStake } from "@/lib/hedera-staking";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // TODO: Check if user is org owner

        const { stakeId, actualOutcome } = await req.json();

        if (!stakeId || !actualOutcome) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        if (actualOutcome !== "correct" && actualOutcome !== "incorrect") {
            return NextResponse.json(
                { error: "Invalid outcome (must be 'correct' or 'incorrect')" },
                { status: 400 },
            );
        }

        await resolveValidationStake(stakeId, actualOutcome);

        return NextResponse.json({
            success: true,
            stakeId,
            actualOutcome,
            message: actualOutcome === "correct"
                ? "✅ Validator was correct - earned bonus reward"
                : "❌ Validator was incorrect - stake slashed",
        });
    } catch (error) {
        console.error("Resolve stake error:", error);
        return NextResponse.json(
            {
                error: "Failed to resolve stake",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
