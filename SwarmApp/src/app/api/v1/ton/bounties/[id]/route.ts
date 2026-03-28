/**
 * PATCH /api/v1/ton/bounties/[id]
 *
 * Bounty lifecycle transitions:
 *   action: "claim"   — claimer locks the bounty
 *   action: "submit"  — claimer submits delivery proof
 *   action: "approve" — admin approves, triggers fee + payout intent
 *   action: "reject"  — admin rejects submission
 *   action: "cancel"  — poster cancels open/claimed bounty
 *   action: "release" — confirm on-chain tx hash after payout
 *
 * Body varies by action — see below.
 */
import { NextRequest } from "next/server";
import {
    claimBounty,
    submitBounty,
    resolveBounty,
    cancelBounty,
    getTonFeeConfig,
    calculateBountyFee,
    DEFAULT_FEE_CONFIG,
} from "@/lib/ton-bounty";
import { logTonAudit, nanoToTon } from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } },
) {
    const { id } = params;
    try {
        const body = await req.json();
        const { orgId, action } = body as { orgId: string; action: string };

        if (!orgId || !action) {
            return Response.json({ error: "orgId and action are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (action === "claim") {
            const { claimerAddress, claimerAgentId } = body as { claimerAddress: string; claimerAgentId?: string };
            if (!claimerAddress) return Response.json({ error: "claimerAddress required" }, { status: 400 });
            await claimBounty(id, claimerAddress, claimerAgentId || null);
            await logTonAudit({
                orgId, event: "bounty_claimed", paymentId: null, subscriptionId: null,
                fromAddress: null, toAddress: claimerAddress, amountNano: null, txHash: null,
                policyResult: null, reviewedBy: claimerAddress, note: `Bounty ${id} claimed`,
            });
            return Response.json({ id, status: "claimed" });
        }

        if (action === "submit") {
            const { deliveryProof, submittedBy } = body as { deliveryProof: string; submittedBy?: string };
            if (!deliveryProof) return Response.json({ error: "deliveryProof required" }, { status: 400 });
            await submitBounty(id, deliveryProof);
            await logTonAudit({
                orgId, event: "bounty_submitted", paymentId: null, subscriptionId: null,
                fromAddress: null, toAddress: null, amountNano: null, txHash: null,
                policyResult: null, reviewedBy: submittedBy || null, note: `Bounty ${id} submitted with proof`,
            });
            return Response.json({ id, status: "submitted" });
        }

        if (action === "approve") {
            const { reviewedBy, amountNano, claimerAddress } = body as {
                reviewedBy: string; amountNano?: string; claimerAddress?: string;
            };

            // Calculate platform fee
            const feeConfig = await getTonFeeConfig(orgId);
            const feeBps = feeConfig?.enabled ? (feeConfig.feeBps ?? DEFAULT_FEE_CONFIG.feeBps) : 0;
            const minFeeNano = feeConfig?.minFeeBountyNano ?? DEFAULT_FEE_CONFIG.minFeeBountyNano;

            let feeCalc: { feeNano: string; netNano: string } = { feeNano: "0", netNano: amountNano || "0" };
            if (amountNano && feeBps > 0 && BigInt(amountNano) >= BigInt(minFeeNano)) {
                feeCalc = calculateBountyFee(amountNano, feeBps);
            }

            await resolveBounty(id, "approved", {
                feeNano: feeCalc.feeNano,
                netAmountNano: feeCalc.netNano,
            });

            await logTonAudit({
                orgId, event: "bounty_approved", paymentId: null, subscriptionId: null,
                fromAddress: null, toAddress: claimerAddress || null, amountNano: feeCalc.netNano,
                txHash: null, policyResult: null, reviewedBy,
                note: `Bounty ${id} approved — net ${nanoToTon(feeCalc.netNano)} TON (fee: ${nanoToTon(feeCalc.feeNano)} TON)`,
            });

            return Response.json({
                id, status: "released",
                netAmountNano: feeCalc.netNano,
                feeNano: feeCalc.feeNano,
                netAmountTon: nanoToTon(feeCalc.netNano),
            });
        }

        if (action === "reject") {
            const { reviewedBy, note } = body as { reviewedBy: string; note?: string };
            await resolveBounty(id, "rejected");
            await logTonAudit({
                orgId, event: "bounty_rejected", paymentId: null, subscriptionId: null,
                fromAddress: null, toAddress: null, amountNano: null, txHash: null,
                policyResult: null, reviewedBy, note: note || `Bounty ${id} rejected`,
            });
            return Response.json({ id, status: "rejected" });
        }

        if (action === "cancel") {
            const { cancelledBy } = body as { cancelledBy?: string };
            await cancelBounty(id);
            await logTonAudit({
                orgId, event: "bounty_cancelled", paymentId: null, subscriptionId: null,
                fromAddress: null, toAddress: null, amountNano: null, txHash: null,
                policyResult: null, reviewedBy: cancelledBy || null, note: `Bounty ${id} cancelled`,
            });
            return Response.json({ id, status: "cancelled" });
        }

        if (action === "release") {
            const { txHash, releasedBy } = body as { txHash: string; releasedBy?: string };
            if (!txHash) return Response.json({ error: "txHash required for release" }, { status: 400 });
            await resolveBounty(id, "approved", { releaseTxHash: txHash });
            await logTonAudit({
                orgId, event: "bounty_released", paymentId: null, subscriptionId: null,
                fromAddress: null, toAddress: null, amountNano: null, txHash,
                policyResult: null, reviewedBy: releasedBy || null, note: `Bounty ${id} payout confirmed on-chain`,
            });
            return Response.json({ id, status: "released", txHash });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (err) {
        console.error("[ton/bounties/[id] PATCH]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
