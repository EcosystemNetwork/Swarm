/**
 * GET /api/v1/ton/audit
 *
 * Fetch the TON audit log for an org.
 * Query params: orgId, limit? (default 100), event? (filter by event type)
 * Returns: { count, entries }
 */
import { NextRequest } from "next/server";
import { getTonAudit } from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const eventFilter = url.searchParams.get("event");

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const cursor = url.searchParams.get("cursor") || undefined;
    const { entries: allEntries, nextCursor } = await getTonAudit(orgId, limit, cursor);
    const entries = eventFilter ? allEntries.filter((e) => e.event === eventFilter) : allEntries;

    return Response.json({ count: entries.length, entries, nextCursor });
}
