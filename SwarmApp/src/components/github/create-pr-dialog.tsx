/** Create PR Dialog — Form for creating a new pull request. */
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGitHubBranches, useGitHubActions, type GitHubBranch } from "@/hooks/useGitHub";

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  defaultBranch: string;
  onCreated: () => void;
}

export function CreatePRDialog({
  open,
  onOpenChange,
  owner,
  repo,
  defaultBranch,
  onCreated,
}: CreatePRDialogProps) {
  const { branches, loading: branchesLoading } = useGitHubBranches(owner, repo);
  const { createPR } = useGitHubActions(owner, repo);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState(defaultBranch);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim() || !head || !base) return;
    setCreating(true);
    setError(null);
    try {
      await createPR(title.trim(), body.trim(), head, base);
      setTitle("");
      setBody("");
      setHead("");
      setBase(defaultBranch);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PR");
    } finally {
      setCreating(false);
    }
  };

  const headBranches = branches.filter((b: GitHubBranch) => b.name !== base);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Create Pull Request — {owner}/{repo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Title *</label>
            <Input
              placeholder="PR title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <Textarea
              placeholder="Describe your changes..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Head branch *</label>
              <Select value={head} onValueChange={setHead} disabled={branchesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={branchesLoading ? "Loading..." : "Select branch"} />
                </SelectTrigger>
                <SelectContent>
                  {headBranches.map((b: GitHubBranch) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Base branch *</label>
              <Select value={base} onValueChange={setBase} disabled={branchesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={branchesLoading ? "Loading..." : "Select branch"} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b: GitHubBranch) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              disabled={creating || !title.trim() || !head || !base}
              className="bg-amber-600 hover:bg-amber-700 text-black"
            >
              {creating ? "Creating..." : "Create PR"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
