/**
 * GET  /api/v1/filecoin  — Storage deals, balance, CID lookup, stats
 * POST /api/v1/filecoin  — Create deals, verify PDP, migrate from Storacha
 */
import { NextRequest } from "next/server";
import {
    createStorageDeal, getStorageDeals, updateDealStatus, markPDPVerified,
    getFilecoinBalance, lookupCidOnFilecoin, getFilecoinStats,
    type FilecoinDealStatus,
} from "@/lib/filecoin-onchain";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const action = url.searchParams.get("action");

    if (action === "balance") {
        const address = url.searchParams.get("address");
        const network = (url.searchParams.get("network") || "calibnet") as "mainnet" | "calibnet";
        if (!address) return Response.json({ error: "address required" }, { status: 400 });
        try {
            const balance = await getFilecoinBalance(address, network);
            return Response.json({ balance });
        } catch (err) {
            return Response.json({ error: "Failed to query Filecoin balance" }, { status: 502 });
        }
    }

    if (action === "lookup") {
        const cid = url.searchParams.get("cid");
        if (!cid) return Response.json({ error: "cid required" }, { status: 400 });
        const result = await lookupCidOnFilecoin(cid);
        return Response.json({ lookup: result });
    }

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    if (action === "stats") {
        const stats = await getFilecoinStats(orgId);
        return Response.json({ stats });
    }

    const statusFilter = url.searchParams.get("status") as FilecoinDealStatus | null;
    const deals = await getStorageDeals(orgId, statusFilter || undefined);
    return Response.json({ count: deals.length, deals });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        switch (action) {
            case "create_deal": {
                const { agentId, asn, cid, sizeBytes, durationEpochs, pricePerEpoch, network, fromStoracha, storachaSpaceId } = body;
                if (!agentId || !cid || !sizeBytes) {
                    return Response.json({ error: "agentId, cid, and sizeBytes required" }, { status: 400 });
                }

                const duration = durationEpochs || 518400; // ~180 days default
                const price = pricePerEpoch || "0";
                const totalCost = (BigInt(price) * BigInt(duration)).toString();

                const deal = await createStorageDeal({
                    orgId, agentId, asn: asn || null, cid,
                    pieceCid: null, providerAddress: null, dealId: null,
                    sizeBytes, durationEpochs: duration,
                    pricePerEpoch: price, totalCost,
                    status: "proposed", pdpVerified: false, pdpLastVerifiedAt: null,
                    fromStoracha: fromStoracha || false,
                    storachaSpaceId: storachaSpaceId || null,
                    network: network || "calibnet",
                });
                return Response.json({ deal }, { status: 201 });
            }

            case "update_status": {
                const { dealId: id, status, onChainDealId, providerAddress, pieceCid } = body;
                if (!id || !status) return Response.json({ error: "dealId and status required" }, { status: 400 });
                await updateDealStatus(id, status, {
                    dealId: onChainDealId, providerAddress, pieceCid,
                    activatedAt: status === "active" ? new Date() : undefined,
                });
                return Response.json({ status: "updated" });
            }

            case "verify_pdp": {
                const { dealId: id } = body;
                if (!id) return Response.json({ error: "dealId required" }, { status: 400 });
                await markPDPVerified(id);
                return Response.json({ status: "pdp_verified" });
            }

            case "migrate_from_storacha": {
                const { agentId, asn, cid, sizeBytes, storachaSpaceId } = body;
                if (!agentId || !cid) return Response.json({ error: "agentId and cid required" }, { status: 400 });

                const deal = await createStorageDeal({
                    orgId, agentId, asn: asn || null, cid,
                    pieceCid: null, providerAddress: null, dealId: null,
                    sizeBytes: sizeBytes || 0,
                    durationEpochs: 518400,
                    pricePerEpoch: "0", totalCost: "0",
                    status: "proposed", pdpVerified: false, pdpLastVerifiedAt: null,
                    fromStoracha: true,
                    storachaSpaceId: storachaSpaceId || null,
                    network: "calibnet",
                });
                return Response.json({ deal, migratedFrom: "storacha" }, { status: 201 });
            }

            case "lookup_cid": {
                const { cid } = body;
                if (!cid) return Response.json({ error: "cid required" }, { status: 400 });
                const result = await lookupCidOnFilecoin(cid);
                return Response.json({ lookup: result });
            }

            default:
                return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (err) {
        console.error("[filecoin POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
