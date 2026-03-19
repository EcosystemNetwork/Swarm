/** PR Detail Dialog — View PR details with merge, close, review, and comment actions. */
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGitHubActions, type GitHubPR, type GitHubComment } from "@/hooks/useGitHub";

interface PRDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pr: GitHubPR;
  owner: string;
  repo: string;
  onUpdated: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function PRDetailDialog({
  open,
  onOpenChange,
  pr,
  owner,
  repo,
  onUpdated,
}: PRDetailDialogProps) {
  const { mergePR, closePR, reopenPR, reviewPR, postComment, getPRComments } =
    useGitHubActions(owner, repo);

  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewEvent, setReviewEvent] = useState<"APPROVE" | "REQUEST_CHANGES" | "COMMENT">("COMMENT");
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "review" | "comments">("details");

  useEffect(() => {
    if (open && pr) {
      setLoadingComments(true);
      getPRComments(pr.number)
        .then(setComments)
        .catch(() => setComments([]))
        .finally(() => setLoadingComments(false));
    }
  }, [open, pr, getPRComments]);

  const handleAction = async (actionName: string, fn: () => Promise<void>) => {
    setActionLoading(actionName);
    setError(null);
    try {
      await fn();
      onUpdated();
      if (actionName === "merge" || actionName === "close") {
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${actionName}`);
    } finally {
      setActionLoading(null);
    }
  };

  const isOpen = pr.state === "open";
  const isMerged = !!pr.merged_at;

  const statusColor = isMerged
    ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400"
    : isOpen
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";

  const statusLabel = isMerged ? "Merged" : isOpen ? "Open" : "Closed";

  const tabs = [
    { key: "details" as const, label: "Details" },
    { key: "review" as const, label: "Review" },
    { key: "comments" as const, label: `Comments${comments.length ? ` (${comments.length})` : ""}` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Badge className={statusColor}>{statusLabel}</Badge>
            <span className="text-muted-foreground font-mono text-sm">#{pr.number}</span>
            <span className="font-semibold">{pr.title}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab nav */}
        <div className="flex border-b border-border -mx-6 px-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-amber-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 mt-2">
          {/* Details tab */}
          {tab === "details" && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Author</span>
                  <div className="flex items-center gap-2 mt-1">
                    {pr.user.avatar_url && (
                      <img src={pr.user.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                    )}
                    <span className="font-medium">{pr.user.login}</span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Branches</span>
                  <p className="font-mono text-xs mt-1">
                    <Badge variant="outline" className="text-[10px]">{pr.head.ref}</Badge>
                    <span className="mx-1 text-muted-foreground">&rarr;</span>
                    <Badge variant="outline" className="text-[10px]">{pr.base.ref}</Badge>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p className="text-xs mt-1">{timeAgo(pr.created_at)}</p>
                </div>
                {pr.changed_files !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Changes</span>
                    <p className="text-xs mt-1">
                      {pr.changed_files} file{pr.changed_files !== 1 ? "s" : ""}
                      {pr.additions !== undefined && (
                        <span className="text-emerald-500 ml-2">+{pr.additions}</span>
                      )}
                      {pr.deletions !== undefined && (
                        <span className="text-red-500 ml-1">-{pr.deletions}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {pr.body && (
                <div className="border rounded-lg p-3 text-sm whitespace-pre-wrap bg-muted/20">
                  {pr.body}
                </div>
              )}

              {pr.draft && (
                <Badge variant="outline" className="text-muted-foreground">Draft</Badge>
              )}

              {/* Actions */}
              {isOpen && !isMerged && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Select value={mergeMethod} onValueChange={(v) => setMergeMethod(v as typeof mergeMethod)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merge">Merge</SelectItem>
                        <SelectItem value="squash">Squash</SelectItem>
                        <SelectItem value="rebase">Rebase</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => handleAction("merge", () => mergePR(pr.number, mergeMethod))}
                      disabled={!!actionLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {actionLoading === "merge" ? "Merging..." : "Merge PR"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleAction("close", () => closePR(pr.number))}
                      disabled={!!actionLoading}
                      className="text-red-500 hover:text-red-600"
                    >
                      {actionLoading === "close" ? "Closing..." : "Close PR"}
                    </Button>
                  </div>
                </div>
              )}

              {!isOpen && !isMerged && (
                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    onClick={() => handleAction("reopen", () => reopenPR(pr.number))}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "reopen" ? "Reopening..." : "Reopen PR"}
                  </Button>
                </div>
              )}

              <a
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground inline-block"
              >
                View on GitHub &rarr;
              </a>
            </>
          )}

          {/* Review tab */}
          {tab === "review" && isOpen && !isMerged && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Review Type</label>
                <Select value={reviewEvent} onValueChange={(v) => setReviewEvent(v as typeof reviewEvent)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMMENT">Comment</SelectItem>
                    <SelectItem value="APPROVE">Approve</SelectItem>
                    <SelectItem value="REQUEST_CHANGES">Request Changes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Review Body</label>
                <Textarea
                  placeholder="Write your review..."
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  rows={4}
                />
              </div>
              <Button
                onClick={() =>
                  handleAction("review", async () => {
                    await reviewPR(pr.number, reviewBody, reviewEvent);
                    setReviewBody("");
                  })
                }
                disabled={!!actionLoading}
                className="bg-amber-600 hover:bg-amber-700 text-black"
              >
                {actionLoading === "review" ? "Submitting..." : "Submit Review"}
              </Button>
            </>
          )}

          {tab === "review" && (!isOpen || isMerged) && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Reviews can only be submitted on open PRs
            </p>
          )}

          {/* Comments tab */}
          {tab === "comments" && (
            <>
              {loadingComments ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No comments yet</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {comments.map((c) => (
                    <div key={c.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        {c.user.avatar_url && (
                          <img src={c.user.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                        )}
                        <span className="font-medium text-xs">{c.user.login}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-3 space-y-2">
                <Textarea
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={() =>
                    handleAction("comment", async () => {
                      await postComment(pr.number, commentText);
                      setCommentText("");
                      const updated = await getPRComments(pr.number);
                      setComments(updated);
                    })
                  }
                  disabled={!!actionLoading || !commentText.trim()}
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-black"
                >
                  {actionLoading === "comment" ? "Posting..." : "Post Comment"}
                </Button>
              </div>
            </>
          )}

          {error && (
            <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
