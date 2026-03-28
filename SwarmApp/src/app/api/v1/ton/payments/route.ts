/**
 * GET  /api/v1/ton/payments  — List payments for an org
 * POST /api/v1/ton/payments  — Create a payment (policy-checked)
 *
 * GET query: orgId, status?, limit?
 *
 * POST body: { orgId, fromAddress, toAddress, amountNano, memo?, subscriptionId?, createdBy? }
 * Returns: { id, status, policyResult, requiresApproval, approvalId? }
 */
import { NextRequest } from "next/server";
import {
    createTonPayment,
    getTonPayments,
    getTonPaymentByIdempotencyKey,
    checkTonPolicy,
    getTonPolicy,
    logTonAudit,
    nanoToTon,
    type TonPaymentStatus,
    type TonPolicyResult,
} from "@/lib/ton-policy";
import { createApproval } from "@/lib/approvals";
import { TelegramBot } from "@/lib/telegram";
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
    const { payments: allPayments, nextCursor } = await getTonPayments(orgId, limit, cursor);
    const payments = statusFilter ? allPayments.filter((p) => p.status === statusFilter) : allPayments;

    return Response.json({ count: payments.length, payments, nextCursor });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            orgId,
            fromAddress,
            toAddress,
            amountNano,
            memo,
            subscriptionId,
            createdBy,
            idempotencyKey,
        } = body as {
            orgId: string;
            fromAddress: string;
            toAddress: string;
            amountNano: string;
            memo?: string;
            subscriptionId?: string;
            createdBy?: string;
            idempotencyKey?: string;
        };

        if (!orgId || !fromAddress || !toAddress || !amountNano) {
            return Response.json(
                { error: "orgId, fromAddress, toAddress, and amountNano are required" },
                { status: 400 },
            );
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        // Idempotency check — return existing payment if key already used
        if (idempotencyKey) {
            const existing = await getTonPaymentByIdempotencyKey(orgId, idempotencyKey);
            if (existing) {
                return Response.json(
                    {
                        id: existing.id,
                        status: existing.status,
                        policyResult: existing.policyResult,
                        requiresApproval: existing.status === "pending_approval",
                        approvalId: existing.approvalId,
                        idempotent: true,
                    },
                    { status: 200 },
                );
            }
        }

        // Validate amountNano is a positive integer string
        if (!/^\d+$/.test(amountNano) || BigInt(amountNano) <= 0n) {
            return Response.json({ error: "amountNano must be a positive integer string" }, { status: 400 });
        }

        // Run policy check
        const policyCheck = await checkTonPolicy({ orgId, toAddress, amountNano });

        let status: TonPaymentStatus;
        let approvalId: string | null = null;

        if (!policyCheck.allowed) {
            status = "blocked";
        } else if (policyCheck.requiresApproval) {
            status = "pending_approval";
            // Create approval entry
            approvalId = await createApproval({
                orgId,
                type: "transaction",
                title: `TON Payment: ${nanoToTon(amountNano)} TON`,
                description: `${memo || "No memo"} → ${toAddress}`,
                payload: { fromAddress, toAddress, amountNano, memo },
                requestedBy: createdBy || fromAddress,
                priority: BigInt(amountNano) > 10_000_000_000n ? "high" : "medium",
            });
        } else {
            status = "ready";
        }

        const payment = await createTonPayment({
            orgId,
            fromAddress,
            toAddress,
            amountNano,
            memo: memo || "",
            status,
            txHash: null,
            policyResult: policyCheck.result as TonPolicyResult,
            approvalId,
            approvedBy: null,
            subscriptionId: subscriptionId || null,
            idempotencyKey: idempotencyKey || null,
            createdBy: createdBy || fromAddress,
        });

        // Fire Telegram notification for payments awaiting approval (non-blocking)
        if (status === "pending_approval") {
            notifyApprovalRequired({
                orgId,
                paymentId: payment.id,
                fromAddress,
                toAddress,
                amountNano,
                memo,
                approvalId,
                reason: policyCheck.reason,
            }).catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn("[ton/payments] Telegram notify failed:", msg);
                // Write failure to audit log so admins can see it in the dashboard
                logTonAudit({
                    orgId,
                    event: "notification_failed",
                    paymentId: payment.id,
                    subscriptionId: null,
                    fromAddress,
                    toAddress,
                    amountNano,
                    txHash: null,
                    policyResult: null,
                    reviewedBy: null,
                    note: `Telegram notification failed: ${msg}`,
                }).catch(() => {}); // never let audit logging propagate
            });
        }

        await logTonAudit({
            orgId,
            event: "payment_created",
            paymentId: payment.id,
            subscriptionId: subscriptionId || null,
            fromAddress,
            toAddress,
            amountNano,
            txHash: null,
            policyResult: policyCheck.result as TonPolicyResult,
            reviewedBy: null,
            note: policyCheck.reason,
        });

        return Response.json(
            {
                id: payment.id,
                status: payment.status,
                policyResult: policyCheck.result,
                requiresApproval: policyCheck.requiresApproval,
                approvalId,
                reason: policyCheck.reason,
            },
            { status: 201 },
        );
    } catch (err) {
        console.error("[ton/payments POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

// ─── Telegram Notification ──────────────────────────────────────────────────

async function notifyApprovalRequired(opts: {
    orgId: string;
    paymentId: string;
    fromAddress: string;
    toAddress: string;
    amountNano: string;
    memo?: string;
    approvalId: string | null;
    reason: string;
}): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const policy = await getTonPolicy(opts.orgId);
    const chatId = policy?.notifyTelegramChatId;
    if (!chatId) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.swarmprotocol.fun";
    const amountTon = nanoToTon(opts.amountNano);
    const shortFrom = opts.fromAddress.slice(0, 10) + "…" + opts.fromAddress.slice(-6);
    const shortTo = opts.toAddress.slice(0, 10) + "…" + opts.toAddress.slice(-6);

    const lines = [
        "💎 *TON Payment — Approval Required*",
        "",
        `*Amount:* \`${amountTon} TON\``,
        `*From:* \`${shortFrom}\``,
        `*To:* \`${shortTo}\``,
        opts.memo ? `*Memo:* ${opts.memo}` : null,
        `*Reason:* ${opts.reason}`,
        "",
        `[Review in Swarm](${appUrl}/mods/ton?tab=payments&id=${opts.paymentId})`,
    ].filter(Boolean).join("\n");

    const bot = new TelegramBot(botToken);
    await bot.sendMessage(chatId, lines, { parseMode: "Markdown" });
}
