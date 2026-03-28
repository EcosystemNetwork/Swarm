/**
 * GET /api/v1/ton/balance
 *
 * Read TON wallet balance + Jetton holdings via TON Center API v3.
 *
 * Query params: address, network? ("mainnet" | "testnet"), includeJettons? ("true")
 * Returns: { address, balanceTon, balanceNano, jettons?, fetchedAt }
 */
import { NextRequest } from "next/server";
import { nanoToTon } from "@/lib/ton-policy";
import { getWalletAddress } from "@/lib/auth-guard";

const TON_CENTER_MAINNET = "https://toncenter.com/api/v3";
const TON_CENTER_TESTNET = "https://testnet.toncenter.com/api/v3";

interface JettonWallet {
    balance: string;
    jetton: {
        address: string;
        symbol: string;
        name: string;
        decimals: number;
        image?: string;
    };
}

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const address = url.searchParams.get("address");
    const network = url.searchParams.get("network") || "mainnet";
    const includeJettons = url.searchParams.get("includeJettons") === "true";

    if (!address) {
        return Response.json({ error: "address is required" }, { status: 400 });
    }

    if (!getWalletAddress(req)) {
        return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const base = network === "testnet" ? TON_CENTER_TESTNET : TON_CENTER_MAINNET;
    const apiKey = process.env.TON_CENTER_API_KEY;
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;

    try {
        // Fetch account balance
        const accountRes = await fetch(
            `${base}/account?address=${encodeURIComponent(address)}`,
            { headers },
        );

        if (!accountRes.ok) {
            const errText = await accountRes.text();
            console.error("[ton/balance] TON Center error:", errText);
            return Response.json(
                { error: "Failed to fetch balance from TON Center", detail: errText },
                { status: 502 },
            );
        }

        const accountData = await accountRes.json() as { balance?: string; status?: string };
        const balanceNano = accountData.balance || "0";

        const result: Record<string, unknown> = {
            address,
            network,
            balanceTon: nanoToTon(balanceNano),
            balanceNano,
            accountStatus: accountData.status || "active",
            fetchedAt: new Date().toISOString(),
        };

        if (includeJettons) {
            const jettonRes = await fetch(
                `${base}/jetton/wallets?owner_address=${encodeURIComponent(address)}&limit=50`,
                { headers },
            );

            if (jettonRes.ok) {
                const jettonData = await jettonRes.json() as { jetton_wallets?: JettonWallet[] };
                result.jettons = (jettonData.jetton_wallets || []).map((jw) => ({
                    contractAddress: jw.jetton.address,
                    symbol: jw.jetton.symbol,
                    name: jw.jetton.name,
                    decimals: jw.jetton.decimals,
                    image: jw.jetton.image || null,
                    balance: (Number(jw.balance) / Math.pow(10, jw.jetton.decimals)).toFixed(
                        Math.min(jw.jetton.decimals, 6),
                    ),
                    balanceRaw: jw.balance,
                }));
            }
        }

        return Response.json(result);
    } catch (err) {
        console.error("[ton/balance]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
