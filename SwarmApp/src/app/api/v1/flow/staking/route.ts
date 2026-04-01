/**
 * GET  /api/v1/flow/staking  — List staking positions
 * POST /api/v1/flow/staking  — Create a staking position
 */
import { NextRequest } from "next/server";
import { createStakingPosition, getStakingPositions, getStakingStats } from "@/lib/flow-superpowers";
import { logFlowAudit } from "@/lib/flow-policy";
import { incrementFlowASNStat } from "@/lib/flow-asn";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const positions = await getStakingPositions(orgId);
    const stats = getStakingStats(positions);
    return Response.json({ positions, stats });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, agentId, asn, delegatorAddress, validatorNodeId, validatorName, stakedAmount, estimatedApy, stakeTxHash } = body;

        if (!orgId || !delegatorAddress || !validatorNodeId || !stakedAmount) {
            return Response.json({ error: "orgId, delegatorAddress, validatorNodeId, and stakedAmount required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const position = await createStakingPosition({
            orgId, agentId: agentId || null, asn: asn || null,
            delegatorAddress, validatorNodeId, validatorName: validatorName || "",
            stakedAmount, estimatedApy: estimatedApy || 5.0,
            status: "active", stakeTxHash: stakeTxHash || null,
        });

        if (asn) await incrementFlowASNStat(asn, "totalStaked", stakedAmount).catch(() => {});

        await logFlowAudit({
            orgId, event: "payment_created", paymentId: null, subscriptionId: null,
            fromAddress: delegatorAddress, toAddress: validatorNodeId,
            amount: stakedAmount, txHash: stakeTxHash, policyResult: null,
            reviewedBy: null, note: `FLOW staked to validator ${validatorName || validatorNodeId}`,
        });

        return Response.json({ position }, { status: 201 });
    } catch (err) {
        console.error("[flow/staking POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
