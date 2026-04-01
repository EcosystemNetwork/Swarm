/**
 * GET  /api/v1/flow/policies  — Get active spending policy for an org
 * POST /api/v1/flow/policies  — Create or update spending policy
 */
import { NextRequest } from "next/server";
import {
    getFlowPolicy, upsertFlowPolicy, logFlowAudit, DEFAULT_FLOW_POLICY,
} from "@/lib/flow-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const policy = await getFlowPolicy(orgId);
    if (!policy) {
        return Response.json({ policy: { ...DEFAULT_FLOW_POLICY, id: null, orgId, configured: false } });
    }
    return Response.json({ policy: { ...policy, configured: true } });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            orgId, perTxCap, dailyCap, monthlyCap,
            approvalThreshold, allowlist, paused, requireApprovalForAll, updatedBy,
        } = body as {
            orgId: string; perTxCap?: string; dailyCap?: string; monthlyCap?: string;
            approvalThreshold?: string; allowlist?: string[]; paused?: boolean;
            requireApprovalForAll?: boolean; updatedBy: string;
        };

        if (!orgId || !updatedBy) {
            return Response.json({ error: "orgId and updatedBy are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const existing = await getFlowPolicy(orgId);
        const wasAlreadyPaused = existing?.paused ?? false;

        const policy = await upsertFlowPolicy(orgId, {
            perTxCap: perTxCap ?? existing?.perTxCap ?? DEFAULT_FLOW_POLICY.perTxCap,
            dailyCap: dailyCap ?? existing?.dailyCap ?? DEFAULT_FLOW_POLICY.dailyCap,
            monthlyCap: monthlyCap ?? existing?.monthlyCap ?? DEFAULT_FLOW_POLICY.monthlyCap,
            approvalThreshold: approvalThreshold ?? existing?.approvalThreshold ?? DEFAULT_FLOW_POLICY.approvalThreshold,
            allowlist: allowlist ?? existing?.allowlist ?? [],
            paused: paused ?? existing?.paused ?? false,
            requireApprovalForAll: requireApprovalForAll ?? existing?.requireApprovalForAll ?? false,
        }, updatedBy);

        const newPaused = policy.paused;
        await logFlowAudit({
            orgId, event: newPaused !== wasAlreadyPaused ? (newPaused ? "policy_paused" : "policy_resumed") : "policy_updated",
            paymentId: null, subscriptionId: null, fromAddress: null, toAddress: null,
            amount: null, txHash: null, policyResult: null, reviewedBy: updatedBy,
            note: newPaused !== wasAlreadyPaused ? (newPaused ? "Treasury paused" : "Treasury resumed") : "Spending policy updated",
        });

        return Response.json({ policy }, { status: 200 });
    } catch (err) {
        console.error("[flow/policies POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
