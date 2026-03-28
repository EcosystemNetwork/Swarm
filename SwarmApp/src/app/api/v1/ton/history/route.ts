/**
 * GET /api/v1/ton/history
 *
 * Fetch on-chain transaction history for a TON address via TON Center API v3.
 * Query params: address, limit? (default 20), network? ("mainnet"|"testnet")
 * Returns: { address, count, transactions }
 */
import { NextRequest } from "next/server";
import { nanoToTon } from "@/lib/ton-policy";
import { getWalletAddress } from "@/lib/auth-guard";

const TON_CENTER_MAINNET = "https://toncenter.com/api/v3";
const TON_CENTER_TESTNET = "https://testnet.toncenter.com/api/v3";

interface RawTransaction {
    hash: string;
    lt: string;
    account: string;
    now: number;
    orig_status: string;
    end_status: string;
    total_fees: string;
    in_msg?: {
        source?: string;
        destination?: string;
        value?: string;
        fwd_fee?: string;
        message_content?: { body?: string };
    };
    out_msgs?: Array<{
        source?: string;
        destination?: string;
        value?: string;
        message_content?: { body?: string };
    }>;
}

function parseDirection(tx: RawTransaction, address: string): "in" | "out" | "self" {
    const inSrc = tx.in_msg?.source;
    const outDests = (tx.out_msgs || []).map((m) => m.destination).filter(Boolean);

    if (!inSrc && outDests.length === 0) return "self";
    if (inSrc && inSrc !== address) return "in";
    return "out";
}

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const address = url.searchParams.get("address");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    const network = url.searchParams.get("network") || "mainnet";

    if (!address) return Response.json({ error: "address is required" }, { status: 400 });

    if (!getWalletAddress(req)) {
        return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const base = network === "testnet" ? TON_CENTER_TESTNET : TON_CENTER_MAINNET;
    const apiKey = process.env.TON_CENTER_API_KEY;
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;

    try {
        const res = await fetch(
            `${base}/transactions?account=${encodeURIComponent(address)}&limit=${limit}&sort=desc`,
            { headers },
        );

        if (!res.ok) {
            const txt = await res.text();
            return Response.json(
                { error: "TON Center API error", detail: txt },
                { status: 502 },
            );
        }

        const data = await res.json() as { transactions?: RawTransaction[] };
        const txs = (data.transactions || []).map((tx) => {
            const direction = parseDirection(tx, address);
            const inValue = tx.in_msg?.value || "0";
            const outValue = (tx.out_msgs || []).reduce(
                (s, m) => s + BigInt(m.value || "0"),
                0n,
            ).toString();
            const value = direction === "in" ? inValue : outValue;

            return {
                hash: tx.hash,
                lt: tx.lt,
                timestamp: tx.now,
                date: new Date(tx.now * 1000).toISOString(),
                direction,
                from: tx.in_msg?.source || address,
                to: direction === "out"
                    ? (tx.out_msgs?.[0]?.destination || null)
                    : address,
                amountNano: value,
                amountTon: nanoToTon(value),
                feesNano: tx.total_fees || "0",
                feesTon: nanoToTon(tx.total_fees || "0"),
                explorerUrl: `https://toncenter.com/tx/${tx.hash}`,
            };
        });

        return Response.json({ address, count: txs.length, transactions: txs });
    } catch (err) {
        console.error("[ton/history]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
