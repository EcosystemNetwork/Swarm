/**
 * GET  /api/v1/eth-foundation/policies  — Get spending policy for an org
 * POST /api/v1/eth-foundation/policies  — Create/update spending policy
 */
import { NextRequest } from "next/server";
import { getEthPolicy, upsertEthPolicy } from "@/lib/eth-foundation-policy";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const policy = await getEthPolicy(orgId);
    return Response.json({ policy });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, updatedBy, ...policyFields } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const policy = await upsertEthPolicy(orgId, policyFields, updatedBy || "system");
        return Response.json({ policy }, { status: 201 });
    } catch (err) {
        console.error("[eth-foundation/policies POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
