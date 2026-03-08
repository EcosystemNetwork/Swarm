/** Job Detail — Full workspace for viewing deliverables and guiding agent work. */
"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import { useChainCurrency } from "@/hooks/useChainCurrency";
import {
  getJob,
  getAgent,
  getProject,
  getAgentsByOrg,
  getChannelsByProject,
  onMessagesByChannel,
  updateJob,
  sendMessage,
  type Job,
  type Agent,
  type Project,
  type Channel,
  type Message,
} from "@/lib/firestore";
import { getAgentAvatarUrl } from "@/lib/agent-avatar";
import { GitHubIcon } from "@/components/github/github-icon";
import { shortAddress } from "@/lib/chains";
import { cn } from "@/lib/utils";

// ─── Helpers ───────────────────────────────────────────

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
};

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  claimed: { label: "Claimed", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
  closed: { label: "Closed", color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
};

function formatTime(timestamp: unknown): string {
  if (!timestamp) return "Unknown";
  let date: Date;
  if (timestamp && typeof timestamp === "object" && "seconds" in timestamp) {
    date = new Date((timestamp as { seconds: number }).seconds * 1000);
  } else {
    date = new Date(timestamp as string | number);
  }
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

// ─── Deliverable Message Component ─────────────────────

function DeliverableMessage({ message }: { message: Message }) {
  const isSystem = message.senderId === "system";
  const isHuman = !isSystem && message.senderType === "human";
  const cleanContent = message.content.replace(/\[JOB:[^\]]+\]/g, "").trim();

  return (
    <div
      className={cn(
        "p-3 rounded-lg border-l-4",
        isSystem
          ? "border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
          : isHuman
          ? "border-l-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
          : "border-l-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{message.senderName}</span>
          <Badge variant="outline" className="text-[10px]">
            {isSystem ? "System" : isHuman ? "Human" : "Agent"}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">{formatTime(message.createdAt)}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{cleanContent}</p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const { currentOrg } = useOrg();
  const { symbol: currencySymbol } = useChainCurrency();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Core data
  const [job, setJob] = useState<Job | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [deliverables, setDeliverables] = useState<Message[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"help" | "correct" | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);

  // ── Load job data ──

  const loadJobData = async () => {
    if (!currentOrg) return;
    try {
      setLoading(true);
      setError(null);

      const jobData = await getJob(jobId);
      if (!jobData) { setError("Job not found"); setLoading(false); return; }
      if (jobData.orgId !== currentOrg.id) { setError("Job not found in this organization"); setLoading(false); return; }
      setJob(jobData);

      const promises: [
        Promise<Project | null>,
        Promise<Agent | null>,
        Promise<Agent[]>,
      ] = [
        jobData.projectId ? getProject(jobData.projectId) : Promise.resolve(null),
        jobData.takenByAgentId ? getAgent(jobData.takenByAgentId) : Promise.resolve(null),
        getAgentsByOrg(currentOrg.id),
      ];

      const [projectData, agentData, agentsData] = await Promise.all(promises);
      setProject(projectData);
      setAgent(agentData);
      setAgents(agentsData);

      // Get channel for deliverables
      if (projectData) {
        const channels = await getChannelsByProject(projectData.id);
        if (channels.length > 0) {
          setChannel(channels[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load job data:", err);
      setError(err instanceof Error ? err.message : "Failed to load job data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadJobData(); }, [jobId, currentOrg]);

  // ── Real-time deliverables ──

  useEffect(() => {
    if (!channel) return;
    const jobTag = `[JOB:${jobId}]`;
    const unsub = onMessagesByChannel(channel.id, (messages) => {
      setDeliverables(messages.filter((m) => m.content.includes(jobTag)));
    });
    return () => unsub();
  }, [channel, jobId]);

  // Auto-scroll when new deliverables arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [deliverables.length]);

  // ── Actions ──

  const handleSendAction = async (type: "help" | "correct") => {
    if (!channel || !actionMessage.trim() || !currentOrg) return;
    try {
      setSending(true);
      const prefix = type === "help" ? "**Guidance**" : "**Correction**";
      const icon = type === "help" ? "💡" : "🔧";
      await sendMessage({
        channelId: channel.id,
        senderId: "human",
        senderName: "Manager",
        senderType: "human",
        content: `${icon} ${prefix}\n\n${actionMessage.trim()}\n\n[JOB:${jobId}]`,
        orgId: currentOrg.id,
        createdAt: new Date(),
      });
      setActionMessage("");
      setActionType(null);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async () => {
    if (!job || !currentOrg) return;
    try {
      setUpdating(true);
      await updateJob(job.id, {
        status: "completed",
        completedAt: new Date(),
        completedByAgentName: agent?.name || "Unknown",
      });

      if (channel) {
        await sendMessage({
          channelId: channel.id,
          senderId: "system",
          senderName: "Swarm",
          senderType: "human",
          content: `✅ **Job Approved**\n\nJob "${job.title}" has been reviewed and marked as complete.\n\n[JOB:${jobId}]`,
          orgId: currentOrg.id,
          createdAt: new Date(),
        });
      }

      const updatedJob = await getJob(jobId);
      if (updatedJob) setJob(updatedJob);
    } catch (err) {
      console.error("Failed to approve job:", err);
    } finally {
      setUpdating(false);
    }
  };

  const handleReopen = async () => {
    if (!job) return;
    try {
      setUpdating(true);
      await updateJob(job.id, { status: "in_progress" });
      const updatedJob = await getJob(jobId);
      if (updatedJob) setJob(updatedJob);
    } catch (err) {
      console.error("Failed to reopen job:", err);
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignAgent = async (agentId: string) => {
    if (!job || !currentOrg) return;
    try {
      setUpdating(true);
      const assignedAgent = agents.find((a) => a.id === agentId);
      await updateJob(job.id, { status: "in_progress", takenByAgentId: agentId });

      // Post assignment notification to channel
      if (channel) {
        await sendMessage({
          channelId: channel.id,
          senderId: "system",
          senderName: "Swarm",
          senderType: "agent",
          content: `📋 **New Job Assignment**\n\nJob: "${job.title}"\nDescription: ${job.description || "No description"}\nAssigned to: @${assignedAgent?.name || "Unknown"}\nPriority: ${job.priority}\n\nPlease work on this and post your deliverables here when complete. Tag your response with [JOB:${job.id}] so we can track completion.`,
          orgId: currentOrg.id,
          createdAt: new Date(),
        });
      }

      const updatedJob = await getJob(jobId);
      if (updatedJob) setJob(updatedJob);
      if (assignedAgent) setAgent(assignedAgent);
    } catch (err) {
      console.error("Failed to assign agent:", err);
    } finally {
      setUpdating(false);
    }
  };

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading job...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold mb-2">Job Not Found</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button asChild variant="outline">
            <Link href="/jobs">← Back to Jobs</Link>
          </Button>
        </div>
      </div>
    );
  }

  const status = statusConfig[job.status] || statusConfig.open;
  const isActive = job.status === "in_progress" || job.status === "claimed";
  const isCompleted = job.status === "completed";
  const hasDeliverables = deliverables.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <Link
          href="/jobs"
          className="text-sm text-muted-foreground hover:text-amber-600 transition-colors inline-flex items-center gap-1 mb-4"
        >
          ← Back to Jobs
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-bold">{job.title}</h1>
              <Badge className={cn("text-xs", status.color)}>{status.label}</Badge>
              <Badge variant="outline" className={cn("text-xs", priorityColors[job.priority])}>
                {job.priority}
              </Badge>
            </div>
            {job.description && (
              <p className="text-muted-foreground">{job.description}</p>
            )}
          </div>
          {job.reward && (
            <div className="shrink-0 text-right">
              <div className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="text-xl font-bold text-amber-500">{job.reward}</span>
                <span className="text-xs text-amber-500/70 ml-1">{currencySymbol}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Metadata ── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            {project && (
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Project</span>
                <span className="font-medium">{project.name}</span>
              </div>
            )}
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Assigned Agent</span>
              {agent ? (
                <Link
                  href={`/agents/${agent.id}`}
                  className="flex items-center gap-2 hover:text-amber-600 transition-colors"
                >
                  <img
                    src={agent.avatarUrl || getAgentAvatarUrl(agent.name, agent.type)}
                    alt={agent.name}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="font-medium">{agent.name}</span>
                </Link>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Posted</span>
              <span className="font-medium">{formatTime(job.createdAt)}</span>
            </div>
            {job.postedByAddress && (
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Posted By</span>
                <span className="font-mono text-xs">{shortAddress(job.postedByAddress)}</span>
              </div>
            )}
            {isCompleted && !!job.completedAt && (
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Completed</span>
                <span className="font-medium">{formatTime(job.completedAt)}</span>
              </div>
            )}
            {isCompleted && job.completedByAgentName && (
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Completed By</span>
                <span className="font-medium">{job.completedByAgentName}</span>
              </div>
            )}
          </div>

          {(job.requiredSkills ?? []).length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <span className="text-xs text-muted-foreground block mb-2">Required Skills</span>
              <div className="flex flex-wrap gap-1.5">
                {(job.requiredSkills ?? []).map((skill) => (
                  <Badge
                    key={skill}
                    variant="outline"
                    className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── GitHub Repos ── */}
      {project?.githubRepos && project.githubRepos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Linked Repositories</CardTitle>
            <CardDescription>
              Repositories from {project.name} that provide context for this job
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {project.githubRepos.map((repo) => (
                <a
                  key={repo.repoId}
                  href={`https://github.com/${repo.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <GitHubIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{repo.fullName}</span>
                    <span className="text-xs text-muted-foreground ml-2">({repo.defaultBranch})</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">Open in GitHub →</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Deliverables Feed ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Deliverables</CardTitle>
                <Badge variant="secondary">{deliverables.length}</Badge>
              </div>
              <CardDescription>
                Agent outputs and messages tagged with this job
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {!channel ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-2xl mb-2">📭</div>
                  <p className="text-sm">No project channel</p>
                  <p className="text-xs mt-1">
                    Link this job to a project to enable deliverable tracking
                  </p>
                </div>
              ) : deliverables.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-2xl mb-2">📭</div>
                  <p className="text-sm">No deliverables yet</p>
                  <p className="text-xs mt-1">
                    {job.status === "open"
                      ? "Assign an agent to start receiving deliverables"
                      : "The agent is working — deliverables will appear here in real time"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {deliverables.map((msg) => (
                    <DeliverableMessage key={msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Actions Panel ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Actions</CardTitle>
              <CardDescription>Guide, review, or correct the agent's work</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Assign agent (open jobs) */}
              {job.status === "open" && agents.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1.5">Assign an agent</span>
                  <Select onValueChange={handleAssignAgent} disabled={updating}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Pick an agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                {isActive && channel && (
                  <Button
                    variant={actionType === "help" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActionType(actionType === "help" ? null : "help")}
                    className={cn("justify-start", actionType === "help" && "bg-blue-600 hover:bg-blue-700 text-white")}
                  >
                    💡 Send Guidance
                  </Button>
                )}

                {hasDeliverables && !isCompleted && channel && (
                  <Button
                    variant={actionType === "correct" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActionType(actionType === "correct" ? null : "correct")}
                    className={cn("justify-start", actionType === "correct" && "bg-orange-600 hover:bg-orange-700 text-white")}
                  >
                    🔧 Send Correction
                  </Button>
                )}

                {isActive && hasDeliverables && (
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={updating}
                    className="justify-start bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {updating ? "Approving..." : "✅ Approve & Complete"}
                  </Button>
                )}

                {isCompleted && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReopen}
                    disabled={updating}
                    className="justify-start"
                  >
                    {updating ? "Reopening..." : "🔄 Reopen for Rework"}
                  </Button>
                )}
              </div>

              {/* Message input for Help / Correct */}
              {actionType && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    {actionType === "help"
                      ? "Send guidance to help the agent:"
                      : "Send a correction to redirect the work:"}
                  </p>
                  <Textarea
                    placeholder={
                      actionType === "help"
                        ? "e.g., Focus on the API integration first..."
                        : "e.g., The output format should be JSON, not CSV..."
                    }
                    value={actionMessage}
                    onChange={(e) => setActionMessage(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSendAction(actionType)}
                    disabled={sending || !actionMessage.trim()}
                    className={cn(
                      "w-full",
                      actionType === "help"
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-orange-600 hover:bg-orange-700 text-white"
                    )}
                  >
                    {sending
                      ? "Sending..."
                      : actionType === "help"
                      ? "Send Guidance"
                      : "Send Correction"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Job status indicator */}
          {isActive && (
            <Card className="border-amber-500/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Agent Working</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {agent?.name || "An agent"} is actively working on this job. Deliverables will appear in real time.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
