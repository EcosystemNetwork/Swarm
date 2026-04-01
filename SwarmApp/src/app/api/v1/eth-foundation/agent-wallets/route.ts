/**
 * GET  /api/v1/eth-foundation/agent-wallets  — List ETH agent wallets for an org
 * POST /api/v1/eth-foundation/agent-wallets  — Generate a new ETH agent wallet (secp256k1)
 */
import { NextRequest } from "next/server";
import { createEthAgentWallet, getEthAgentWallets } from "@/lib/eth-asn";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const wallets = await getEthAgentWallets(orgId);
    return Response.json({ count: wallets.length, wallets });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, label, network, createdBy } = body;

        if (!orgId || !label) {
            return Response.json({ error: "orgId and label required" }, { status: 400 });
        }

        const { wallet, privateKeyHex } = await createEthAgentWallet({
            orgId,
            agentId: null,
            address: "", // Will be overwritten by createEthAgentWallet
            network: network || "sepolia",
            label,
            ensName: null,
            erc8004TokenId: null,
            createdBy: createdBy || "",
        });

        return Response.json({ wallet, privateKeyHex }, { status: 201 });
    } catch (err) {
        console.error("[eth-foundation/agent-wallets POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
