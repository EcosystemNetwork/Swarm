/**
 * GET  /api/v1/ton/bounties  — List bounties for an org
 * POST /api/v1/ton/bounties  — Post a new bounty
 *
 * GET query: orgId, status?
 * POST body: { orgId, title, description, amountNano, token?, funderAddress, deadline?, tags?, postedBy }
 */
import { NextRequest } from "next/server";
import { createBounty, getBounties } from "@/lib/ton-bounty";
import { logTonAudit } from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const statusFilter = url.searchParams.get("status");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const cursor = url.searchParams.get("cursor") || undefined;
    const { bounties: allBounties, nextCursor } = await getBounties(orgId, limit, cursor);
    const bounties = statusFilter ? allBounties.filter((b) => b.status === statusFilter) : allBounties;

    return Response.json({ count: bounties.length, bounties, nextCursor });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            orgId, title, description, amountNano,
            token, funderAddress, deadline, tags, postedBy,
        } = body as {
            orgId: string;
            title: string;
            description: string;
            amountNano: string;
            token?: string;
            funderAddress: string;
            deadline?: string;
            tags?: string[];
            postedBy: string;
        };

        if (!orgId || !title || !amountNano || !funderAddress || !postedBy) {
            return Response.json(
                { error: "orgId, title, amountNano, funderAddress, and postedBy are required" },
                { status: 400 },
            );
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (!/^\d+$/.test(amountNano) || BigInt(amountNano) <= 0n) {
            return Response.json({ error: "amountNano must be a positive integer string" }, { status: 400 });
        }

        // Sanitize text fields
        const safeTitle = title.trim().slice(0, 256);
        const safeDescription = (description || "").trim().slice(0, 4000);

        // Validate token: must be "TON" or a valid raw/user-friendly TON address
        const safeToken = (token || "TON").trim();
        const isTON = safeToken === "TON";
        const isValidAddress = /^(0:[a-fA-F0-9]{64}|[EU]Q[a-zA-Z0-9_-]{46})$/.test(safeToken);
        if (!isTON && !isValidAddress) {
            return Response.json(
                { error: "token must be \"TON\" or a valid TON address (raw 0:hex64 or EQ.../UQ...)" },
                { status: 400 },
            );
        }

        const isJetton = !isTON;
        const tokenSymbol = isJetton ? safeToken.slice(0, 8) : "TON";

        const bounty = await createBounty({
            orgId,
            title: safeTitle,
            description: safeDescription,
            amountNano,
            token: safeToken,
            tokenSymbol,
            funderAddress,
            status: "open",
            deadline: deadline ? new Date(deadline) : null,
            tags: tags || [],
            postedBy,
        });

        await logTonAudit({
            orgId,
            event: "bounty_posted",
            paymentId: null,
            subscriptionId: null,
            fromAddress: funderAddress,
            toAddress: null,
            amountNano,
            txHash: null,
            policyResult: null,
            reviewedBy: postedBy,
            note: `Bounty posted: "${safeTitle}" for ${token || "TON"}`,
        });

        return Response.json({ bounty }, { status: 201 });
    } catch (err) {
        console.error("[ton/bounties POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
