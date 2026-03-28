/**
 * GET  /api/v1/ton/policies  — Get active spending policy for an org
 * POST /api/v1/ton/policies  — Create or update spending policy
 *
 * GET query: orgId
 *
 * POST body: { orgId, perTxCapNano, dailyCapNano, monthlyCapNano,
 *              approvalThresholdNano, allowlist, paused, notifyTelegramChatId, updatedBy }
 */
import { NextRequest } from "next/server";
import {
    getTonPolicy,
    upsertTonPolicy,
    logTonAudit,
    DEFAULT_TON_POLICY,
} from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const policy = await getTonPolicy(orgId);
    // Return default policy shape if not yet configured
    if (!policy) {
        return Response.json({ policy: { ...DEFAULT_TON_POLICY, id: null, orgId, configured: false } });
    }
    return Response.json({ policy: { ...policy, configured: true } });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            orgId,
            perTxCapNano,
            dailyCapNano,
            monthlyCapNano,
            approvalThresholdNano,
            allowlist,
            paused,
            requireApprovalForAll,
            notifyTelegramChatId,
            updatedBy,
        } = body as {
            orgId: string;
            perTxCapNano?: string;
            dailyCapNano?: string;
            monthlyCapNano?: string;
            approvalThresholdNano?: string;
            allowlist?: string[];
            paused?: boolean;
            requireApprovalForAll?: boolean;
            notifyTelegramChatId?: string | null;
            updatedBy: string;
        };

        if (!orgId || !updatedBy) {
            return Response.json({ error: "orgId and updatedBy are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const existing = await getTonPolicy(orgId);
        const wasAlreadyPaused = existing?.paused ?? false;

        const policy = await upsertTonPolicy(
            orgId,
            {
                perTxCapNano: perTxCapNano ?? existing?.perTxCapNano ?? DEFAULT_TON_POLICY.perTxCapNano,
                dailyCapNano: dailyCapNano ?? existing?.dailyCapNano ?? DEFAULT_TON_POLICY.dailyCapNano,
                monthlyCapNano: monthlyCapNano ?? existing?.monthlyCapNano ?? DEFAULT_TON_POLICY.monthlyCapNano,
                approvalThresholdNano: approvalThresholdNano ?? existing?.approvalThresholdNano ?? DEFAULT_TON_POLICY.approvalThresholdNano,
                allowlist: allowlist ?? existing?.allowlist ?? [],
                paused: paused ?? existing?.paused ?? false,
                requireApprovalForAll: requireApprovalForAll ?? existing?.requireApprovalForAll ?? false,
                notifyTelegramChatId: notifyTelegramChatId !== undefined
                    ? (notifyTelegramChatId || null)
                    : (existing?.notifyTelegramChatId ?? null),
            },
            updatedBy,
        );

        // Log pause/resume event specifically
        const newPaused = policy.paused;
        if (newPaused !== wasAlreadyPaused) {
            await logTonAudit({
                orgId,
                event: newPaused ? "policy_paused" : "policy_resumed",
                paymentId: null,
                subscriptionId: null,
                fromAddress: null,
                toAddress: null,
                amountNano: null,
                txHash: null,
                policyResult: null,
                reviewedBy: updatedBy,
                note: newPaused ? "Treasury paused (kill switch activated)" : "Treasury resumed",
            });
        } else {
            await logTonAudit({
                orgId,
                event: "policy_updated",
                paymentId: null,
                subscriptionId: null,
                fromAddress: null,
                toAddress: null,
                amountNano: null,
                txHash: null,
                policyResult: null,
                reviewedBy: updatedBy,
                note: "Spending policy updated",
            });
        }

        return Response.json({ policy }, { status: 200 });
    } catch (err) {
        console.error("[ton/policies POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
