/**
 * GET /api/v1/flow/balance — Get FLOW balance for an address
 *
 * Query: address, network (mainnet|testnet)
 *
 * Uses Flow REST Access API to query account balance.
 */
import { NextRequest } from "next/server";
import { FLOW_ACCESS_NODES } from "@/lib/flow-deploy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const address = req.nextUrl.searchParams.get("address");
    const network = (req.nextUrl.searchParams.get("network") || "testnet") as "mainnet" | "testnet";
    const orgId = req.nextUrl.searchParams.get("orgId");

    if (!address) {
        return Response.json({ error: "address required" }, { status: 400 });
    }

    // Auth check when orgId provided (dashboard context)
    if (orgId) {
        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const accessNode = FLOW_ACCESS_NODES[network];
        const res = await fetch(`${accessNode}/v1/accounts/${address}`, {
            headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
            return Response.json(
                { error: `Flow access node returned ${res.status}`, network },
                { status: 502 },
            );
        }

        const data = await res.json();
        const balanceRaw = data.balance || "0";
        // Flow REST API returns balance in "mini-FLOW" (10^-8 FLOW)
        const balanceFlow = (Number(balanceRaw) / 1e8).toFixed(8);

        return Response.json({
            address,
            network,
            balanceRaw,
            balanceFlow,
            keys: data.keys?.length || 0,
        });
    } catch (err) {
        console.error("[flow/balance]", err);
        return Response.json({ error: "Failed to query Flow balance" }, { status: 500 });
    }
}
