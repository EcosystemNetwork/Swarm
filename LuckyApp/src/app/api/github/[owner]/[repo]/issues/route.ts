/** GitHub issues proxy — list and create issues. */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../../../auth";
import { listIssues, createIssue } from "@/lib/github";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const orgId = req.nextUrl.searchParams.get("orgId");
  const state = req.nextUrl.searchParams.get("state") || "open";

  const { ctx, error, status } = await resolveGitHubOrg(orgId, req);
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const body = await req.json();
  const { orgId, title, issueBody, labels } = body;

  const { ctx, error, status } = await resolveGitHubOrg(orgId, req);
  if (!ctx) return NextResponse.json({ error }, { status });

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const issue = await createIssue(ctx.installationId, owner, repo, {
      title,
      body: issueBody,
      labels: labels || [],
    });
    return NextResponse.json({ issue });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create issue" },
      { status: 500 }
    );
  }
}
