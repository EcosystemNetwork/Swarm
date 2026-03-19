/**
 * POST /api/v1/memory/pro/retrieve
 *   { orgId, query, spaceIds?, agentId?, type?, limit?, minConfidence?, recencyWeight? }
 *
 * Premium retrieval with TF-IDF scoring, recency weighting,
 * agent-role matching, tag boosting, and CID deduplication.
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 * Entitlement: Memory Pro subscription required
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { requireMemoryPro } from "@/lib/storacha/entitlement";
import { semanticRetrieve, recordRetrieval } from "@/lib/storacha/memory-pro";

export async function POST(req: NextRequest) {
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "POST:/v1/memory/pro/retrieve")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const orgId = body.orgId as string;
    const queryText = body.query as string;

    if (!orgId || !queryText) {
        return Response.json({ error: "Required: orgId, query" }, { status: 400 });
    }

    const access = await requireMemoryPro(orgId);
    if (!access.allowed) {
        return Response.json({ error: access.reason, requiresSubscription: true }, { status: 403 });
    }

    try {
        const result = await semanticRetrieve({
            orgId,
            query: queryText,
            spaceIds: body.spaceIds as string[] | undefined,
            agentId: body.agentId as string | undefined,
            type: body.type as string | undefined,
            limit: body.limit as number | undefined,
            minConfidence: body.minConfidence as number | undefined,
            recencyWeight: body.recencyWeight as number | undefined,
        });

        // Record retrieval log (non-blocking)
        const queryBy = wallet || agentAuth?.agent?.agentId || "unknown";
        const queryByType = wallet ? "user" : "agent";
        recordRetrieval({
            orgId,
            query: queryText,
            queryBy,
            queryByType: queryByType as "user" | "agent",
            resultCount: result.results.length,
            topConfidence: result.results[0]?.confidence,
            retrievalTimeMs: result.retrievalTimeMs,
            spaceIds: body.spaceIds as string[] | undefined,
        }).catch(() => {});

        return Response.json(result);
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to execute retrieval" },
            { status: 500 },
        );
    }
}
