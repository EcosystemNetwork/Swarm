/**
 * GET    /api/compute/workspaces/[id]  — Get workspace details
 * PATCH  /api/compute/workspaces/[id]  — Update workspace
 * DELETE /api/compute/workspaces/[id]  — Delete workspace
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember, requireOrgAdmin } from "@/lib/auth-guard";
import { getWorkspace, updateWorkspace, deleteWorkspace } from "@/lib/compute/firestore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const auth = await requireOrgMember(req, workspace.orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  return Response.json({ ok: true, workspace });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const auth = await requireOrgAdmin(req, workspace.orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  const body = await req.json();
  const allowed = ["name", "description", "slug", "defaultAutoStopMinutes", "allowedInstanceSizes", "staticIpEnabled"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  await updateWorkspace(id, update);
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const auth = await requireOrgAdmin(req, workspace.orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  await deleteWorkspace(id);
  return Response.json({ ok: true });
}
