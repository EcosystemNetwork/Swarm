/**
 * POST /api/meshy/text-to-3d  — Create a text-to-3D preview or refine task
 * GET  /api/meshy/text-to-3d  — List text-to-3D tasks from Meshy
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import {
  isMeshyConfigured,
  createTextTo3DPreview,
  createTextTo3DRefine,
  listTextTo3DTasks,
} from "@/lib/meshy";
import { createMeshyJob, updateMeshyJob } from "@/lib/meshy-store";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: {
    orgId: string;
    mode: "preview" | "refine";
    prompt?: string;
    negativePrompt?: string;
    texturePrompt?: string;
    textureImageUrl?: string;
    previewTaskId?: string;
    aiModel?: string;
    modelType?: string;
    topology?: string;
    targetPolycount?: number;
    targetFormats?: string[];
    enablePbr?: boolean;
    poseMode?: string;
    symmetryMode?: string;
    agentId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, mode } = body;
  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  if (mode === "preview" && !body.prompt) {
    return Response.json({ error: "prompt is required for preview mode" }, { status: 400 });
  }
  if (mode === "refine" && !body.previewTaskId) {
    return Response.json({ error: "previewTaskId is required for refine mode" }, { status: 400 });
  }

  const orgAuth = await requireOrgMember(req, orgId);
  if (!orgAuth.ok) {
    return Response.json({ error: orgAuth.error }, { status: orgAuth.status || 403 });
  }

  if (!isMeshyConfigured()) {
    return Response.json(
      { error: "Meshy.ai is not configured. Set MESHY_API_KEY." },
      { status: 503 },
    );
  }

  try {
    if (mode === "preview") {
      const meshyTaskId = await createTextTo3DPreview({
        prompt: body.prompt!,
        negativePrompt: body.negativePrompt,
        aiModel: (body.aiModel as "meshy-5" | "meshy-6" | "latest") || "meshy-6",
        modelType: (body.modelType as "standard" | "lowpoly") || "standard",
        topology: (body.topology as "quad" | "triangle") || "triangle",
        targetPolycount: body.targetPolycount || 30000,
        poseMode: (body.poseMode as "" | "a-pose" | "t-pose") || "",
        symmetryMode: (body.symmetryMode as "off" | "auto" | "on") || "auto",
        targetFormats: (body.targetFormats as ("glb" | "obj" | "fbx" | "stl" | "usdz")[]) || ["glb"],
      });

      const jobId = await createMeshyJob({
        orgId,
        userId: wallet,
        agentId: body.agentId,
        jobType: "text-to-3d",
        status: "preview",
        progress: 0,
        prompt: body.prompt!,
        negativePrompt: body.negativePrompt,
        aiModel: body.aiModel || "meshy-6",
        modelType: body.modelType || "standard",
        topology: body.topology || "triangle",
        targetPolycount: body.targetPolycount || 30000,
        targetFormats: body.targetFormats || ["glb"],
        enablePbr: body.enablePbr,
        poseMode: body.poseMode,
        symmetryMode: body.symmetryMode,
        previewTaskId: meshyTaskId,
      });

      return Response.json({
        ok: true,
        jobId,
        meshyTaskId,
        mode: "preview",
      });
    }

    // Refine mode
    const meshyTaskId = await createTextTo3DRefine({
      previewTaskId: body.previewTaskId!,
      texturePrompt: body.texturePrompt,
      textureImageUrl: body.textureImageUrl,
      enablePbr: body.enablePbr ?? true,
      aiModel: (body.aiModel as "meshy-5" | "meshy-6" | "latest") || "meshy-6",
      targetFormats: (body.targetFormats as ("glb" | "obj" | "fbx" | "stl" | "usdz")[]) || ["glb"],
    });

    // Find existing job by previewTaskId and update it, or create new
    const jobId = await createMeshyJob({
      orgId,
      userId: wallet,
      agentId: body.agentId,
      jobType: "text-to-3d",
      status: "refining",
      progress: 30,
      prompt: body.prompt || "",
      texturePrompt: body.texturePrompt,
      previewTaskId: body.previewTaskId,
      refineTaskId: meshyTaskId,
      enablePbr: body.enablePbr ?? true,
      targetFormats: body.targetFormats || ["glb"],
    });

    return Response.json({
      ok: true,
      jobId,
      meshyTaskId,
      mode: "refine",
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create task" },
      { status: 500 },
    );
  }
}

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

  if (!isMeshyConfigured()) {
    return Response.json(
      { error: "Meshy.ai is not configured. Set MESHY_API_KEY." },
      { status: 503 },
    );
  }

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const pageSize = Math.min(parseInt(req.nextUrl.searchParams.get("pageSize") || "10", 10), 50);

  try {
    const tasks = await listTextTo3DTasks(page, pageSize);
    return Response.json({ ok: true, tasks });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list tasks" },
      { status: 500 },
    );
  }
}
