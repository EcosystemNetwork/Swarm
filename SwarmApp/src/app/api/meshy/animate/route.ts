/**
 * POST /api/meshy/animate  — Create an animation task from a rigged model
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import { isMeshyConfigured, createAnimationTask, MESHY_ANIMATIONS } from "@/lib/meshy";
import { getMeshyJob, updateMeshyJob, createMeshyJob } from "@/lib/meshy-store";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: {
    orgId: string;
    jobId?: string;
    rigTaskId?: string;
    animationName?: string;
    animationActionId?: number;
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

  // Resolve rig task ID
  let rigTaskId: string | undefined;

  if (body.jobId) {
    const job = await getMeshyJob(body.jobId);
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
    if (job.orgId !== body.orgId) return Response.json({ error: "Job does not belong to this org" }, { status: 403 });
    rigTaskId = job.rigTaskId;
  } else if (body.rigTaskId) {
    rigTaskId = body.rigTaskId;
  }

  if (!rigTaskId) {
    return Response.json(
      { error: "Either jobId (with completed rig) or rigTaskId is required" },
      { status: 400 },
    );
  }

  // Resolve action ID
  let actionId = body.animationActionId;
  if (actionId == null && body.animationName) {
    const name = body.animationName as keyof typeof MESHY_ANIMATIONS;
    actionId = MESHY_ANIMATIONS[name];
  }
  if (actionId == null) {
    actionId = MESHY_ANIMATIONS.idle;
  }

  try {
    const animTaskId = await createAnimationTask(rigTaskId, actionId);

    if (body.jobId) {
      await updateMeshyJob(body.jobId, {
        status: "animating",
        progress: 85,
        animationTaskId: animTaskId,
        animationActionId: actionId,
      });
      return Response.json({ ok: true, jobId: body.jobId, animationTaskId: animTaskId });
    }

    const jobId = await createMeshyJob({
      orgId: body.orgId,
      userId: wallet,
      agentId: body.agentId,
      jobType: "animate",
      status: "animating",
      progress: 0,
      prompt: body.animationName || String(actionId),
      animationTaskId: animTaskId,
      animationActionId: actionId,
    });

    return Response.json({ ok: true, jobId, animationTaskId: animTaskId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create animation task" },
      { status: 500 },
    );
  }
}
