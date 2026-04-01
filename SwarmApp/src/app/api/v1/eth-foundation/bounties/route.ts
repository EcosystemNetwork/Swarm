/**
 * GET  /api/v1/eth-foundation/bounties  — List bounties for an org
 * POST /api/v1/eth-foundation/bounties  — Create a bounty
 */
import { NextRequest } from "next/server";
import { createEthBounty, getEthBounties, type EthBountyCategory } from "@/lib/eth-foundation-bounty";
import { logEthAudit } from "@/lib/eth-foundation-policy";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const { bounties, nextCursor } = await getEthBounties(orgId, limit, cursor);

    return Response.json({ count: bounties.length, bounties, nextCursor });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, title, description, amount, funderAddress, tags, category, postedBy } = body;

        if (!orgId || !title || !amount) {
            return Response.json({ error: "orgId, title, and amount are required" }, { status: 400 });
        }

        const bounty = await createEthBounty({
            orgId,
            title,
            description: description || "",
            amount,
            token: "ETH",
            tokenSymbol: "ETH",
            funderAddress: funderAddress || "",
            status: "open",
            category: (category as EthBountyCategory) || "general",
            deadline: null,
            tags: tags || [],
            postedBy: postedBy || "",
        });

        await logEthAudit({
            orgId, event: "bounty_posted", paymentId: null,
            subscriptionId: null, fromAddress: funderAddress || null,
            toAddress: null, amount, txHash: null,
            policyResult: null, reviewedBy: null, note: title,
        });

        return Response.json({ bounty }, { status: 201 });
    } catch (err) {
        console.error("[eth-foundation/bounties POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
