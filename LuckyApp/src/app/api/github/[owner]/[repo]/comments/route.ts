/** GitHub comments proxy — post a comment on an issue or PR. */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../../../auth";
import { createIssueComment } from "@/lib/github";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const body = await req.json();
  const { orgId, issueNumber, comment } = body;

  const { ctx, error, status } = await resolveGitHubOrg(orgId, req);
  if (!ctx) return NextResponse.json({ error }, { status });

  if (!issueNumber || !comment) {
    return NextResponse.json({ error: "Missing issueNumber or comment" }, { status: 400 });
  }

  try {
    await createIssueComment(ctx.installationId, owner, repo, issueNumber, comment);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post comment" },
      { status: 500 }
    );
  }
}
