/**
 * GET  /api/v1/flow/bounties  — List bounties for an org
 * POST /api/v1/flow/bounties  — Post a new bounty
 */
import { NextRequest } from "next/server";
import { createFlowBounty, getFlowBounties } from "@/lib/flow-bounty";
import { logFlowAudit } from "@/lib/flow-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const cursor = url.searchParams.get("cursor") || undefined;
    const { bounties, nextCursor } = await getFlowBounties(orgId, limit, cursor);
    return Response.json({ count: bounties.length, bounties, nextCursor });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            orgId, title, description, amount, token, tokenSymbol,
            funderAddress, deadline, tags, postedBy,
        } = body as {
            orgId: string; title: string; description: string; amount: string;
            token?: string; tokenSymbol?: string; funderAddress: string;
            deadline?: string; tags?: string[]; postedBy: string;
        };

        if (!orgId || !title || !amount || !funderAddress || !postedBy) {
            return Response.json({ error: "orgId, title, amount, funderAddress, and postedBy are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const bounty = await createFlowBounty({
            orgId, title, description: description || "",
            amount, token: token || "FLOW", tokenSymbol: tokenSymbol || "FLOW",
            funderAddress, status: "open",
            deadline: deadline ? new Date(deadline) : null,
            tags: tags || [], postedBy,
        });

        await logFlowAudit({
            orgId, event: "bounty_posted", paymentId: null, subscriptionId: null,
            fromAddress: funderAddress, toAddress: null, amount, txHash: null,
            policyResult: null, reviewedBy: postedBy,
            note: `Bounty posted: ${title}`,
        });

        return Response.json({ bounty }, { status: 201 });
    } catch (err) {
        console.error("[flow/bounties POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
