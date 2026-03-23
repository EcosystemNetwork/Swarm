/**
 * GET /api/v1/staking/stats?asn=ASN-SWM-2026-XXXX-XXXX-XX
 *
 * Get staking pool stats for an agent (validator).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { getStakingPoolStats, getPendingValidations } from "@/lib/hedera-staking";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const asn = searchParams.get("asn");

        if (!asn) {
            return NextResponse.json(
                { error: "Missing ASN parameter" },
                { status: 400 },
            );
        }

        const stats = await getStakingPoolStats(asn);
        const pendingValidations = await getPendingValidations(asn);

        return NextResponse.json({
            ...stats,
            pendingValidations: pendingValidations.map(v => ({
                id: v.id,
                taskId: v.taskId,
                workerASN: v.workerASN,
                stakeAmount: v.stakeAmount,
                validationStatus: v.validationStatus,
                createdAt: v.createdAt,
            })),
        });
    } catch (error) {
        console.error("Get staking stats error:", error);
        return NextResponse.json(
            {
                error: "Failed to get staking stats",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
