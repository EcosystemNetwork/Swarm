/**
 * POST /api/v1/ton/simulate
 *
 * Dry-run a payment through the spending policy without creating any records.
 * Use this for UI previews and agent pre-flight checks.
 *
 * Body: { orgId, toAddress, amountNano }
 * Returns: { allowed, requiresApproval, result, reason, remainingDailyNano,
 *             perTxCapNano, dailyCapNano, approvalThresholdNano }
 */
import { NextRequest } from "next/server";
import { checkTonPolicy, getTonPolicy, nanoToTon } from "@/lib/ton-policy";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, toAddress, amountNano } = body as {
            orgId: string;
            toAddress: string;
            amountNano: string;
        };

        if (!orgId || !toAddress || !amountNano) {
            return Response.json(
                { error: "orgId, toAddress, and amountNano are required" },
                { status: 400 },
            );
        }

        const [policyCheck, policy] = await Promise.all([
            checkTonPolicy({ orgId, toAddress, amountNano }),
            getTonPolicy(orgId),
        ]);

        return Response.json({
            ...policyCheck,
            amountTon: nanoToTon(amountNano),
            policy: policy
                ? {
                    perTxCapNano: policy.perTxCapNano,
                    perTxCapTon: nanoToTon(policy.perTxCapNano),
                    dailyCapNano: policy.dailyCapNano,
                    dailyCapTon: nanoToTon(policy.dailyCapNano),
                    approvalThresholdNano: policy.approvalThresholdNano,
                    approvalThresholdTon: nanoToTon(policy.approvalThresholdNano),
                    allowlistSize: policy.allowlist.length,
                    paused: policy.paused,
                }
                : null,
        });
    } catch (err) {
        console.error("[ton/simulate]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
