/**
 * GET /api/v1/memory/pro/dashboard?orgId=...
 *
 * Combined dashboard overview — spaces, analytics summary,
 * recent queries, and storage info in a single call.
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 * Entitlement: Memory Pro subscription required
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { requireMemoryPro } from "@/lib/storacha/entitlement";
import {
    getSpaces,
    getRetrievalLogs,
    getAnalyticsDashboard,
} from "@/lib/storacha/memory-pro";
import { getStorageUsage } from "@/lib/storacha/cid-index";

export async function GET(req: NextRequest) {
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/pro/dashboard")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    const access = await requireMemoryPro(orgId);
    if (!access.allowed) {
        return Response.json({ error: access.reason, requiresSubscription: true }, { status: 403 });
    }

    try {
        const [spaces, recentLogs, analytics, usage] = await Promise.all([
            getSpaces(orgId),
            getRetrievalLogs(orgId, 7, 10),
            getAnalyticsDashboard(orgId),
            getStorageUsage(orgId),
        ]);

        return Response.json({
            ok: true,
            spacesCount: spaces.length,
            spaces: spaces.slice(0, 5),
            recentQueries: recentLogs,
            analytics: analytics.period,
            topAgents: analytics.topAgents.slice(0, 5),
            staleCount: analytics.staleCount,
            growth: analytics.growth,
            storage: {
                totalSizeBytes: usage.totalSizeBytes,
                totalMemoryEntries: usage.totalMemoryEntries,
                totalArtifacts: usage.totalArtifacts,
            },
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to load dashboard" },
            { status: 500 },
        );
    }
}
