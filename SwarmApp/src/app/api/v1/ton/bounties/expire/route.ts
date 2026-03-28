/**
 * POST /api/v1/ton/bounties/expire
 *
 * Cancel all open/claimed bounties whose deadline has passed.
 * Intended to be called by a scheduled cron job.
 *
 * Body: { orgId }
 * Returns: { expired: number }
 */
import { NextRequest } from "next/server";
import { expireOverdueBounties } from "@/lib/ton-bounty";
import { logTonAudit } from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
    try {
        const { orgId } = await req.json() as { orgId: string };
        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const expired = await expireOverdueBounties(orgId);

        if (expired > 0) {
            await logTonAudit({
                orgId,
                event: "bounty_cancelled",
                paymentId: null,
                subscriptionId: null,
                fromAddress: null,
                toAddress: null,
                amountNano: null,
                txHash: null,
                policyResult: null,
                reviewedBy: "system",
                note: `${expired} overdue bounty${expired === 1 ? "" : "s"} auto-cancelled by deadline enforcer`,
            });
        }

        return Response.json({ expired });
    } catch (err) {
        console.error("[ton/bounties/expire]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
