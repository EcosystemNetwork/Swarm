/**
 * POST /api/meshy/rig  — Create a rigging task from a completed model
 *
 * Takes a completed text-to-3D or image-to-3D task and auto-rigs it
 * with a humanoid skeleton for animation.
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import { isMeshyConfigured, createRigTask } from "@/lib/meshy";
import { getMeshyJob, updateMeshyJob, createMeshyJob } from "@/lib/meshy-store";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: {
    orgId: string;
    jobId?: string;
    meshyTaskId?: string;
    agentId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  const orgAuth = await requireOrgMember(req, body.orgId);
  if (!orgAuth.ok) {
    return Response.json({ error: orgAuth.error }, { status: orgAuth.status || 403 });
  }

  if (!isMeshyConfigured()) {
    return Response.json(
      { error: "Meshy.ai is not configured. Set MESHY_API_KEY." },
      { status: 503 },
    );
  }

  // Determine the input task ID for rigging
  let inputTaskId: string | undefined;

  if (body.jobId) {
    const job = await getMeshyJob(body.jobId);
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.orgId !== body.orgId) {
      return Response.json({ error: "Job does not belong to this org" }, { status: 403 });
    }
    // Use refine task ID if available, otherwise preview
    inputTaskId = job.refineTaskId || job.previewTaskId;
  } else if (body.meshyTaskId) {
    inputTaskId = body.meshyTaskId;
  }

  if (!inputTaskId) {
    return Response.json(
      { error: "Either jobId or meshyTaskId is required" },
      { status: 400 },
    );
  }

  try {
    const rigTaskId = await createRigTask(inputTaskId);

    // If we have a parent job, update it
    if (body.jobId) {
      await updateMeshyJob(body.jobId, {
        status: "rigging",
        progress: 80,
        rigTaskId,
      });
      return Response.json({ ok: true, jobId: body.jobId, rigTaskId });
    }

    // Otherwise create a new job for the rig
    const jobId = await createMeshyJob({
      orgId: body.orgId,
      userId: wallet,
      agentId: body.agentId,
      jobType: "rig",
      status: "rigging",
      progress: 0,
      prompt: "",
      rigTaskId,
    });

    return Response.json({ ok: true, jobId, rigTaskId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create rig task" },
      { status: 500 },
    );
  }
}
