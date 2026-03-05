/** GitHub PRs proxy — list and create pull requests. */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../../../auth";
import { listPullRequests, createPullRequest } from "@/lib/github";

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
    const pulls = await listPullRequests(ctx.installationId, owner, repo, state);
    return NextResponse.json({ pulls });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch PRs" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const body = await req.json();
  const { orgId, title, prBody, head, base } = body;

  const { ctx, error, status } = await resolveGitHubOrg(orgId);
  if (!ctx) return NextResponse.json({ error }, { status });

  if (!title || !head || !base) {
    return NextResponse.json({ error: "Missing title, head, or base" }, { status: 400 });
  }

  try {
    const pr = await createPullRequest(ctx.installationId, owner, repo, {
      title,
      body: prBody,
      head,
      base,
    });
    return NextResponse.json({ pr });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create PR" },
      { status: 500 }
    );
  }
}
