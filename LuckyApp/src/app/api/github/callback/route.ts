/** GitHub OAuth callback — handles GitHub App installation redirect. */
import { NextRequest, NextResponse } from "next/server";
import { getInstallation } from "@/lib/github";
import { getOrganization, updateOrganization } from "@/lib/firestore";
import { serverTimestamp } from "firebase/firestore";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");
  const orgId = searchParams.get("state");

  // Validate params
  if (!installationId || !orgId) {
    return NextResponse.redirect(
      new URL("/settings?github=error&reason=missing_params", req.url)
    );
  }

  // Verify org exists
  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.redirect(
      new URL("/settings?github=error&reason=org_not_found", req.url)
    );
  }

  try {
    if (setupAction === "install" || setupAction === "update") {
      // Fetch installation details from GitHub
      const installation = await getInstallation(Number(installationId));

      // Store on the organization
      await updateOrganization(orgId, {
        githubInstallationId: installation.id,
        githubAccountLogin: installation.account.login,
        githubAccountType: installation.account.type as "Organization" | "User",
        githubAccountAvatarUrl: installation.account.avatar_url,
        githubConnectedAt: serverTimestamp(),
      } as Partial<typeof org>);
    }

    return NextResponse.redirect(
      new URL("/settings?github=connected", req.url)
    );
  } catch (err) {
    console.error("GitHub callback error:", err);
    return NextResponse.redirect(
      new URL("/settings?github=error&reason=api_error", req.url)
    );
  }
}
