/**
 * GET /api/meshy/jobs/list?orgId=...&status=...
 *
 * List Meshy jobs for an org with optional status filter.
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import { getOrgMeshyJobs, type MeshyJobStatus } from "@/lib/meshy-store";

const VALID_STATUSES = new Set([
  "pending", "preview", "refining", "rigging", "animating", "completed", "failed", "canceled",
]);

export async function GET(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return Response.json({ error: "orgId query param is required" }, { status: 400 });
  }

  const orgAuth = await requireOrgMember(req, orgId);
  if (!orgAuth.ok) {
    return Response.json({ error: orgAuth.error }, { status: orgAuth.status || 403 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  const status = statusParam && VALID_STATUSES.has(statusParam)
    ? (statusParam as MeshyJobStatus)
    : undefined;

  try {
    const jobs = await getOrgMeshyJobs(orgId, status);
    return Response.json({
      ok: true,
      jobs: jobs.map((j) => ({
        ...j,
        createdAt: j.createdAt?.toDate?.()?.toISOString?.(),
        updatedAt: j.updatedAt?.toDate?.()?.toISOString?.(),
        completedAt: j.completedAt?.toDate?.()?.toISOString?.(),
      })),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list jobs" },
      { status: 500 },
    );
  }
}
