/**
 * GET  /api/v1/flow/achievements  — List badges for an org or agent
 * POST /api/v1/flow/achievements  — Check and award badges based on stats
 */
import { NextRequest } from "next/server";
import { getAgentBadges, checkAndAwardBadges } from "@/lib/flow-superpowers";
import { incrementFlowASNStat } from "@/lib/flow-asn";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    const agentId = req.nextUrl.searchParams.get("agentId") || undefined;
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const badges = await getAgentBadges(orgId, agentId);
    return Response.json({ count: badges.length, badges });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, agentId, asn, stats } = body as {
            orgId: string; agentId: string; asn: string;
            stats: { payments: number; bounties: number; stakes: number; deploys: number; swaps: number; cidVerifications: number; creditScore: number };
        };

        if (!orgId || !agentId || !asn || !stats) {
            return Response.json({ error: "orgId, agentId, asn, and stats required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const newBadges = await checkAndAwardBadges(orgId, agentId, asn, stats);

        if (newBadges.length > 0) {
            await incrementFlowASNStat(asn, "achievementCount", newBadges.length).catch(() => {});
        }

        return Response.json({
            awarded: newBadges.length,
            badges: newBadges,
        }, { status: newBadges.length > 0 ? 201 : 200 });
    } catch (err) {
        console.error("[flow/achievements POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
