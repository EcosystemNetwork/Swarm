/** Commit List — Displays recent commits for a linked GitHub repo. */
"use client";

import type { GitHubCommit } from "@/hooks/useGitHub";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface CommitListProps {
  commits: GitHubCommit[];
  loading: boolean;
  error: string | null;
}

export function CommitList({ commits, loading, error }: CommitListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
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

  if (commits.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No commits found
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {commits.map((commit) => {
        const firstLine = commit.commit.message.split("\n")[0];
        return (
          <a
            key={commit.sha}
            href={commit.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <code className="text-[11px] font-mono text-amber-600 dark:text-amber-400 shrink-0 group-hover:underline">
              {commit.sha.slice(0, 7)}
            </code>
            <span className="text-sm truncate flex-1">{firstLine}</span>
            <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
              {commit.author?.avatar_url && (
                <img
                  src={commit.author.avatar_url}
                  alt={commit.author.login}
                  className="w-4 h-4 rounded-full"
                />
              )}
              <span>{commit.author?.login || commit.commit.author.name}</span>
              <span>{timeAgo(commit.commit.author.date)}</span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
