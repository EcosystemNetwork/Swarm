/** GitHub Webhook receiver — verifies signature and stores events in Firestore. */
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/github";
import {
  createGitHubEvent,
  getProjectsByOrg,
  updateOrganization,
} from "@/lib/firestore";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";
  const eventType = req.headers.get("x-github-event") || "";

  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const installationId = payload.installation?.id;

  if (!installationId) {
    return NextResponse.json({ ok: true, skipped: "no_installation" });
  }

  // Look up the org by installation ID
  const orgQuery = query(
    collection(db, "organizations"),
    where("githubInstallationId", "==", installationId)
  );
  const orgSnap = await getDocs(orgQuery);
  if (orgSnap.empty) {
    return NextResponse.json({ ok: true, skipped: "org_not_found" });
  }

  const orgDoc = orgSnap.docs[0];
  const orgId = orgDoc.id;

  // Handle installation deleted
  if (eventType === "installation" && payload.action === "deleted") {
    await updateOrganization(orgId, {
      githubInstallationId: undefined,
      githubAccountLogin: undefined,
      githubAccountType: undefined,
      githubAccountAvatarUrl: undefined,
      githubConnectedAt: undefined,
    } as Record<string, unknown>);
    return NextResponse.json({ ok: true, event: "installation_deleted" });
  }

  // Resolve project by matching repo full name
  const repoFullName = payload.repository?.full_name;
  let projectId: string | undefined;

  if (repoFullName) {
    const projects = await getProjectsByOrg(orgId);
    const matched = projects.find((p) =>
      p.githubRepos?.some((r) => r.fullName === repoFullName)
    );
    if (matched) projectId = matched.id;
  }

  // Build event summary
  let title = "";
  let githubUrl = "";
  const actor = payload.sender?.login || "unknown";
  const actorAvatarUrl = payload.sender?.avatar_url || "";

  switch (eventType) {
    case "push": {
      const commits = payload.commits || [];
      const branch = (payload.ref || "").replace("refs/heads/", "");
      title = `Pushed ${commits.length} commit${commits.length !== 1 ? "s" : ""} to ${branch}`;
      githubUrl = payload.compare || "";
      break;
    }
    case "pull_request": {
      const pr = payload.pull_request;
      title = `PR #${pr.number} ${payload.action}: ${pr.title}`;
      githubUrl = pr.html_url;
      break;
    }
    case "issues": {
      const issue = payload.issue;
      title = `Issue #${issue.number} ${payload.action}: ${issue.title}`;
      githubUrl = issue.html_url;
      break;
    }
    case "issue_comment": {
      const issue = payload.issue;
      title = `Comment on #${issue.number}: ${issue.title}`;
      githubUrl = payload.comment?.html_url || issue.html_url;
      break;
    }
    default:
      title = `${eventType}${payload.action ? ` (${payload.action})` : ""}`;
      break;
  }

  // Store the event
  await createGitHubEvent({
    orgId,
    projectId,
    eventType,
    action: payload.action,
    repoFullName: repoFullName || "",
    title,
    actor,
    actorAvatarUrl,
    payload: {
      // Store a sanitized subset — not the full payload
      action: payload.action,
      ref: payload.ref,
      commits: payload.commits?.length,
      prNumber: payload.pull_request?.number,
      issueNumber: payload.issue?.number,
    },
    githubUrl,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, event: eventType });
}
