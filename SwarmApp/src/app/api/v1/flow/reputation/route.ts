/**
 * GET  /api/v1/flow/reputation  — Get reputation history for an agent
 * POST /api/v1/flow/reputation  — Record a reputation event
 */
import { NextRequest } from "next/server";
import { recordReputationEvent, getReputationHistory, REPUTATION_DELTAS, getReputationTier } from "@/lib/flow-superpowers";
import { updateFlowASNScores } from "@/lib/flow-asn";
import { requireOrgMember } from "@/lib/auth-guard";
import type { FlowReputationEventType } from "@/lib/flow-superpowers";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    const asn = req.nextUrl.searchParams.get("asn");
    if (!orgId || !asn) return Response.json({ error: "orgId and asn required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const events = await getReputationHistory(orgId, asn);
    return Response.json({ count: events.length, events });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, agentId, asn, event, reason, metadata, currentCreditScore, currentTrustScore } = body as {
            orgId: string; agentId: string; asn: string; event: FlowReputationEventType;
            reason: string; metadata?: Record<string, string>;
            currentCreditScore?: number; currentTrustScore?: number;
        };

        if (!orgId || !agentId || !asn || !event) {
            return Response.json({ error: "orgId, agentId, asn, and event required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const deltas = REPUTATION_DELTAS[event];
        if (!deltas) return Response.json({ error: `Unknown event type: ${event}` }, { status: 400 });

        const oldCredit = currentCreditScore ?? 680;
        const oldTrust = currentTrustScore ?? 50;
        const newCredit = Math.max(300, Math.min(900, oldCredit + deltas.credit));
        const newTrust = Math.max(0, Math.min(100, oldTrust + deltas.trust));
        const tier = getReputationTier(newCredit);

        const repEvent = await recordReputationEvent({
            orgId, agentId, asn, event,
            creditDelta: deltas.credit, trustDelta: deltas.trust,
            newCreditScore: newCredit, newTrustScore: newTrust,
            flowTxHash: null, reason: reason || event.replace(/_/g, " "),
            metadata: metadata || {},
        });

        await updateFlowASNScores(asn, newCredit, newTrust, tier.name).catch(() => {});

        return Response.json({
            event: repEvent,
            creditScore: newCredit,
            trustScore: newTrust,
            tier: tier.name,
            creditDelta: deltas.credit,
            trustDelta: deltas.trust,
        }, { status: 201 });
    } catch (err) {
        console.error("[flow/reputation POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
