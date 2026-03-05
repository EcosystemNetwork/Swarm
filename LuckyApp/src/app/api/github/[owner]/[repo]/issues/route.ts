/** GitHub issues proxy — list issues (excludes PRs). */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../../../auth";
import { listIssues } from "@/lib/github";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const orgId = req.nextUrl.searchParams.get("orgId");
  const state = req.nextUrl.searchParams.get("state") || "open";

  const { ctx, error, status } = await resolveGitHubOrg(orgId);
  if (!ctx) return NextResponse.json({ error }, { status });

  try {
    const issues = await listIssues(ctx.installationId, owner, repo, state);
    return NextResponse.json({ issues });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch issues" },
      { status: 500 }
    );
  }
}
