/**
 * GET  /api/v1/eth-foundation/reputation  — Get reputation events for an org
 * POST /api/v1/eth-foundation/reputation  — Record a new reputation event
 */
import { NextRequest } from "next/server";
import { getReputationEvents, recordReputationEvent, calculateTier } from "@/lib/eth-asn";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    const asn = req.nextUrl.searchParams.get("asn") || undefined;
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const events = await getReputationEvents(orgId, asn, limit);

    return Response.json({ count: events.length, events });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, agentId, asn, event, creditDelta, trustDelta, newCreditScore, newTrustScore, reason, txHash, erc8004TokenId } = body;

        if (!orgId || !agentId || !asn || !event) {
            return Response.json({ error: "orgId, agentId, asn, and event are required" }, { status: 400 });
        }

        const tier = calculateTier(newCreditScore ?? 680, newTrustScore ?? 50);

        const id = await recordReputationEvent({
            orgId,
            agentId,
            asn,
            event,
            creditDelta: creditDelta ?? 0,
            trustDelta: trustDelta ?? 0,
            newCreditScore: newCreditScore ?? 680,
            newTrustScore: newTrustScore ?? 50,
            tier,
            reason: reason || "",
            txHash: txHash || null,
            erc8004TokenId: erc8004TokenId || null,
        });

        return Response.json({ id, tier }, { status: 201 });
    } catch (err) {
        console.error("[eth-foundation/reputation POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
