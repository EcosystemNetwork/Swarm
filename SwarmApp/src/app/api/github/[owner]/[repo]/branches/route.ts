/** GitHub branches proxy — list branches. */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../../../auth";
import { listBranches } from "@/lib/github";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const orgId = req.nextUrl.searchParams.get("orgId");

  const { ctx, error, status } = await resolveGitHubOrg(orgId, req);
  if (!ctx) return NextResponse.json({ error }, { status });

  try {
    const branches = await listBranches(ctx.installationId, owner, repo);
    return NextResponse.json({ branches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch branches" },
      { status: 500 }
    );
  }
}
