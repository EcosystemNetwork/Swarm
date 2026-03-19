/** GitHub Panel — Main container for the GitHub tab with sub-navigation. */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useGitHubPRs,
  useGitHubCommits,
  useGitHubIssues,
  type GitHubPR,
} from "@/hooks/useGitHub";
import { updateProject, type Project, type GitHubRepoLink } from "@/lib/firestore";
import { PRList } from "./pr-list";
import { CommitList } from "./commit-list";
import { IssueList } from "./issue-list";
import { GitHubEventFeed } from "./github-event-feed";
import { CreatePRDialog } from "./create-pr-dialog";
import { CreateIssueDialog } from "./create-issue-dialog";
import { PRDetailDialog } from "./pr-detail-dialog";
import { RepoSelector } from "./repo-selector";
import { GitHubIcon } from "./github-icon";

type View = "activity" | "pulls" | "commits" | "issues";

interface GitHubPanelProps {
  project: Project;
  orgId: string;
  onRefresh: () => void;
}

export function GitHubPanel({ project, orgId, onRefresh }: GitHubPanelProps) {
  const repos = project.githubRepos || [];
  const [view, setView] = useState<View>("activity");
  const [selectedRepo, setSelectedRepo] = useState(0);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const [prState, setPrState] = useState<"open" | "closed" | "all">("open");
  const [issueState, setIssueState] = useState<"open" | "closed" | "all">("open");

  const repo = repos[selectedRepo];
  const owner = repo?.owner || "";
  const repoName = repo?.name || "";

  // Hooks — only fetch when a view needs them
  const prs = useGitHubPRs(owner, repoName, prState);
  const commits = useGitHubCommits(owner, repoName, repo?.defaultBranch);
  const issues = useGitHubIssues(owner, repoName, issueState);

  const handleUnlink = async (repoLink: GitHubRepoLink) => {
    const updated = repos.filter((r) => r.repoId !== repoLink.repoId);
    await updateProject(project.id, { githubRepos: updated });
    onRefresh();
  };

  const views: { key: View; label: string; count?: number }[] = [
    { key: "activity", label: "Activity" },
    { key: "pulls", label: "PRs", count: prs.pulls.length },
    { key: "commits", label: "Commits", count: commits.commits.length },
    { key: "issues", label: "Issues", count: issues.issues.length },
  ];

  return (
    <div className="space-y-4">
      {/* Linked repos */}
      <div className="flex items-center gap-2 flex-wrap">
        {repos.map((r, i) => (
          <button
            key={r.repoId}
            onClick={() => setSelectedRepo(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              i === selectedRepo
                ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-border hover:border-amber-300 text-muted-foreground"
            }`}
          >
            <GitHubIcon className="w-3 h-3" />
            {r.fullName}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={() => setShowAddRepo(!showAddRepo)}
        >
          + Add Repo
        </Button>
      </div>

      {/* Add repo section */}
      {showAddRepo && (
        <div className="border rounded-lg p-4">
          <RepoSelector
            projectId={project.id}
            existingRepos={repos}
            onLinked={() => {
              setShowAddRepo(false);
              onRefresh();
            }}
          />
        </div>
      )}

      {/* Sub-navigation */}
      {repo && (
        <>
          <div className="flex items-center justify-between border-b border-border">
            <div className="flex">
              {views.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    view === v.key
                      ? "border-amber-500 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v.label}
                  {v.count !== undefined && v.count > 0 && (
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted">
                      {v.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pb-1">
              {view === "pulls" && (
                <>
                  <select
                    value={prState}
                    onChange={(e) => setPrState(e.target.value as "open" | "closed" | "all")}
                    className="text-xs px-2 py-1 rounded border border-border bg-background"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="all">All</option>
                  </select>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-black"
                    onClick={() => setShowCreatePR(true)}
                  >
                    + New PR
                  </Button>
                </>
              )}
              {view === "issues" && (
                <>
                  <select
                    value={issueState}
                    onChange={(e) => setIssueState(e.target.value as "open" | "closed" | "all")}
                    className="text-xs px-2 py-1 rounded border border-border bg-background"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="all">All</option>
                  </select>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-black"
                    onClick={() => setShowCreateIssue(true)}
                  >
                    + New Issue
                  </Button>
                </>
              )}
              <a
                href={`https://github.com/${repo.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Open in GitHub →
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-500 hover:text-red-600"
                onClick={() => handleUnlink(repo)}
              >
                Unlink
              </Button>
            </div>
          </div>

          {/* Content */}
          <div>
            {view === "activity" && (
              <GitHubEventFeed projectId={project.id} />
            )}
            {view === "pulls" && (
              <PRList
                pulls={prs.pulls}
                loading={prs.loading}
                error={prs.error}
                onSelectPR={setSelectedPR}
              />
            )}
            {view === "commits" && (
              <CommitList
                commits={commits.commits}
                loading={commits.loading}
                error={commits.error}
              />
            )}
            {view === "issues" && (
              <IssueList
                issues={issues.issues}
                loading={issues.loading}
                error={issues.error}
              />
            )}
          </div>

          {/* Dialogs */}
          <CreatePRDialog
            open={showCreatePR}
            onOpenChange={setShowCreatePR}
            owner={owner}
            repo={repoName}
            defaultBranch={repo.defaultBranch}
            onCreated={() => prs.refetch()}
          />
          <CreateIssueDialog
            open={showCreateIssue}
            onOpenChange={setShowCreateIssue}
            owner={owner}
            repo={repoName}
            onCreated={() => issues.refetch()}
          />
          {selectedPR && (
            <PRDetailDialog
              open={!!selectedPR}
              onOpenChange={(open) => { if (!open) setSelectedPR(null); }}
              pr={selectedPR}
              owner={owner}
              repo={repoName}
              onUpdated={() => prs.refetch()}
            />
          )}
        </>
      )}

      {/* No repo selected */}
      {!repo && !showAddRepo && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No repositories linked yet</p>
          <p className="text-xs mt-1">Click "+ Add Repo" to connect a GitHub repository</p>
        </div>
      )}
    </div>
  );
}
