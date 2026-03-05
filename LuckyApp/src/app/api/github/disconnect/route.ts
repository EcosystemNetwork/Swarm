/** GitHub disconnect — clears GitHub connection from an organization. */
import { NextRequest, NextResponse } from "next/server";
import { getOrganization, updateOrganization } from "@/lib/firestore";

export async function POST(req: NextRequest) {
  const { orgId } = await req.json();

  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  await updateOrganization(orgId, {
    githubInstallationId: undefined,
    githubAccountLogin: undefined,
    githubAccountType: undefined,
    githubAccountAvatarUrl: undefined,
    githubConnectedAt: undefined,
  } as Record<string, unknown>);

  return NextResponse.json({ ok: true });
}
