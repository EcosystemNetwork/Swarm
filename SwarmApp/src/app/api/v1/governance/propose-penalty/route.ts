/**
 * POST /api/v1/governance/propose-penalty
 *
 * Create a penalty proposal requiring multi-party approval.
 * For penalties > -50 credit.
 *
 * Body: { asn, agentAddress, creditPenalty, reason, requiredSigners[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { createPenaltyProposal } from "@/lib/hedera-governance";

interface ProposeRequest {
    asn: string;
    agentAddress: string;
    creditPenalty: number;
    reason: string;
    requiredSigners: string[]; // List of approver addresses
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body: ProposeRequest = await req.json();
        const { asn, agentAddress, creditPenalty, reason, requiredSigners } = body;

        if (!asn || !agentAddress || !creditPenalty || !reason || !requiredSigners?.length) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        if (creditPenalty >= 0) {
            return NextResponse.json(
                { error: "Penalty must be negative" },
                { status: 400 },
            );
        }

        if (Math.abs(creditPenalty) <= 50) {
            return NextResponse.json(
                { error: "Small penalties (≤ 50) don't require governance - use direct penalty API" },
                { status: 400 },
            );
        }

        const proposalId = await createPenaltyProposal(
            asn,
            agentAddress,
            creditPenalty,
            reason,
            session.address,
            requiredSigners,
        );

        return NextResponse.json({
            success: true,
            proposalId,
            message: `✅ Penalty proposal created: ${creditPenalty} credit for ${asn}`,
            requiredApprovals: requiredSigners.length,
            status: "pending",
        });
    } catch (error) {
        console.error("Propose penalty error:", error);
        return NextResponse.json(
            {
                error: "Failed to create penalty proposal",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
