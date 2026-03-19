/** GitHub PRs proxy — list, create, merge, close, and review pull requests. */
import { NextRequest, NextResponse } from "next/server";
import { resolveGitHubOrg } from "../../../auth";
import {
  listPullRequests,
  createPullRequest,
  mergePullRequest,
  updatePullRequest,
  createPRReview,
  listPRComments,
} from "@/lib/github";

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
  const { orgId, action } = body;

  const { ctx, error, status } = await resolveGitHubOrg(orgId, req);
  if (!ctx) return NextResponse.json({ error }, { status });

  try {
    // Create PR (default action)
    if (!action || action === "create") {
      const { title, prBody, head, base } = body;
      if (!title || !head || !base) {
        return NextResponse.json({ error: "Missing title, head, or base" }, { status: 400 });
      }
      const pr = await createPullRequest(ctx.installationId, owner, repo, {
        title,
        body: prBody,
        head,
        base,
      });
      return NextResponse.json({ pr });
    }

    // Merge PR
    if (action === "merge") {
      const { prNumber, mergeMethod } = body;
      if (!prNumber) {
        return NextResponse.json({ error: "Missing prNumber" }, { status: 400 });
      }
      await mergePullRequest(ctx.installationId, owner, repo, prNumber, mergeMethod || "merge");
      return NextResponse.json({ ok: true, merged: true });
    }

    // Close PR
    if (action === "close") {
      const { prNumber } = body;
      if (!prNumber) {
        return NextResponse.json({ error: "Missing prNumber" }, { status: 400 });
      }
      const pr = await updatePullRequest(ctx.installationId, owner, repo, prNumber, "closed");
      return NextResponse.json({ pr });
    }

    // Reopen PR
    if (action === "reopen") {
      const { prNumber } = body;
      if (!prNumber) {
        return NextResponse.json({ error: "Missing prNumber" }, { status: 400 });
      }
      const pr = await updatePullRequest(ctx.installationId, owner, repo, prNumber, "open");
      return NextResponse.json({ pr });
    }

    // Review PR
    if (action === "review") {
      const { prNumber, reviewBody, event } = body;
      if (!prNumber || !event) {
        return NextResponse.json({ error: "Missing prNumber or event" }, { status: 400 });
      }
      await createPRReview(ctx.installationId, owner, repo, prNumber, reviewBody || "", event);
      return NextResponse.json({ ok: true });
    }

    // List comments on a PR
    if (action === "comments") {
      const { prNumber } = body;
      if (!prNumber) {
        return NextResponse.json({ error: "Missing prNumber" }, { status: 400 });
      }
      const comments = await listPRComments(ctx.installationId, owner, repo, prNumber);
      return NextResponse.json({ comments });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Operation failed" },
      { status: 500 }
    );
  }
}
