/**
 * GET /api/v1/memory/pro/analytics?orgId=...&days=30
 *
 * Premium analytics dashboard data — retrieval stats, top agents,
 * stale detection, growth tracking, and space breakdown.
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 * Entitlement: Memory Pro subscription required
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { requireMemoryPro } from "@/lib/storacha/entitlement";
import { getAnalyticsDashboard } from "@/lib/storacha/memory-pro";

export async function GET(req: NextRequest) {
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/pro/analytics")
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
        const dashboard = await getAnalyticsDashboard(orgId);
        return Response.json({ ok: true, ...dashboard });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to load analytics" },
            { status: 500 },
        );
    }
}
