/**
 * POST /api/meshy/image-to-3d  — Create an image-to-3D task
 * GET  /api/meshy/image-to-3d  — List image-to-3D tasks from Meshy
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import {
  isMeshyConfigured,
  createImageTo3D,
  listImageTo3DTasks,
} from "@/lib/meshy";
import { createMeshyJob } from "@/lib/meshy-store";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: {
    orgId: string;
    imageUrl: string;
    aiModel?: string;
    modelType?: string;
    topology?: string;
    targetPolycount?: number;
    shouldTexture?: boolean;
    enablePbr?: boolean;
    poseMode?: string;
    texturePrompt?: string;
    targetFormats?: string[];
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
  if (!body.imageUrl) {
    return Response.json({ error: "imageUrl is required" }, { status: 400 });
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

  try {
    const meshyTaskId = await createImageTo3D({
      imageUrl: body.imageUrl,
      aiModel: (body.aiModel as "meshy-5" | "meshy-6" | "latest") || "meshy-6",
      modelType: (body.modelType as "standard" | "lowpoly") || "standard",
      topology: (body.topology as "quad" | "triangle") || "triangle",
      targetPolycount: body.targetPolycount || 30000,
      shouldTexture: body.shouldTexture ?? true,
      enablePbr: body.enablePbr,
      poseMode: (body.poseMode as "" | "a-pose" | "t-pose") || "",
      texturePrompt: body.texturePrompt,
      targetFormats: (body.targetFormats as ("glb" | "obj" | "fbx" | "stl" | "usdz")[]) || ["glb"],
    });

    const jobId = await createMeshyJob({
      orgId: body.orgId,
      userId: wallet,
      agentId: body.agentId,
      jobType: "image-to-3d",
      status: "preview",
      progress: 0,
      prompt: body.texturePrompt || "",
      imageUrl: body.imageUrl,
      aiModel: body.aiModel || "meshy-6",
      modelType: body.modelType || "standard",
      topology: body.topology || "triangle",
      targetPolycount: body.targetPolycount || 30000,
      targetFormats: body.targetFormats || ["glb"],
      enablePbr: body.enablePbr,
      previewTaskId: meshyTaskId,
    });

    return Response.json({
      ok: true,
      jobId,
      meshyTaskId,
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
    const tasks = await listImageTo3DTasks(page, pageSize);
    return Response.json({ ok: true, tasks });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list tasks" },
      { status: 500 },
    );
  }
}
