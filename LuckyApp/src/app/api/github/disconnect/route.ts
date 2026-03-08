/** GitHub disconnect — clears GitHub connection from an organization.
 *  Auth: org admin (owner) only.
 */
import { NextRequest, NextResponse } from "next/server";
import { updateOrganization } from "@/lib/firestore";
import { requireOrgAdmin } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  const { orgId } = await req.json();

  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  // Auth: only org owner can disconnect GitHub
  const auth = await requireOrgAdmin(req, orgId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
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