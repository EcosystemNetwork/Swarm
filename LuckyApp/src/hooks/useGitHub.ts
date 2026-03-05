/** useGitHub — Client-side hooks for GitHub API proxy calls. */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";
import type { GitHubRepo, GitHubPR, GitHubCommit, GitHubIssue, GitHubBranch } from "@/lib/github";

// Re-export types for convenience
export type { GitHubRepo, GitHubPR, GitHubCommit, GitHubIssue, GitHubBranch };

// ─── Repos ──────────────────────────────────────────────

export function useGitHubRepos() {
  const { currentOrg } = useOrg();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!currentOrg?.githubInstallationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/github/repos?orgId=${currentOrg.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch repos");
      setRepos(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repos");
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { repos, loading, error, refetch: fetch_ };
}

// ─── Pull Requests ──────────────────────────────────────

export function useGitHubPRs(owner: string, repo: string, state = "open") {
  const { currentOrg } = useOrg();
  const [pulls, setPulls] = useState<GitHubPR[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!currentOrg?.githubInstallationId || !owner || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/github/${owner}/${repo}/pulls?orgId=${currentOrg.id}&state=${state}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch PRs");
      setPulls(data.pulls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PRs");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, owner, repo, state]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { pulls, loading, error, refetch: fetch_ };
}

// ─── Commits ────────────────────────────────────────────

export function useGitHubCommits(owner: string, repo: string, branch?: string) {
  const { currentOrg } = useOrg();
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!currentOrg?.githubInstallationId || !owner || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const branchParam = branch ? `&branch=${branch}` : "";
      const res = await fetch(
        `/api/github/${owner}/${repo}/commits?orgId=${currentOrg.id}${branchParam}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch commits");
      setCommits(data.commits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, owner, repo, branch]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { commits, loading, error, refetch: fetch_ };
}

// ─── Issues ─────────────────────────────────────────────

export function useGitHubIssues(owner: string, repo: string, state = "open") {
  const { currentOrg } = useOrg();
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!currentOrg?.githubInstallationId || !owner || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/github/${owner}/${repo}/issues?orgId=${currentOrg.id}&state=${state}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch issues");
      setIssues(data.issues);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch issues");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, owner, repo, state]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { issues, loading, error, refetch: fetch_ };
}

// ─── Branches ───────────────────────────────────────────

export function useGitHubBranches(owner: string, repo: string) {
  const { currentOrg } = useOrg();
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!currentOrg?.githubInstallationId || !owner || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/github/${owner}/${repo}/branches?orgId=${currentOrg.id}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch branches");
      setBranches(data.branches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch branches");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, owner, repo]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { branches, loading, error, refetch: fetch_ };
}

// ─── Write Actions ──────────────────────────────────────

export function useGitHubActions(owner: string, repo: string) {
  const { currentOrg } = useOrg();

  const createPR = useCallback(
    async (title: string, body: string, head: string, base: string) => {
      if (!currentOrg) throw new Error("No organization");
      const res = await fetch(`/api/github/${owner}/${repo}/pulls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: currentOrg.id, title, prBody: body, head, base }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create PR");
      return data.pr as GitHubPR;
    },
    [currentOrg, owner, repo]
  );

  const postComment = useCallback(
    async (issueNumber: number, comment: string) => {
      if (!currentOrg) throw new Error("No organization");
      const res = await fetch(`/api/github/${owner}/${repo}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: currentOrg.id, issueNumber, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post comment");
    },
    [currentOrg, owner, repo]
  );

  return { createPR, postComment };
}
