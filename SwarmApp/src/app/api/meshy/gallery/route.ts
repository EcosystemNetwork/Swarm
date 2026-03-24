/**
 * GET /api/meshy/gallery?orgId=...&limit=...
 *
 * Returns completed jobs with their assets for gallery display.
 * Joins jobs + assets into a single response.
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import {
  getCompletedJobs,
  getJobAssets,
  getOrgMeshyStats,
} from "@/lib/meshy-store";

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

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10), 50);

  try {
    const [jobs, stats] = await Promise.all([
      getCompletedJobs(orgId, limit),
      getOrgMeshyStats(orgId),
    ]);

    const jobsWithAssets = await Promise.all(
      jobs.map(async (job) => {
        const assets = await getJobAssets(job.id);
        return {
          id: job.id,
          jobType: job.jobType,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          texturePrompt: job.texturePrompt,
          aiModel: job.aiModel,
          modelType: job.modelType,
          targetPolycount: job.targetPolycount,
          poseMode: job.poseMode,
          thumbnailUrl: job.thumbnailUrl,
          modelUrls: job.modelUrls,
          isFavorite: job.isFavorite,
          tags: job.tags,
          createdAt: job.createdAt?.toDate?.()?.toISOString?.(),
          completedAt: job.completedAt?.toDate?.()?.toISOString?.(),
          assets: assets.map((a) => ({
            id: a.id,
            assetType: a.assetType,
            format: a.format,
            mimeType: a.mimeType,
            url: a.url,
            filename: a.filename,
          })),
        };
      }),
    );

    return Response.json({
      ok: true,
      stats,
      gallery: jobsWithAssets,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch gallery" },
      { status: 500 },
    );
  }
}
