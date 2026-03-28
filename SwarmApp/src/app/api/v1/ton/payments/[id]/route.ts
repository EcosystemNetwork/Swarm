/**
 * PATCH /api/v1/ton/payments/[id]
 *
 * Update a payment status. Used to:
 *   - confirm execution (action: "execute", txHash required)
 *   - approve pending payment (action: "approve", reviewedBy required)
 *   - reject a payment  (action: "reject", reviewedBy required)
 *
 * Body: { orgId, action: "execute" | "approve" | "reject", txHash?, reviewedBy?, note? }
 */
import { NextRequest } from "next/server";
import { getTonPayment, updateTonPayment, logTonAudit } from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

// Valid transitions: action → required current status(es)
const VALID_TRANSITIONS: Record<string, string[]> = {
    execute:  ["ready"],
    approve:  ["pending_approval"],
    reject:   ["pending_approval", "ready"],
};

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } },
) {
    const { id } = params;

    try {
        const body = await req.json();
        const { orgId, action, txHash, reviewedBy, note, fromAddress, toAddress, amountNano } = body as {
            orgId: string;
            action: "execute" | "approve" | "reject";
            txHash?: string;
            reviewedBy?: string;
            note?: string;
            fromAddress?: string;
            toAddress?: string;
            amountNano?: string;
        };

        if (!orgId || !action) {
            return Response.json({ error: "orgId and action are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        // Validate state transition
        const allowedStatuses = VALID_TRANSITIONS[action];
        if (allowedStatuses) {
            const current = await getTonPayment(id);
            if (!current) return Response.json({ error: "Payment not found" }, { status: 404 });
            if (!allowedStatuses.includes(current.status)) {
                return Response.json(
                    { error: `Cannot ${action} a payment with status "${current.status}". Expected: ${allowedStatuses.join(" or ")}` },
                    { status: 409 },
                );
            }
        }

        if (action === "execute") {
            if (!txHash) return Response.json({ error: "txHash required for execute" }, { status: 400 });
            await updateTonPayment(id, {
                status: "executed",
                txHash,
                executedAt: new Date(),
            });
            await logTonAudit({
                orgId,
                event: "payment_executed",
                paymentId: id,
                subscriptionId: null,
                fromAddress: fromAddress || null,
                toAddress: toAddress || null,
                amountNano: amountNano || null,
                txHash,
                policyResult: null,
                reviewedBy: reviewedBy || null,
                note: note || `Payment executed on-chain`,
            });
            return Response.json({ id, status: "executed", txHash });
        }

        if (action === "approve") {
            await updateTonPayment(id, {
                status: "ready",
                approvedBy: reviewedBy || null,
            });
            await logTonAudit({
                orgId,
                event: "payment_approved",
                paymentId: id,
                subscriptionId: null,
                fromAddress: fromAddress || null,
                toAddress: toAddress || null,
                amountNano: amountNano || null,
                txHash: null,
                policyResult: null,
                reviewedBy: reviewedBy || null,
                note: note || `Payment approved by ${reviewedBy}`,
            });
            return Response.json({ id, status: "ready" });
        }

        if (action === "reject") {
            await updateTonPayment(id, { status: "rejected" });
            await logTonAudit({
                orgId,
                event: "payment_rejected",
                paymentId: id,
                subscriptionId: null,
                fromAddress: fromAddress || null,
                toAddress: toAddress || null,
                amountNano: amountNano || null,
                txHash: null,
                policyResult: null,
                reviewedBy: reviewedBy || null,
                note: note || `Payment rejected by ${reviewedBy}`,
            });
            return Response.json({ id, status: "rejected" });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (err) {
        console.error("[ton/payments/[id] PATCH]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
