/** Repo Selector — List accessible GitHub repos and link them to a project. */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useGitHubRepos, type GitHubRepo } from "@/hooks/useGitHub";
import { updateProject, type GitHubRepoLink } from "@/lib/firestore";
import { GitHubIcon } from "./github-icon";
import SpotlightCard from "@/components/reactbits/SpotlightCard";

interface RepoSelectorProps {
  projectId: string;
  existingRepos: GitHubRepoLink[];
  onLinked: () => void;
}

export function RepoSelector({ projectId, existingRepos, onLinked }: RepoSelectorProps) {
  const { repos, loading, error } = useGitHubRepos();
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<number | null>(null);

  const linkedIds = new Set(existingRepos.map((r) => r.repoId));
  const filtered = repos.filter(
    (r) =>
      !linkedIds.has(r.id) &&
      r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleLink = async (repo: GitHubRepo) => {
    setLinking(repo.id);
    try {
      const newLink: GitHubRepoLink = {
        repoId: repo.id,
        owner: repo.full_name.split("/")[0],
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        linkedAt: Date.now(),
      };
      await updateProject(projectId, {
        githubRepos: [...existingRepos, newLink],
      });
      onLinked();
    } catch (err) {
      console.error("Failed to link repo:", err);
    } finally {
      setLinking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading repositories...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select repositories to connect to this project
        </p>
        <Badge variant="outline" className="text-xs">
          {repos.length} available
        </Badge>
      </div>

      <Input
        placeholder="Search repositories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">
            {search ? "No matching repositories" : "No unlinked repositories available"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((repo) => (
            <SpotlightCard
              key={repo.id}
              className="p-4"
              spotlightColor="rgba(255, 191, 0, 0.06)"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <GitHubIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {repo.full_name}
                    </span>
                    {repo.private && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        Private
                      </Badge>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {repo.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {repo.language && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        {repo.language}
                      </span>
                    )}
                    <span>{repo.default_branch}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleLink(repo)}
                  disabled={linking === repo.id}
                  className="shrink-0 text-xs"
                >
                  {linking === repo.id ? "Linking..." : "Link"}
                </Button>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}
    </div>
  );
}
