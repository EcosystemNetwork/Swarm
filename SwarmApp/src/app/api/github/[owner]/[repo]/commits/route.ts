/** GitHub commits proxy — list recent commits. */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../../../auth";
import { listCommits } from "@/lib/github";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const orgId = req.nextUrl.searchParams.get("orgId");
  const branch = req.nextUrl.searchParams.get("branch") || undefined;

  const { ctx, error, status } = await resolveGitHubOrg(orgId, req);
  if (!ctx) return NextResponse.json({ error }, { status });

  try {
    const commits = await listCommits(ctx.installationId, owner, repo, branch);
    return NextResponse.json({ commits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch commits" },
      { status: 500 }
    );
  }
}
