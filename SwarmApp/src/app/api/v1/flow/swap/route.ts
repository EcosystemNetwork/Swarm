/**
 * GET  /api/v1/flow/swap  — Swap history
 * POST /api/v1/flow/swap  — Create swap quote / execute swap
 */
import { NextRequest } from "next/server";
import { createSwapQuote, getSwapHistory, executeSwap } from "@/lib/flow-superpowers";
import { incrementFlowASNStat } from "@/lib/flow-asn";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const swaps = await getSwapHistory(orgId);
    return Response.json({ count: swaps.length, swaps });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (action === "execute") {
            const { id, txHash, actualAmountOut } = body;
            if (!id || !txHash) return Response.json({ error: "id and txHash required" }, { status: 400 });
            await executeSwap(id, txHash, actualAmountOut || "0");
            if (body.asn) await incrementFlowASNStat(body.asn, "totalSwaps").catch(() => {});
            return Response.json({ status: "executed" });
        }

        const { agentId, asn, dex, tokenInAddress, tokenInSymbol, tokenOutAddress, tokenOutSymbol, amountIn, estimatedAmountOut, priceImpact, slippageBps } = body;

        if (!tokenInSymbol || !tokenOutSymbol || !amountIn) {
            return Response.json({ error: "tokenInSymbol, tokenOutSymbol, and amountIn required" }, { status: 400 });
        }

        const quote = await createSwapQuote({
            orgId, agentId: agentId || null, asn: asn || null,
            dex: dex || "incrementfi",
            tokenInAddress: tokenInAddress || "native", tokenInSymbol,
            tokenOutAddress: tokenOutAddress || "", tokenOutSymbol,
            amountIn, estimatedAmountOut: estimatedAmountOut || "0",
            priceImpact: priceImpact || 0, slippageBps: slippageBps || 50,
            status: "quoted", txHash: null,
        });

        return Response.json({ quote }, { status: 201 });
    } catch (err) {
        console.error("[flow/swap POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
