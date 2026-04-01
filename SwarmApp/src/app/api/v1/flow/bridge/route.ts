/**
 * GET  /api/v1/flow/bridge  — List bridge transactions
 * POST /api/v1/flow/bridge  — Create or complete a bridge transaction
 */
import { NextRequest } from "next/server";
import { createBridgeTransaction, getBridgeTransactions, completeBridgeTransaction } from "@/lib/flow-superpowers";
import { incrementFlowASNStat } from "@/lib/flow-asn";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const transactions = await getBridgeTransactions(orgId);
    return Response.json({ count: transactions.length, transactions });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (action === "complete") {
            const { id, cadenceTxHash, evmTxHash } = body;
            if (!id) return Response.json({ error: "id required" }, { status: 400 });
            await completeBridgeTransaction(id, cadenceTxHash || null, evmTxHash || null);
            if (body.asn) await incrementFlowASNStat(body.asn, "totalBridgeTransactions").catch(() => {});
            return Response.json({ status: "completed" });
        }

        const { agentId, asn, direction, tokenSymbol, tokenAddress, amount, fromAddress, toAddress } = body;
        if (!direction || !tokenSymbol || !amount || !fromAddress || !toAddress) {
            return Response.json({ error: "direction, tokenSymbol, amount, fromAddress, toAddress required" }, { status: 400 });
        }

        const tx = await createBridgeTransaction({
            orgId, agentId: agentId || null, asn: asn || null,
            direction, tokenSymbol, tokenAddress: tokenAddress || "",
            amount, fromAddress, toAddress,
            status: "pending", cadenceTxHash: null, evmTxHash: null, errorMessage: null,
        });

        return Response.json({ transaction: tx }, { status: 201 });
    } catch (err) {
        console.error("[flow/bridge POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
