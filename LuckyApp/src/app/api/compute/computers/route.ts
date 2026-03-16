/**
 * GET  /api/compute/computers?orgId=xxx         — List computers for an org
 * GET  /api/compute/computers?workspaceId=xxx   — List computers in a workspace
 * POST /api/compute/computers                   — Create a new computer
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import {
  getComputers,
  getComputersByWorkspace,
  createComputer,
  getWorkspace,
} from "@/lib/compute/firestore";
import { SIZE_PRESETS, DEFAULT_AUTO_STOP_MINUTES, DEFAULT_RESOLUTION } from "@/lib/compute/types";
import type { SizeKey, Region, ControllerType, ModelKey, ComputerMode } from "@/lib/compute/types";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");

  if (!orgId && !workspaceId) {
    return Response.json({ error: "orgId or workspaceId required" }, { status: 400 });
  }

  if (workspaceId) {
    const ws = await getWorkspace(workspaceId);
    if (!ws) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const auth = await requireOrgMember(req, ws.orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

    const computers = await getComputersByWorkspace(workspaceId);
    return Response.json({ ok: true, computers });
  }

  const auth = await requireOrgMember(req, orgId!);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  const statusFilter = req.nextUrl.searchParams.get("status") || undefined;
  const computers = await getComputers(orgId!, { status: statusFilter as import("@/lib/compute/types").ComputerStatus | undefined });
  return Response.json({ ok: true, computers });
}

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const { workspaceId, name, sizeKey, region, controllerType, modelKey, mode } = body as {
    workspaceId: string;
    name: string;
    sizeKey?: SizeKey;
    region?: Region;
    controllerType?: ControllerType;
    modelKey?: ModelKey | null;
    mode?: ComputerMode;
  };

  if (!workspaceId || !name) {
    return Response.json({ error: "workspaceId and name are required" }, { status: 400 });
  }

  const ws = await getWorkspace(workspaceId);
  if (!ws) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const auth = await requireOrgMember(req, ws.orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  const size = sizeKey || "medium";
  const preset = SIZE_PRESETS[size];

  const id = await createComputer({
    workspaceId,
    orgId: ws.orgId,
    name,
    status: "stopped",
    provider: process.env.COMPUTE_PROVIDER || "stub",
    providerInstanceId: null,
    templateId: body.templateId || null,
    sizeKey: size,
    cpuCores: preset.cpu,
    ramMb: preset.ram,
    diskGb: preset.disk,
    resolutionWidth: body.resolutionWidth || DEFAULT_RESOLUTION.width,
    resolutionHeight: body.resolutionHeight || DEFAULT_RESOLUTION.height,
    region: region || "us-east",
    persistenceEnabled: body.persistenceEnabled ?? true,
    staticIpEnabled: body.staticIpEnabled ?? false,
    autoStopMinutes: body.autoStopMinutes ?? DEFAULT_AUTO_STOP_MINUTES,
    controllerType: controllerType || "human",
    modelKey: modelKey || null,
    createdByUserId: wallet,
  });

  return Response.json({ ok: true, id }, { status: 201 });
}
