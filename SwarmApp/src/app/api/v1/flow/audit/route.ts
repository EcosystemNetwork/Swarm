/**
 * GET /api/v1/flow/audit — List audit entries for an org
 */
import { NextRequest } from "next/server";
import { getFlowAudit } from "@/lib/flow-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const cursor = url.searchParams.get("cursor") || undefined;
    const { entries, nextCursor } = await getFlowAudit(orgId, limit, cursor);
    return Response.json({ count: entries.length, entries, nextCursor });
}
