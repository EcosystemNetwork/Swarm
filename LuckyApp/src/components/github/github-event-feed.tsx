/** GitHub Event Feed — Real-time activity feed from webhook events. */
"use client";

import { useGitHubEvents } from "@/hooks/useGitHubEvents";
import type { GitHubEvent } from "@/lib/firestore";

function timeAgo(ts: unknown): string {
  if (!ts) return "";
  let ms: number;
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    ms = (ts as { seconds: number }).seconds * 1000;
  } else if (ts instanceof Date) {
    ms = ts.getTime();
  } else {
    ms = new Date(ts as string | number).getTime();
  }
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const EVENT_ICONS: Record<string, string> = {
  push: "📦",
  pull_request: "🔀",
  issues: "📋",
  issue_comment: "💬",
  installation: "⚙️",
};

function EventRow({ event }: { event: GitHubEvent }) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
      <span className="text-sm mt-0.5">
        {EVENT_ICONS[event.eventType] || "📌"}
      </span>
      {event.actorAvatarUrl && (
        <img
          src={event.actorAvatarUrl}
          alt={event.actor}
          className="w-5 h-5 rounded-full mt-0.5 shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{event.actor}</span>{" "}
          <span className="text-muted-foreground">{event.title}</span>
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          <span>{event.repoFullName}</span>
          <span>·</span>
          <span>{timeAgo(event.createdAt)}</span>
        </div>
      </div>
      {event.githubUrl && (
        <a
          href={event.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline shrink-0 mt-1"
        >
          View →
        </a>
      )}
    </div>
  );
}

interface GitHubEventFeedProps {
  orgId?: string;
  projectId?: string;
}

export function GitHubEventFeed({ orgId, projectId }: GitHubEventFeedProps) {
  const { events, loading } = useGitHubEvents({ orgId, projectId, limit: 50 });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No activity yet</p>
        <p className="text-xs mt-1">Events will appear here when changes are pushed to linked repos</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
