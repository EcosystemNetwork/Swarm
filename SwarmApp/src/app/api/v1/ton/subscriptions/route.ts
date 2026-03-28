/**
 * GET  /api/v1/ton/subscriptions  — List subscriptions for an org
 * POST /api/v1/ton/subscriptions  — Create a new subscription
 * PATCH /api/v1/ton/subscriptions  — Update subscription status
 *
 * GET query: orgId
 * POST body: { orgId, fromAddress, toAddress, amountNano, memo, frequency, maxCycles?, createdBy }
 * PATCH body: { id, orgId, status, updatedBy }
 */
import { NextRequest } from "next/server";
import {
    createTonSubscription,
    getTonSubscriptions,
    updateTonSubscription,
    logTonAudit,
} from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });
    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const subscriptions = await getTonSubscriptions(orgId);
    return Response.json({ count: subscriptions.length, subscriptions });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, fromAddress, toAddress, amountNano, memo, frequency, maxCycles, createdBy } = body as {
            orgId: string;
            fromAddress: string;
            toAddress: string;
            amountNano: string;
            memo?: string;
            frequency: "daily" | "weekly" | "monthly";
            maxCycles?: number | null;
            createdBy: string;
        };

        if (!orgId || !fromAddress || !toAddress || !amountNano || !frequency || !createdBy) {
            return Response.json(
                { error: "orgId, fromAddress, toAddress, amountNano, frequency, and createdBy are required" },
                { status: 400 },
            );
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const nextPaymentAt = computeNextPaymentAt(frequency);

        const sub = await createTonSubscription({
            orgId,
            fromAddress,
            toAddress,
            amountNano,
            memo: memo || "",
            frequency,
            maxCycles: maxCycles ?? null,
            status: "active",
            nextPaymentAt,
            createdBy,
        });

        await logTonAudit({
            orgId,
            event: "subscription_created",
            paymentId: null,
            subscriptionId: sub.id,
            fromAddress,
            toAddress,
            amountNano,
            txHash: null,
            policyResult: null,
            reviewedBy: createdBy,
            note: `${frequency} subscription created — ${memo || "no memo"}`,
        });

        return Response.json({ subscription: sub }, { status: 201 });
    } catch (err) {
        console.error("[ton/subscriptions POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, orgId, status, updatedBy } = body as {
            id: string;
            orgId: string;
            status: "paused" | "cancelled" | "active";
            updatedBy: string;
        };

        if (!id || !orgId || !status) {
            return Response.json({ error: "id, orgId, and status are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        await updateTonSubscription(id, { status });

        if (status === "cancelled") {
            await logTonAudit({
                orgId,
                event: "subscription_cancelled",
                paymentId: null,
                subscriptionId: id,
                fromAddress: null,
                toAddress: null,
                amountNano: null,
                txHash: null,
                policyResult: null,
                reviewedBy: updatedBy,
                note: `Subscription cancelled by ${updatedBy}`,
            });
        }

        return Response.json({ id, status });
    } catch (err) {
        console.error("[ton/subscriptions PATCH]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

function computeNextPaymentAt(frequency: "daily" | "weekly" | "monthly"): Date {
    const now = Date.now();
    if (frequency === "daily") {
        return new Date(now + 86_400_000);
    }
    if (frequency === "weekly") {
        return new Date(now + 7 * 86_400_000);
    }
    // Monthly: advance by one month, clamped to the last valid day of that month.
    // e.g. Jan 31 → Feb 28 (not Mar 2 via JS overflow)
    const d = new Date(now);
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + 1, 1); // move to 1st of next month safely
    const lastDay = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
    return d;
}
