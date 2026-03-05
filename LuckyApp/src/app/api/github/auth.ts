/** GitHub API auth helper — resolves orgId to organization + installation ID. */
import { getOrganization, type Organization } from "@/lib/firestore";

export interface GitHubOrgContext {
  org: Organization;
  installationId: number;
}

export async function resolveGitHubOrg(
  orgId: string | null
): Promise<{ ctx: GitHubOrgContext | null; error: string | null; status: number }> {
  if (!orgId) {
    return { ctx: null, error: "Missing orgId parameter", status: 400 };
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return { ctx: null, error: "Organization not found", status: 404 };
  }

  if (!org.githubInstallationId) {
    return { ctx: null, error: "GitHub not connected for this organization", status: 400 };
  }

  return {
    ctx: { org, installationId: org.githubInstallationId },
    error: null,
    status: 200,
  };
}
