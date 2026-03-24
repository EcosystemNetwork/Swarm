/**
 * GET /api/meshy/jobs/:jobId?orgId=...
 *
 * Get a Meshy job by ID. If the job is active, syncs with Meshy API
 * to update progress and detect completion.
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import {
  isMeshyConfigured,
  getTextTo3DTask,
  getImageTo3DTask,
  getRigTask,
  getAnimationTask,
} from "@/lib/meshy";
import {
  getMeshyJob,
  updateMeshyJob,
  getJobAssets,
  createMeshyAsset,
} from "@/lib/meshy-store";

const ACTIVE_STATUSES = new Set(["pending", "preview", "refining", "rigging", "animating"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { jobId } = await params;
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return Response.json({ error: "orgId query param is required" }, { status: 400 });
  }

  const orgAuth = await requireOrgMember(req, orgId);
  if (!orgAuth.ok) {
    return Response.json({ error: orgAuth.error }, { status: orgAuth.status || 403 });
  }

  const job = await getMeshyJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.orgId !== orgId) {
    return Response.json({ error: "Job does not belong to this organization" }, { status: 403 });
  }

  // If active, sync with Meshy
  if (ACTIVE_STATUSES.has(job.status) && isMeshyConfigured()) {
    try {
      await syncJobWithMeshy(job);
    } catch {
      // Non-fatal — return stale data
    }
  }

  // Re-fetch after sync
  const updatedJob = await getMeshyJob(jobId);
  const assets = await getJobAssets(jobId);

  return Response.json({
    ok: true,
    job: {
      ...updatedJob,
      createdAt: updatedJob?.createdAt?.toDate?.()?.toISOString?.(),
      updatedAt: updatedJob?.updatedAt?.toDate?.()?.toISOString?.(),
      completedAt: updatedJob?.completedAt?.toDate?.()?.toISOString?.(),
    },
    assets: assets.map((a) => ({
      ...a,
      createdAt: a.createdAt?.toDate?.()?.toISOString?.(),
    })),
  });
}

async function syncJobWithMeshy(
  job: NonNullable<Awaited<ReturnType<typeof getMeshyJob>>>,
) {
  // Determine which Meshy task to check based on current status
  if (job.status === "preview" || job.status === "pending") {
    if (!job.previewTaskId) return;

    const task =
      job.jobType === "image-to-3d"
        ? await getImageTo3DTask(job.previewTaskId)
        : await getTextTo3DTask(job.previewTaskId);

    if (task.status === "SUCCEEDED") {
      // For text-to-3d, preview succeeds but we don't auto-refine
      // For image-to-3d (single-stage), this means the job is done
      if (job.jobType === "image-to-3d") {
        await completeJob(job, task);
      } else {
        // Preview done — waiting for user to trigger refine
        await updateMeshyJob(job.id, {
          status: "preview",
          progress: 20,
          thumbnailUrl: task.thumbnail_url,
          modelUrls: task.model_urls as Record<string, string> | undefined,
        });
      }
    } else if (task.status === "FAILED" || task.status === "EXPIRED" || task.status === "CANCELED") {
      await updateMeshyJob(job.id, {
        status: "failed",
        error: task.task_error?.message || `Task ${task.status.toLowerCase()}`,
      });
    } else {
      await updateMeshyJob(job.id, {
        progress: Math.min(task.progress * 0.2, 20),
      });
    }
  } else if (job.status === "refining") {
    if (!job.refineTaskId) return;
    const task = await getTextTo3DTask(job.refineTaskId);

    if (task.status === "SUCCEEDED") {
      await completeJob(job, task);
    } else if (task.status === "FAILED" || task.status === "EXPIRED" || task.status === "CANCELED") {
      await updateMeshyJob(job.id, {
        status: "failed",
        error: task.task_error?.message || `Refine ${task.status.toLowerCase()}`,
      });
    } else {
      await updateMeshyJob(job.id, {
        progress: 30 + Math.min(task.progress * 0.5, 50),
      });
    }
  } else if (job.status === "rigging") {
    if (!job.rigTaskId) return;
    const task = await getRigTask(job.rigTaskId);

    if (task.status === "SUCCEEDED" && task.rigged_character_glb_url) {
      await updateMeshyJob(job.id, {
        status: "completed",
        progress: 100,
        riggedModelUrl: task.rigged_character_glb_url,
      });
      await createMeshyAsset({
        jobId: job.id,
        orgId: job.orgId,
        userId: job.userId,
        agentId: job.agentId,
        assetType: "rigged-model",
        format: "glb",
        mimeType: "model/gltf-binary",
        url: task.rigged_character_glb_url,
        prompt: job.prompt,
      });
    } else if (task.status === "FAILED" || task.status === "CANCELED") {
      await updateMeshyJob(job.id, {
        status: "failed",
        error: task.task_error?.message || "Rigging failed",
      });
    } else {
      await updateMeshyJob(job.id, {
        progress: 80 + Math.min(task.progress * 0.2, 20),
      });
    }
  } else if (job.status === "animating") {
    if (!job.animationTaskId) return;
    const task = await getAnimationTask(job.animationTaskId);

    if (task.status === "SUCCEEDED" && task.animation_glb_url) {
      await updateMeshyJob(job.id, {
        status: "completed",
        progress: 100,
        animationUrl: task.animation_glb_url,
      });
      await createMeshyAsset({
        jobId: job.id,
        orgId: job.orgId,
        userId: job.userId,
        agentId: job.agentId,
        assetType: "animation",
        format: "glb",
        mimeType: "model/gltf-binary",
        url: task.animation_glb_url,
        prompt: job.prompt,
      });
    } else if (task.status === "FAILED" || task.status === "CANCELED") {
      await updateMeshyJob(job.id, {
        status: "failed",
        error: task.task_error?.message || "Animation failed",
      });
    } else {
      await updateMeshyJob(job.id, {
        progress: 85 + Math.min(task.progress * 0.15, 15),
      });
    }
  }
}

async function completeJob(
  job: NonNullable<Awaited<ReturnType<typeof getMeshyJob>>>,
  task: { model_urls?: { glb?: string; fbx?: string; obj?: string; mtl?: string; usdz?: string; stl?: string; pre_remeshed_glb?: string }; thumbnail_url?: string },
) {
  const raw = task.model_urls;
  const modelUrls: Record<string, string> | undefined = raw
    ? Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => !!e[1]))
    : undefined;
  await updateMeshyJob(job.id, {
    status: "completed",
    progress: 100,
    thumbnailUrl: task.thumbnail_url,
    modelUrls,
  });

  // Create asset records for each model format
  if (modelUrls) {
    const formatMime: Record<string, string> = {
      glb: "model/gltf-binary",
      fbx: "application/octet-stream",
      obj: "text/plain",
      usdz: "model/vnd.usdz+zip",
      stl: "application/sla",
    };

    for (const [format, url] of Object.entries(modelUrls)) {
      if (url && format !== "mtl" && format !== "pre_remeshed_glb") {
        await createMeshyAsset({
          jobId: job.id,
          orgId: job.orgId,
          userId: job.userId,
          agentId: job.agentId,
          assetType: "model",
          format,
          mimeType: formatMime[format] || "application/octet-stream",
          url,
          prompt: job.prompt,
        });
      }
    }
  }

  // Thumbnail asset
  if (task.thumbnail_url) {
    await createMeshyAsset({
      jobId: job.id,
      orgId: job.orgId,
      userId: job.userId,
      agentId: job.agentId,
      assetType: "thumbnail",
      format: "png",
      mimeType: "image/png",
      url: task.thumbnail_url,
      prompt: job.prompt,
    });
  }
}
