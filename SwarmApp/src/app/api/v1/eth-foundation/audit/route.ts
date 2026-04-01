/**
 * GET /api/v1/eth-foundation/audit  — Get audit log entries for an org
 */
import { NextRequest } from "next/server";
import { getEthAudit } from "@/lib/eth-foundation-policy";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const { entries, nextCursor } = await getEthAudit(orgId, limit, cursor);

    return Response.json({ count: entries.length, entries, nextCursor });
}
