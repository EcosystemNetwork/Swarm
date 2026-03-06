/** Create Issue Dialog — Form for creating a new GitHub issue. */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGitHubActions } from "@/hooks/useGitHub";

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  onCreated: () => void;
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  owner,
  repo,
  onCreated,
}: CreateIssueDialogProps) {
  const { createIssue } = useGitHubActions(owner, repo);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labels, setLabels] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const labelList = labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      await createIssue(title.trim(), body.trim(), labelList);
      setTitle("");
      setBody("");
      setLabels("");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create issue");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Create Issue — {owner}/{repo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Title *</label>
            <Input
              placeholder="Issue title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <Textarea
              placeholder="Describe the issue..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Labels</label>
            <Input
              placeholder="bug, enhancement, help wanted"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Comma-separated label names (must already exist in the repo)
            </p>
          </div>

          {error && (
            <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-black"
            >
              {creating ? "Creating..." : "Create Issue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
