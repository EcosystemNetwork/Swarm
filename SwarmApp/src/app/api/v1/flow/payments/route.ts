/**
 * GET  /api/v1/flow/payments  — List payments for an org
 * POST /api/v1/flow/payments  — Create a payment (policy-checked)
 */
import { NextRequest } from "next/server";
import {
    createFlowPayment,
    getFlowPayments,
    getFlowPaymentByIdempotencyKey,
    checkFlowPolicy,
    logFlowAudit,
    miniFlowToFlow,
    type FlowPaymentStatus,
    type FlowPolicyResult,
} from "@/lib/flow-policy";
import { createApproval } from "@/lib/approvals";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const statusFilter = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const cursor = url.searchParams.get("cursor") || undefined;
    const { payments: allPayments, nextCursor } = await getFlowPayments(orgId, limit, cursor);
    const payments = statusFilter ? allPayments.filter((p) => p.status === statusFilter) : allPayments;

    return Response.json({ count: payments.length, payments, nextCursor });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            orgId, fromAddress, toAddress, amount,
            memo, subscriptionId, createdBy, idempotencyKey,
        } = body as {
            orgId: string; fromAddress: string; toAddress: string; amount: string;
            memo?: string; subscriptionId?: string; createdBy?: string; idempotencyKey?: string;
        };

        if (!orgId || !fromAddress || !toAddress || !amount) {
            return Response.json({ error: "orgId, fromAddress, toAddress, and amount are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (idempotencyKey) {
            const existing = await getFlowPaymentByIdempotencyKey(orgId, idempotencyKey);
            if (existing) {
                return Response.json({
                    id: existing.id, status: existing.status, policyResult: existing.policyResult,
                    requiresApproval: existing.status === "pending_approval", approvalId: existing.approvalId, idempotent: true,
                }, { status: 200 });
            }
        }

        if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
            return Response.json({ error: "amount must be a positive integer string (mini-FLOW)" }, { status: 400 });
        }

        const policyCheck = await checkFlowPolicy({ orgId, toAddress, amount });

        let status: FlowPaymentStatus;
        let approvalId: string | null = null;

        if (!policyCheck.allowed) {
            status = "blocked";
        } else if (policyCheck.requiresApproval) {
            status = "pending_approval";
            approvalId = await createApproval({
                orgId, type: "transaction",
                title: `FLOW Payment: ${miniFlowToFlow(amount)} FLOW`,
                description: `${memo || "No memo"} → ${toAddress}`,
                payload: { fromAddress, toAddress, amount, memo },
                requestedBy: createdBy || fromAddress,
                priority: BigInt(amount) > 1_000_000_000n ? "high" : "medium",
            });
        } else {
            status = "ready";
        }

        const payment = await createFlowPayment({
            orgId, fromAddress, toAddress, amount, memo: memo || "",
            status, txHash: null, policyResult: policyCheck.result as FlowPolicyResult,
            approvalId, approvedBy: null, subscriptionId: subscriptionId || null,
            idempotencyKey: idempotencyKey || null, createdBy: createdBy || fromAddress,
        });

        await logFlowAudit({
            orgId, event: "payment_created", paymentId: payment.id,
            subscriptionId: subscriptionId || null, fromAddress, toAddress,
            amount, txHash: null, policyResult: policyCheck.result as FlowPolicyResult,
            reviewedBy: null, note: policyCheck.reason,
        });

        return Response.json({
            id: payment.id, status: payment.status, policyResult: policyCheck.result,
            requiresApproval: policyCheck.requiresApproval, approvalId, reason: policyCheck.reason,
        }, { status: 201 });
    } catch (err) {
        console.error("[flow/payments POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
