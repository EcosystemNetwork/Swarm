/** Issue List — Displays issues for a linked GitHub repo. */
"use client";

import { Badge } from "@/components/ui/badge";
import type { GitHubIssue } from "@/hooks/useGitHub";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface IssueListProps {
  issues: GitHubIssue[];
  loading: boolean;
  error: string | null;
}

export function IssueList({ issues, loading, error }: IssueListProps) {
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

  if (issues.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No issues found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <a
          key={issue.number}
          href={issue.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-lg border border-border hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="text-sm mt-0.5">
              {issue.state === "open" ? "🟢" : "🔴"}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">{issue.title}</span>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                <span>#{issue.number}</span>
                <span>by</span>
                {issue.user.avatar_url && (
                  <img
                    src={issue.user.avatar_url}
                    alt={issue.user.login}
                    className="w-4 h-4 rounded-full"
                  />
                )}
                <span>{issue.user.login}</span>
                <span className="mx-1">·</span>
                <span>{timeAgo(issue.updated_at)}</span>
              </div>
              {issue.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {issue.labels.map((label) => (
                    <Badge
                      key={label.name}
                      variant="outline"
                      className="text-[10px]"
                      style={{
                        borderColor: `#${label.color}`,
                        color: `#${label.color}`,
                      }}
                    >
                      {label.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
