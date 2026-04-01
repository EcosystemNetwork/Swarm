/**
 * GET  /api/v1/flow/cid-verify  — List CID verifications
 * POST /api/v1/flow/cid-verify  — Create or update a CID verification
 */
import { NextRequest } from "next/server";
import { createCidVerification, getCidVerifications, updateCidVerification } from "@/lib/flow-superpowers";
import { incrementFlowASNStat } from "@/lib/flow-asn";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const verifications = await getCidVerifications(orgId);
    return Response.json({ count: verifications.length, verifications });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (action === "verify") {
            const { id, chain, verification } = body;
            if (!id || !chain) return Response.json({ error: "id and chain required" }, { status: 400 });
            await updateCidVerification(id, chain, verification || { verified: true });
            if (body.asn) await incrementFlowASNStat(body.asn, "totalCidVerifications").catch(() => {});
            return Response.json({ status: "verified" });
        }

        const { agentId, asn, cid, gatewayUrl, contentHash, sizeBytes } = body;
        if (!agentId || !cid) return Response.json({ error: "agentId and cid required" }, { status: 400 });

        const record = await createCidVerification({
            orgId, agentId, asn: asn || null, cid,
            gatewayUrl: gatewayUrl || "", verifications: {},
            contentHash: contentHash || "", sizeBytes: sizeBytes || 0,
            status: "pending",
        });

        return Response.json({ verification: record }, { status: 201 });
    } catch (err) {
        console.error("[flow/cid-verify POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
