/**
 * POST /api/v1/flow/simulate — Simulate a payment against policy (dry run)
 */
import { NextRequest } from "next/server";
import { checkFlowPolicy } from "@/lib/flow-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
    try {
        const { orgId, toAddress, amount } = await req.json() as {
            orgId: string; toAddress: string; amount: string;
        };

        if (!orgId || !toAddress || !amount) {
            return Response.json({ error: "orgId, toAddress, and amount are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const result = await checkFlowPolicy({ orgId, toAddress, amount });
        return Response.json({
            allowed: result.allowed,
            requiresApproval: result.requiresApproval,
            reason: result.reason,
            remainingDaily: result.remainingDaily,
        });
    } catch (err) {
        console.error("[flow/simulate]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
