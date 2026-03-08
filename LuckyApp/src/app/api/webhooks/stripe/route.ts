/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler for marketplace subscription lifecycle events.
 * Manages subscription creation, renewal, and cancellation.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY        — Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET    — Webhook endpoint signing secret
 *
 * Handled events:
 *   checkout.session.completed  — new subscription created
 *   invoice.paid                — subscription renewed
 *   customer.subscription.deleted — subscription cancelled
 */
import { NextRequest } from "next/server";
import { doc, updateDoc, serverTimestamp, getDocs, query, collection, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToItem } from "@/lib/skills";
import type { SubscriptionPlan } from "@/lib/skills";

// ── Stripe SDK lazy import ──────────────────────────────────────
// Only loaded if STRIPE_SECRET_KEY is configured. This avoids hard
// build failures in environments that don't need billing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeEvent = { type: string; data: { object: Record<string, unknown> } };

async function verifyWebhook(req: NextRequest): Promise<{ error: string | null; event: StripeEvent | null }> {
    const key = process.env.STRIPE_SECRET_KEY;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!key || !secret) {
        return { error: "Stripe not configured", event: null };
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
        return { error: "Missing stripe-signature header", event: null };
    }

    const body = await req.text();

    // HMAC-based signature verification (Stripe v1 scheme)
    // Uses the raw body + webhook secret to compute expected signature
    try {
        const parts = sig.split(",");
        const tsPart = parts.find((p) => p.startsWith("t="));
        const v1Part = parts.find((p) => p.startsWith("v1="));
        if (!tsPart || !v1Part) {
            return { error: "Invalid signature format", event: null };
        }

        const timestamp = tsPart.slice(2);
        const expectedSig = v1Part.slice(3);
        const payload = `${timestamp}.${body}`;

        const encoder = new TextEncoder();
        const keyData = await crypto.subtle.importKey(
            "raw", encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
        );
        const mac = await crypto.subtle.sign("HMAC", keyData, encoder.encode(payload));
        const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");

        if (computed !== expectedSig) {
            return { error: "Signature mismatch", event: null };
        }

        // Reject if timestamp is older than 5 minutes
        const age = Math.abs(Date.now() / 1000 - Number(timestamp));
        if (age > 300) {
            return { error: "Webhook timestamp too old", event: null };
        }

        const event = JSON.parse(body) as StripeEvent;
        return { error: null, event };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid signature";
        return { error: message, event: null };
    }
}

// ── Subscription helpers ────────────────────────────────────────

const SUBSCRIPTION_COLLECTION = "marketSubscriptions";

async function activateSubscription(
    orgId: string,
    itemId: string,
    plan: SubscriptionPlan,
    subscribedBy: string,
    stripeSubscriptionId: string,
) {
    const installationId = await subscribeToItem(orgId, itemId, plan, subscribedBy);

    // Store Stripe reference on the subscription doc
    const q = query(
        collection(db, SUBSCRIPTION_COLLECTION),
        where("orgId", "==", orgId),
        where("itemId", "==", itemId),
        where("status", "==", "active"),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
        await updateDoc(doc(db, SUBSCRIPTION_COLLECTION, snap.docs[0].id), {
            stripeSubscriptionId,
        });
    }

    return installationId;
}

async function cancelSubscription(stripeSubscriptionId: string) {
    const q = query(
        collection(db, SUBSCRIPTION_COLLECTION),
        where("stripeSubscriptionId", "==", stripeSubscriptionId),
        where("status", "==", "active"),
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
        await updateDoc(doc(db, SUBSCRIPTION_COLLECTION, d.id), {
            status: "cancelled",
            cancelledAt: serverTimestamp(),
        });
    }
}

// ── Webhook handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const { error, event } = await verifyWebhook(req);

    if (error || !event) {
        console.error("Stripe webhook verification failed:", error);
        return Response.json({ error: error ?? "No event" }, { status: 400 });
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Record<string, unknown>;
                const meta = (session.metadata ?? {}) as Record<string, string>;
                const orgId = meta.orgId;
                const itemId = meta.itemId;
                const plan = (meta.plan || "monthly") as SubscriptionPlan;
                const subscribedBy = meta.subscribedBy || "";
                const stripeSubId = (session.subscription as string) || "";

                if (orgId && itemId) {
                    await activateSubscription(orgId, itemId, plan, subscribedBy, stripeSubId);
                }
                break;
            }

            case "invoice.paid": {
                // Subscription renewed — ensure it's still marked active
                const invoice = event.data.object as Record<string, unknown>;
                const subId = invoice.subscription as string;
                if (subId) {
                    const q = query(
                        collection(db, SUBSCRIPTION_COLLECTION),
                        where("stripeSubscriptionId", "==", subId),
                    );
                    const snap = await getDocs(q);
                    for (const d of snap.docs) {
                        if (d.data().status !== "active") {
                            await updateDoc(doc(db, SUBSCRIPTION_COLLECTION, d.id), {
                                status: "active",
                                renewedAt: serverTimestamp(),
                            });
                        }
                    }
                }
                break;
            }

            case "customer.subscription.deleted": {
                const sub = event.data.object as Record<string, unknown>;
                const subId = sub.id as string;
                if (subId) {
                    await cancelSubscription(subId);
                }
                break;
            }

            default:
                // Unhandled event type — acknowledge receipt
                break;
        }

        return Response.json({ received: true });
    } catch (err) {
        console.error("Stripe webhook processing error:", err);
        return Response.json({ error: "Webhook processing failed" }, { status: 500 });
    }
}
