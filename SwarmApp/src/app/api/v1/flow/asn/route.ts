/**
 * GET  /api/v1/flow/asn  — Get Flow ASN records for an org
 * POST /api/v1/flow/asn  — Create/link Flow ASN record
 */
import { NextRequest } from "next/server";
import { ensureFlowASNRecord, getFlowASNRecordsByOrg, getFlowASNRecord, linkFlowWallet, markFlowOnChainRegistered } from "@/lib/flow-asn";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    const asn = req.nextUrl.searchParams.get("asn");

    if (!orgId && !asn) return Response.json({ error: "orgId or asn required" }, { status: 400 });

    if (asn) {
        const record = await getFlowASNRecord(asn);
        if (!record) return Response.json({ error: "ASN not found" }, { status: 404 });
        return Response.json({ record });
    }

    const auth = await requireOrgMember(req, orgId!);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const records = await getFlowASNRecordsByOrg(orgId!);
    return Response.json({ count: records.length, records });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (action === "link_wallet") {
            const { asn, address, network, isPrimary } = body;
            if (!asn || !address) return Response.json({ error: "asn and address required" }, { status: 400 });
            await linkFlowWallet(asn, address, network || "testnet", isPrimary);
            return Response.json({ status: "linked" });
        }

        if (action === "register_onchain") {
            const { asn, txHash } = body;
            if (!asn || !txHash) return Response.json({ error: "asn and txHash required" }, { status: 400 });
            await markFlowOnChainRegistered(asn, txHash);
            return Response.json({ status: "registered" });
        }

        // Default: ensure record exists
        const { agentId, asn } = body;
        if (!agentId || !asn) return Response.json({ error: "agentId and asn required" }, { status: 400 });

        const record = await ensureFlowASNRecord(asn, orgId, agentId);
        return Response.json({ record }, { status: 201 });
    } catch (err) {
        console.error("[flow/asn POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
