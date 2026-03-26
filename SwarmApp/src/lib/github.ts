/** GitHub App — Server-side client for GitHub App authentication, API calls, and webhook verification. */
import jwt from "jsonwebtoken";
import crypto from "crypto";

// ─── Configuration ──────────────────────────────────────

function getAppId(): string {
  return process.env.GITHUB_APP_ID || "";
}

function getPrivateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY || "";
  // Support base64-encoded PEM (multiline PEMs don't work in .env)
  if (raw && !raw.startsWith("-----")) {
    return Buffer.from(raw, "base64").toString("utf-8");
  }
  return raw;
}

function getWebhookSecret(): string {
  return process.env.GITHUB_WEBHOOK_SECRET || "";
}

// ─── Types ──────────────────────────────────────────────

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  updated_at: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  user: { login: string; avatar_url: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  body: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  draft?: boolean;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string; avatar_url: string } | null;
  html_url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  user: { login: string; avatar_url: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  body: string | null;
  labels: Array<{ name: string; color: string }>;
  pull_request?: unknown;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    avatar_url: string;
    type: string;
  };
  app_id: number;
}

export interface CreatePRInput {
  title: string;
  body?: string;
  head: string;
  base: string;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
}

export interface GitHubComment {
  id: number;
  body: string;
  user: { login: string; avatar_url: string };
  html_url: string;
  created_at: string;
}

// ─── HMAC State Signing (CSRF protection for OAuth callbacks) ──

/**
 * Sign an OAuth state parameter with HMAC-SHA256 to prevent CSRF/tampering.
 * Format: `orgId.hmac_hex`
 */
export function signOAuthState(orgId: string): string {
  const secret = getWebhookSecret(); // reuse webhook secret as HMAC key
  if (!secret) return orgId; // fallback if no secret configured
  const sig = crypto.createHmac("sha256", secret).update(orgId, "utf-8").digest("hex");
  return `${orgId}.${sig}`;
}

/**
 * Verify and extract the orgId from a signed OAuth state parameter.
 * Returns the orgId on success, or null if the signature is invalid.
 */
export function verifyOAuthState(state: string): string | null {
  const secret = getWebhookSecret();
  if (!secret) return state; // fallback if no secret configured

  const dotIndex = state.lastIndexOf(".");
  if (dotIndex === -1) return null; // unsigned state — reject

  const orgId = state.slice(0, dotIndex);
  const sig = state.slice(dotIndex + 1);

  const expected = crypto.createHmac("sha256", secret).update(orgId, "utf-8").digest("hex");
  try {
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return orgId;
    }
  } catch {
    // length mismatch
  }
  return null;
}

// ─── JWT Generation ─────────────────────────────────────

function generateAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now - 60,
      exp: now + 600,
      iss: getAppId(),
    },
    getPrivateKey(),
    { algorithm: "RS256" }
  );
}

// ─── Installation Access Token (cached) ─────────────────

const tokenCache = new Map<
  number,
  { token: string; expiresAt: number }
>();

export async function getInstallationToken(
  installationId: number
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const appJwt = generateAppJwt();
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache.set(installationId, {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  });
  return data.token;
}

// ─── Authenticated GitHub API ───────────────────────────

export async function githubApi<T = unknown>(
  installationId: number,
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = await getInstallationToken(installationId);
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${path}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── App-level API (no installation token) ──────────────

export async function githubAppApi<T = unknown>(path: string): Promise<T> {
  const appJwt = generateAppJwt();
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub App API ${res.status} ${path}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Webhook Signature Verification ─────────────────────

export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const secret = getWebhookSecret();
  if (!secret || !signature) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

// ─── High-level API Functions ───────────────────────────

export async function getInstallation(
  installationId: number
): Promise<GitHubInstallation> {
  return githubAppApi<GitHubInstallation>(
    `/app/installations/${installationId}`
  );
}

export async function listInstallationRepos(
  installationId: number
): Promise<GitHubRepo[]> {
  const data = await githubApi<{ repositories: GitHubRepo[] }>(
    installationId,
    "/installation/repositories?per_page=100"
  );
  return data.repositories;
}

export async function listPullRequests(
  installationId: number,
  owner: string,
  repo: string,
  state: string = "open"
): Promise<GitHubPR[]> {
  return githubApi<GitHubPR[]>(
    installationId,
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`
  );
}

export async function getPullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPR> {
  return githubApi<GitHubPR>(
    installationId,
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );
}

export async function createPullRequest(
  installationId: number,
  owner: string,
  repo: string,
  input: CreatePRInput
): Promise<GitHubPR> {
  return githubApi<GitHubPR>(
    installationId,
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function listCommits(
  installationId: number,
  owner: string,
  repo: string,
  branch?: string
): Promise<GitHubCommit[]> {
  const branchParam = branch ? `&sha=${branch}` : "";
  return githubApi<GitHubCommit[]>(
    installationId,
    `/repos/${owner}/${repo}/commits?per_page=30${branchParam}`
  );
}

export async function listIssues(
  installationId: number,
  owner: string,
  repo: string,
  state: string = "open"
): Promise<GitHubIssue[]> {
  const all = await githubApi<GitHubIssue[]>(
    installationId,
    `/repos/${owner}/${repo}/issues?state=${state}&per_page=30&sort=updated&direction=desc`
  );
  // GitHub's issues endpoint also returns PRs — filter them out
  return all.filter((i) => !i.pull_request);
}

export async function listBranches(
  installationId: number,
  owner: string,
  repo: string
): Promise<GitHubBranch[]> {
  return githubApi<GitHubBranch[]>(
    installationId,
    `/repos/${owner}/${repo}/branches?per_page=100`
  );
}

export async function createIssueComment(
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  await githubApi(
    installationId,
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    }
  );
}

export async function createPRReview(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
): Promise<void> {
  await githubApi(
    installationId,
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    {
      method: "POST",
      body: JSON.stringify({ body, event }),
    }
  );
}

export async function createIssue(
  installationId: number,
  owner: string,
  repo: string,
  input: CreateIssueInput
): Promise<GitHubIssue> {
  return githubApi<GitHubIssue>(
    installationId,
    `/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function mergePullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  mergeMethod: "merge" | "squash" | "rebase" = "merge"
): Promise<void> {
  await githubApi(
    installationId,
    `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({ merge_method: mergeMethod }),
    }
  );
}

export async function updatePullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  state: "open" | "closed"
): Promise<GitHubPR> {
  return githubApi<GitHubPR>(
    installationId,
    `/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      method: "PATCH",
      body: JSON.stringify({ state }),
    }
  );
}

export async function listPRComments(
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubComment[]> {
  return githubApi<GitHubComment[]>(
    installationId,
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=50&sort=created&direction=asc`
  );
}
