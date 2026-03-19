/** GitHub API auth helper — resolves orgId to organization + installation ID.
 *  Now includes org membership verification via x-wallet-address header.
 */
import { getOrganization, type Organization } from "@/lib/firestore";
import { NextRequest } from "next/server";

export interface GitHubOrgContext {
  org: Organization;
  installationId: number;
}

/**
 * Resolve an orgId to a GitHub-connected organization.
 * When a NextRequest is provided, also verifies the caller is a member of the org.
 */
export async function resolveGitHubOrg(
  orgId: string | null,
  req?: NextRequest,
): Promise<{ ctx: GitHubOrgContext | null; error: string | null; status: number }> {
  if (!orgId) {
    return { ctx: null, error: "Missing orgId parameter", status: 400 };
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return { ctx: null, error: "Organization not found", status: 404 };
  }

  // Verify caller is an org member/owner when request is provided
  if (req) {
    const wallet = req.headers.get("x-wallet-address")?.toLowerCase();
    if (!wallet) {
      return { ctx: null, error: "Missing x-wallet-address header", status: 401 };
    }

    const isOwner = org.ownerAddress?.toLowerCase() === wallet;
    const isMember = org.members?.some((m) => m.toLowerCase() === wallet);

    if (!isOwner && !isMember) {
      return { ctx: null, error: "Not a member of this organization", status: 403 };
    }
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
