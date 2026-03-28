/**
 * GET /api/v1/ton/resolve
 *
 * Resolve a .ton DNS name to a raw TON address via TON Center API v2.
 * Also resolves .t.me usernames and raw addresses (pass-through).
 *
 * Query params: name — e.g. "example.ton" or "0:abc123..."
 * Returns: { name, resolved, address, type }
 */
import { NextRequest } from "next/server";

const TON_CENTER_V2 = "https://toncenter.com/api/v2";
const TON_CENTER_V2_TEST = "https://testnet.toncenter.com/api/v2";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const name = url.searchParams.get("name")?.trim();
    const network = url.searchParams.get("network") || "mainnet";

    if (!name) return Response.json({ error: "name is required" }, { status: 400 });

    // If it already looks like a raw address (0:hex or EQ.../UQ...), pass through
    if (/^(0:[a-fA-F0-9]{64}|[EU]Q[a-zA-Z0-9_-]{46})$/.test(name)) {
        return Response.json({ name, resolved: true, address: name, type: "raw" });
    }

    // TON DNS resolution via dnsResolve RPC method
    const base = network === "testnet" ? TON_CENTER_V2_TEST : TON_CENTER_V2;
    const apiKey = process.env.TON_CENTER_API_KEY;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;

    // Normalise: ensure .ton suffix
    const domainName = name.endsWith(".ton") ? name : `${name}.ton`;

    try {
        const res = await fetch(`${base}/dnsResolve?dns_item_address=${encodeURIComponent(domainName)}`, {
            headers,
        });

        if (!res.ok) {
            return Response.json({ name, resolved: false, address: null, type: "ton-dns", error: "DNS resolution failed" });
        }

        const data = await res.json() as { result?: { wallet?: { address?: string } } };
        const address = data.result?.wallet?.address || null;

        if (!address) {
            return Response.json({ name, resolved: false, address: null, type: "ton-dns", error: "No wallet linked to this name" });
        }

        return Response.json({ name: domainName, resolved: true, address, type: "ton-dns" });
    } catch (err) {
        console.error("[ton/resolve]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
