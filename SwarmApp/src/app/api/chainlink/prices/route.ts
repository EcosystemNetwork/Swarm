/**
 * Chainlink Price Feed API — Reads live prices from on-chain Chainlink oracles.
 *
 * GET /api/chainlink/prices?pairs=ETH/USD,BTC/USD&network=ethereum
 *
 * Calls AggregatorV3Interface.latestRoundData() via public RPCs.
 * Results are cached for 30 seconds per (pair, network) to avoid RPC spam.
 */
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { CHAINLINK } from "@/lib/chains";

// Minimal ABI — only what we need
const AGGREGATOR_ABI = [
    "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() external view returns (uint8)",
];

// ── In-memory cache (30s TTL) ──
interface CacheEntry {
    data: PriceResult;
    expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

interface PriceResult {
    pair: string;
    price: number;
    decimals: number;
    roundId: string;
    updatedAt: string;
    network: string;
    status: "success" | "error";
    error?: string;
}

// ── Provider pool (reuse across requests) ──
const providers = new Map<string, ethers.JsonRpcProvider>();

function getProvider(network: string): ethers.JsonRpcProvider | null {
    if (providers.has(network)) return providers.get(network)!;
    const rpc = CHAINLINK.rpcByNetwork[network];
    if (!rpc) return null;
    const provider = new ethers.JsonRpcProvider(rpc);
    providers.set(network, provider);
    return provider;
}

async function fetchPrice(pair: string, network: string): Promise<PriceResult> {
    const cacheKey = `${network}:${pair}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const feeds = CHAINLINK.priceFeeds[network];
    if (!feeds || !feeds[pair]) {
        return { pair, price: 0, decimals: 0, roundId: "", updatedAt: "", network, status: "error", error: `Feed ${pair} not found on ${network}` };
    }

    const provider = getProvider(network);
    if (!provider) {
        return { pair, price: 0, decimals: 0, roundId: "", updatedAt: "", network, status: "error", error: `No RPC for ${network}` };
    }

    try {
        const contract = new ethers.Contract(feeds[pair], AGGREGATOR_ABI, provider);
        const [roundData, decimals] = await Promise.all([
            contract.latestRoundData(),
            contract.decimals(),
        ]);

        const price = Number(roundData.answer) / 10 ** Number(decimals);
        const result: PriceResult = {
            pair,
            price,
            decimals: Number(decimals),
            roundId: roundData.roundId.toString(),
            updatedAt: new Date(Number(roundData.updatedAt) * 1000).toISOString(),
            network,
            status: "success",
        };

        cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
    } catch (err) {
        return {
            pair, price: 0, decimals: 0, roundId: "", updatedAt: "",
            network, status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const pairsParam = url.searchParams.get("pairs");
    const network = url.searchParams.get("network");

    // If no params, return all configured feeds across all networks
    if (!pairsParam && !network) {
        const results: PriceResult[] = [];
        for (const [net, feeds] of Object.entries(CHAINLINK.priceFeeds)) {
            if (!CHAINLINK.rpcByNetwork[net]) continue;
            const pairs = Object.keys(feeds);
            if (pairs.length === 0) continue;
            const fetches = pairs.map((p) => fetchPrice(p, net));
            results.push(...(await Promise.all(fetches)));
        }
        return NextResponse.json({ prices: results });
    }

    // Specific pairs on a specific (or default) network
    const pairs = pairsParam ? pairsParam.split(",").map((p) => p.trim()) : [];
    const nets = network ? [network] : Object.keys(CHAINLINK.priceFeeds).filter((n) => CHAINLINK.rpcByNetwork[n]);

    if (pairs.length === 0) {
        return NextResponse.json({ error: "Provide pairs query param or omit all params for full scan" }, { status: 400 });
    }

    const results: PriceResult[] = [];
    for (const net of nets) {
        const fetches = pairs.map((p) => fetchPrice(p, net));
        results.push(...(await Promise.all(fetches)));
    }

    return NextResponse.json({ prices: results.filter((r) => r.status === "success" || pairs.length === 1) });
}
