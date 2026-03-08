/** GitHub repos proxy — lists repositories accessible to the installation. */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../auth";
import { listInstallationRepos } from "@/lib/github";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const { ctx, error, status } = await resolveGitHubOrg(orgId, req);
  if (!ctx) return NextResponse.json({ error }, { status });

  try {
    const repos = await listInstallationRepos(ctx.installationId);
    return NextResponse.json({ repos });
  } catch (err) {
    console.error("GitHub repos error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
