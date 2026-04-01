/**
 * GET  /api/v1/eth-foundation/payments  — List ETH payments for an org
 * POST /api/v1/eth-foundation/payments  — Create a payment (policy-checked)
 */
import { NextRequest } from "next/server";
import {
    createEthPayment,
    getEthPayments,
    getEthPaymentByIdempotencyKey,
    checkEthPolicy,
    logEthAudit,
    weiToEth,
    type EthPaymentStatus,
    type EthPolicyResult,
} from "@/lib/eth-foundation-policy";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const statusFilter = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const cursor = url.searchParams.get("cursor") || undefined;
    const { payments: allPayments, nextCursor } = await getEthPayments(orgId, limit, cursor);
    const payments = statusFilter ? allPayments.filter((p) => p.status === statusFilter) : allPayments;

    return Response.json({ count: payments.length, payments, nextCursor });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, fromAddress, toAddress, amount, memo, createdBy, idempotencyKey } = body;

        if (!orgId || !fromAddress || !toAddress || !amount) {
            return Response.json({ error: "orgId, fromAddress, toAddress, and amount are required" }, { status: 400 });
        }

        // Idempotency check
        if (idempotencyKey) {
            const existing = await getEthPaymentByIdempotencyKey(orgId, idempotencyKey);
            if (existing) {
                return Response.json({
                    id: existing.id, status: existing.status, policyResult: existing.policyResult,
                    requiresApproval: existing.status === "pending_approval", idempotent: true,
                }, { status: 200 });
            }
        }

        if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
            return Response.json({ error: "amount must be a positive integer string (wei)" }, { status: 400 });
        }

        const policyCheck = await checkEthPolicy({ orgId, toAddress, amount });

        let status: EthPaymentStatus;
        if (!policyCheck.allowed) {
            status = "blocked";
        } else if (policyCheck.requiresApproval) {
            status = "pending_approval";
        } else {
            status = "ready";
        }

        const payment = await createEthPayment({
            orgId, fromAddress, toAddress, amount, memo: memo || "",
            status, txHash: null, policyResult: policyCheck.result as EthPolicyResult,
            approvalId: null, approvedBy: null, subscriptionId: null,
            idempotencyKey: idempotencyKey || null, createdBy: createdBy || fromAddress,
        });

        await logEthAudit({
            orgId, event: "payment_created", paymentId: payment.id,
            subscriptionId: null, fromAddress, toAddress,
            amount, txHash: null, policyResult: policyCheck.result as EthPolicyResult,
            reviewedBy: null, note: memo || null,
        });

        return Response.json({
            id: payment.id, status: payment.status, policyResult: payment.policyResult,
            requiresApproval: payment.status === "pending_approval", idempotent: false,
        }, { status: 201 });
    } catch (err) {
        console.error("[eth-foundation/payments POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
