/** PR List — Displays pull requests for a linked GitHub repo. */
"use client";

import { Badge } from "@/components/ui/badge";
import type { GitHubPR } from "@/hooks/useGitHub";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATE_STYLES: Record<string, { icon: string; color: string }> = {
  open: { icon: "🟢", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  closed: { icon: "🔴", color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
  merged: { icon: "🟣", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
};

function prState(pr: GitHubPR) {
  if (pr.merged_at) return "merged";
  return pr.state;
}

interface PRListProps {
  pulls: GitHubPR[];
  loading: boolean;
  error: string | null;
  onSelectPR?: (pr: GitHubPR) => void;
}

export function PRList({ pulls, loading, error, onSelectPR }: PRListProps) {
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

  if (pulls.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No pull requests found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pulls.map((pr) => {
        const state = prState(pr);
        const style = STATE_STYLES[state] || STATE_STYLES.open;
        return (
          <button
            key={pr.number}
            onClick={() => onSelectPR?.(pr)}
            className="block w-full text-left p-3 rounded-lg border border-border hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="text-sm mt-0.5">{style.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{pr.title}</span>
                  {pr.draft && (
                    <Badge variant="outline" className="text-[10px]">Draft</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>#{pr.number}</span>
                  <span>by</span>
                  {pr.user.avatar_url && (
                    <img
                      src={pr.user.avatar_url}
                      alt={pr.user.login}
                      className="w-4 h-4 rounded-full"
                    />
                  )}
                  <span>{pr.user.login}</span>
                  <span className="mx-1">&middot;</span>
                  <span>{timeAgo(pr.updated_at)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge className={`text-[10px] ${style.color}`}>
                    {state}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {pr.head.ref} &rarr; {pr.base.ref}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
