/**
 * GET  /api/compute/workspaces?orgId=xxx  — List workspaces for an org
 * POST /api/compute/workspaces             — Create a new workspace
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember, requireOrgAdmin } from "@/lib/auth-guard";
import { getWorkspaces, createWorkspace } from "@/lib/compute/firestore";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

  const auth = await requireOrgMember(req, orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  const workspaces = await getWorkspaces(orgId);
  return Response.json({ ok: true, workspaces });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { orgId, name, description, slug } = body;

  if (!orgId || !name) {
    return Response.json({ error: "orgId and name are required" }, { status: 400 });
  }

  const auth = await requireOrgAdmin(req, orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  const id = await createWorkspace({
    orgId,
    ownerUserId: auth.walletAddress!,
    name,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    description: description || "",
    planTier: "free",
    defaultAutoStopMinutes: 30,
    allowedInstanceSizes: ["small", "medium", "large"],
    staticIpEnabled: false,
  });

  return Response.json({ ok: true, id }, { status: 201 });
}
