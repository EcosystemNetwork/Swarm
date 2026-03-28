/**
 * GET /api/v1/ton/nft-gate
 *
 * Check if a TON wallet owns at least one NFT from a specific collection.
 * Used for access gating — e.g., require a Swarm Agent NFT to unlock premium capabilities.
 *
 * Query params: address, collection, network? ("mainnet"|"testnet")
 * Returns: { hasAccess, address, collection, ownedCount, items }
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";

const TON_CENTER_MAINNET = "https://toncenter.com/api/v3";
const TON_CENTER_TESTNET = "https://testnet.toncenter.com/api/v3";

interface NftItem {
    address: string;
    collection?: { address: string; name?: string };
    metadata?: { name?: string; image?: string };
    index?: number;
}

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const address = url.searchParams.get("address");
    const collection = url.searchParams.get("collection");
    const network = url.searchParams.get("network") || "mainnet";

    if (!address || !collection) {
        return Response.json(
            { error: "address and collection are required" },
            { status: 400 },
        );
    }

    if (!getWalletAddress(req)) {
        return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const base = network === "testnet" ? TON_CENTER_TESTNET : TON_CENTER_MAINNET;
    const apiKey = process.env.TON_CENTER_API_KEY;
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;

    try {
        const res = await fetch(
            `${base}/nft/items?owner_address=${encodeURIComponent(address)}&collection_address=${encodeURIComponent(collection)}&limit=50`,
            { headers },
        );

        if (!res.ok) {
            const txt = await res.text();
            return Response.json({ error: "TON Center API error", detail: txt }, { status: 502 });
        }

        const data = await res.json() as { nft_items?: NftItem[] };
        const items = data.nft_items || [];

        return Response.json({
            hasAccess: items.length > 0,
            address,
            collection,
            ownedCount: items.length,
            items: items.slice(0, 10).map((item) => ({
                address: item.address,
                name: item.metadata?.name || null,
                image: item.metadata?.image || null,
                index: item.index ?? null,
            })),
        });
    } catch (err) {
        console.error("[ton/nft-gate]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
