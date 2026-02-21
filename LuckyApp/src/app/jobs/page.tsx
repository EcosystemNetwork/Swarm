"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import { useActiveAccount } from "thirdweb/react";
import {
  getJobsByOrg,
  getProjectsByOrg,
  getAgentsByOrg,
  createJob,
  updateJob,
  type Job,
  type Project,
  type Agent,
} from "@/lib/firestore";
import { useSwarmData } from "@/hooks/useSwarmData";
import {
  TaskStatus,
  STATUS_CONFIG,
  CONTRACTS,
  shortAddr,
  timeRemaining,
  explorerContract,
  type TaskListing,
  type AgentProfile,
} from "@/lib/swarm-contracts";
import { cn } from "@/lib/utils";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import CountUp from "@/components/reactbits/CountUp";

// ─── Constants ───────────────────────────────────────────

type ViewTab = "org" | "onchain";

const orgColumns = [
  { status: "open" as const, label: "Open", icon: "📢", accent: "border-border" },
  { status: "claimed" as const, label: "Claimed", icon: "🔄", accent: "border-amber-400" },
  { status: "closed" as const, label: "Closed", icon: "✅", accent: "border-emerald-400" },
];

const priorityColors = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
};

const SKILL_OPTIONS = ["Research", "Trading", "Operations", "Support", "Analytics", "Scout"];

// ─── Page ────────────────────────────────────────────────

export default function JobBoardPage() {
  const { currentOrg } = useOrg();
  const account = useActiveAccount();
  const [tab, setTab] = useState<ViewTab>("org");

  // ── Firestore state ──
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create job form
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobReward, setJobReward] = useState("");
  const [jobSkills, setJobSkills] = useState<string[]>([]);
  const [jobProject, setJobProject] = useState("");
  const [jobPriority, setJobPriority] = useState<Job["priority"]>("medium");
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  // ── Onchain state (Hedera) ──
  const swarm = useSwarmData();
  const [selectedOnchainTask, setSelectedOnchainTask] = useState<TaskListing | null>(null);
  const [onchainDetailOpen, setOnchainDetailOpen] = useState(false);

  // ── Firestore loaders ──

  const loadData = async () => {
    if (!currentOrg) return;
    try {
      setLoading(true);
      setError(null);
      const [jobsData, projectsData, agentsData] = await Promise.all([
        getJobsByOrg(currentOrg.id),
        getProjectsByOrg(currentOrg.id),
        getAgentsByOrg(currentOrg.id),
      ]);
      setJobs(jobsData);
      setProjects(projectsData);
      setAgents(agentsData);
    } catch (err) {
      console.error("Failed to load jobs data:", err);
      setError(err instanceof Error ? err.message : "Failed to load jobs data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [currentOrg]);

  const getProjectName = (projectId?: string) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name || "Unknown";
  };

  const getAgentName = (agentId?: string) => {
    if (!agentId) return "Unassigned";
    return agents.find((a) => a.id === agentId)?.name || "Unknown";
  };

  const getJobsByStatus = (status: Job["status"]) =>
    jobs.filter((job) => job.status === status);

  const toggleSkill = (skill: string) => {
    setJobSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleCreateJob = async () => {
    if (!currentOrg || !jobTitle.trim()) return;
    try {
      setCreating(true);
      setError(null);
      await createJob({
        orgId: currentOrg.id,
        title: jobTitle.trim(),
        description: jobDescription.trim(),
        reward: jobReward.trim() || undefined,
        skillsRequired: jobSkills,
        status: "open",
        createdBy: account?.address || "",
        projectId: jobProject || "",
        priority: jobPriority,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setJobTitle(""); setJobDescription(""); setJobReward("");
      setJobSkills([]); setJobProject(""); setJobPriority("medium");
      setCreateOpen(false);
      await loadData();
    } catch (err) {
      console.error("Failed to create job:", err);
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setCreating(false);
    }
  };

  const handleTakeJob = async (job: Job, agentId: string) => {
    try {
      setUpdating(true);
      await updateJob(job.id, { status: "claimed", claimedBy: agentId });
      setDetailOpen(false);
      setSelectedJob(null);
      await loadData();
    } catch (err) {
      console.error("Failed to take job:", err);
      setError(err instanceof Error ? err.message : "Failed to take job");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateJobStatus = async (job: Job, newStatus: Job["status"]) => {
    try {
      setUpdating(true);
      await updateJob(job.id, { status: newStatus });
      await loadData();
      setSelectedJob({ ...job, status: newStatus });
    } catch (err) {
      console.error("Failed to update job:", err);
      setError(err instanceof Error ? err.message : "Failed to update job");
    } finally {
      setUpdating(false);
    }
  };

  const formatTime = (timestamp: unknown) => {
    if (!timestamp) return "Unknown";
    let date: Date;
    if (timestamp && typeof timestamp === "object" && "seconds" in timestamp) {
      date = new Date((timestamp as any).seconds * 1000);
    } else {
      date = new Date(timestamp as any);
    }
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  };

  // ── Onchain helpers ──

  const onchainOpen = useMemo(
    () => swarm.tasks.filter((t) => t.status === TaskStatus.Open).sort((a, b) => b.taskId - a.taskId),
    [swarm.tasks]
  );
  const onchainClaimed = useMemo(
    () => swarm.tasks.filter((t) => t.status === TaskStatus.Claimed).sort((a, b) => b.taskId - a.taskId),
    [swarm.tasks]
  );
  const onchainCompleted = useMemo(
    () => swarm.tasks.filter((t) => t.status === TaskStatus.Completed).sort((a, b) => b.taskId - a.taskId),
    [swarm.tasks]
  );
  const totalPaid = useMemo(
    () => swarm.tasks.filter((t) => t.status === TaskStatus.Completed).reduce((s, t) => s + t.budget, 0),
    [swarm.tasks]
  );

  // ── Render ──

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <div>
          <BlurText text="Job Board" className="text-3xl font-bold tracking-tight" delay={80} animateBy="letters" />
          <p className="text-muted-foreground mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <BlurText text="Job Board" className="text-3xl font-bold tracking-tight" delay={80} animateBy="letters" />
          <p className="text-muted-foreground mt-1 text-sm">
            Post and claim jobs for your agent fleet
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tab === "onchain" && swarm.lastRefresh && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {swarm.lastRefresh.toLocaleTimeString()}
            </span>
          )}
          {tab === "onchain" && (
            <Button size="sm" variant="outline" onClick={swarm.refetch}>
              Refresh
            </Button>
          )}
          {tab === "org" && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              + Post Job
            </Button>
          )}
        </div>
      </div>

      {/* Source Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("org")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tab === "org"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Org Jobs
          <Badge variant="secondary" className="ml-2 text-xs">{jobs.length}</Badge>
        </button>
        <button
          onClick={() => setTab("onchain")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tab === "onchain"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Onchain (Claw Bots)
          <Badge variant="secondary" className="ml-2 text-xs">{swarm.totalTasks}</Badge>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ═══════════ TAB: Org Jobs (Firestore) ═══════════ */}
      {tab === "org" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading jobs...</p>
              </div>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl mb-4">💼</div>
              <h2 className="text-lg font-semibold mb-1">No jobs yet</h2>
              <p className="text-sm text-muted-foreground mb-4">Post a job for your agents to pick up</p>
              <Button onClick={() => setCreateOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
                + Post First Job
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {orgColumns.map((col) => {
                const colJobs = getJobsByStatus(col.status);
                return (
                  <div key={col.status} className="space-y-3">
                    <div className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 bg-muted/50 border-l-4",
                      col.accent
                    )}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{col.icon}</span>
                        <h2 className="font-semibold text-sm">{col.label}</h2>
                      </div>
                      <Badge variant="secondary" className="text-xs">{colJobs.length}</Badge>
                    </div>
                    <div className="space-y-2 min-h-[100px]">
                      {colJobs.map((job) => (
                        <Card
                          key={job.id}
                          className="cursor-pointer hover:shadow-md transition-all hover:border-amber-300 dark:hover:border-amber-700"
                          onClick={() => { setSelectedJob(job); setDetailOpen(true); }}
                        >
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-medium leading-snug line-clamp-2 min-w-0">{job.title}</h3>
                              <Badge variant="outline" className={cn("text-[10px] shrink-0", priorityColors[job.priority])}>
                                {job.priority}
                              </Badge>
                            </div>
                            {job.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>
                            )}
                            {job.reward && (
                              <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                💰 {job.reward}
                              </div>
                            )}
                            {(job.skillsRequired?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {job.skillsRequired?.slice(0, 3).map((skill) => (
                                  <Badge key={skill} variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                                    {skill}
                                  </Badge>
                                ))}
                                {(job.skillsRequired?.length ?? 0) > 3 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    +{(job.skillsRequired?.length ?? 0) - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                              <div className="flex items-center gap-1.5 min-w-0 truncate">
                                {job.projectId && <span className="truncate">📁 {getProjectName(job.projectId)}</span>}
                                {job.claimedBy && <span className="truncate">🤖 {getAgentName(job.claimedBy)}</span>}
                                {!job.claimedBy && job.status === "open" && (
                                  <span className="text-amber-600 dark:text-amber-400">Awaiting agent</span>
                                )}
                              </div>
                              <span className="shrink-0">{formatTime(job.createdAt)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {colJobs.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                          No {col.label.toLowerCase()} jobs
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════ TAB: Onchain Jobs (Hedera / Claw Bots) ═══════════ */}
      {tab === "onchain" && (
        <>
          {swarm.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading from Hedera Testnet...</p>
              </div>
            </div>
          ) : swarm.error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-red-500 text-sm">{swarm.error}</p>
              <Button size="sm" variant="outline" onClick={swarm.refetch}>Retry</Button>
            </div>
          ) : (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Open", value: onchainOpen.length, color: "text-emerald-500", isNum: true },
                  { label: "In Progress", value: onchainClaimed.length, color: "text-amber-500", isNum: true },
                  { label: "Completed", value: onchainCompleted.length, color: "text-blue-500", isNum: true },
                  { label: "Total Paid", value: `${totalPaid.toFixed(2)} HBAR`, color: "text-emerald-400", isNum: false },
                ].map((stat) => (
                  <SpotlightCard key={stat.label} className="p-4" spotlightColor="rgba(16, 185, 129, 0.08)">
                    <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                    <p className={cn("text-xl font-bold truncate", stat.color)}>
                      {stat.isNum ? <CountUp to={stat.value as number} duration={1.5} /> : stat.value}
                    </p>
                  </SpotlightCard>
                ))}
              </div>

              {/* How to Claim */}
              {onchainOpen.length > 0 && (
                <Card className="border-emerald-200 dark:border-emerald-800">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3">How Claw Bots Claim Tasks</h3>
                    <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
                      <div className="flex gap-2">
                        <span className="font-mono text-emerald-500 font-bold shrink-0">1.</span>
                        <span>Browse open tasks below. Each has HBAR escrowed in the smart contract.</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="font-mono text-emerald-500 font-bold shrink-0">2.</span>
                        <span>Call <code className="bg-muted px-1 rounded text-[11px]">claimTask(taskId)</code> with a Hedera wallet.</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="font-mono text-emerald-500 font-bold shrink-0">3.</span>
                        <span>Submit delivery via <code className="bg-muted px-1 rounded text-[11px]">submitDelivery(taskId, hash)</code>. Payout on approval.</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3 font-mono truncate">
                      Contract: {CONTRACTS.TASK_BOARD} &middot; Hedera Testnet (chainId 296)
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 3-column board */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Open", icon: "📢", tasks: onchainOpen, accent: "border-border" },
                  { label: "In Progress", icon: "🔄", tasks: onchainClaimed, accent: "border-amber-400" },
                  { label: "Completed", icon: "✅", tasks: onchainCompleted, accent: "border-emerald-400" },
                ].map((col) => (
                  <div key={col.label} className="space-y-3">
                    <div className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 bg-muted/50 border-l-4",
                      col.accent
                    )}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{col.icon}</span>
                        <h2 className="font-semibold text-sm">{col.label}</h2>
                      </div>
                      <Badge variant="secondary" className="text-xs">{col.tasks.length}</Badge>
                    </div>
                    <div className="space-y-2 min-h-[100px]">
                      {col.tasks.map((task) => (
                        <OnchainTaskCard key={task.taskId} task={task} onClick={() => { setSelectedOnchainTask(task); setOnchainDetailOpen(true); }} />
                      ))}
                      {col.tasks.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                          No {col.label.toLowerCase()} tasks
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Registered Agents */}
              {swarm.agents.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold">Registered Onchain Agents</h2>
                    <Badge variant="secondary" className="text-xs">{swarm.agents.length}</Badge>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {swarm.agents.map((agent) => (
                      <OnchainAgentCard key={agent.agentAddress} agent={agent} />
                    ))}
                  </div>
                </div>
              )}

              {/* Footer links */}
              <div className="border-t border-border pt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <a href={explorerContract(CONTRACTS.TASK_BOARD)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline-offset-2 hover:underline">
                  TaskBoard on HashScan
                </a>
                <a href={explorerContract(CONTRACTS.AGENT_REGISTRY)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline-offset-2 hover:underline">
                  AgentRegistry on HashScan
                </a>
                <span className="ml-auto">Powered by BrandMover on Hedera</span>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════ DIALOGS ═══════════ */}

      {/* Firestore Job Detail */}
      {selectedJob && (
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2 leading-snug">
                <span className="min-w-0 break-words">{selectedJob.title}</span>
                <Badge className={cn("text-xs shrink-0", priorityColors[selectedJob.priority])}>
                  {selectedJob.priority}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {selectedJob.description || "No description provided"}
              </p>
              {selectedJob.reward && (
                <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">💰 Reward: {selectedJob.reward}</span>
                </div>
              )}
              {(selectedJob.skillsRequired?.length ?? 0) > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1.5">Required Skills</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedJob.skillsRequired?.map((skill) => (
                      <Badge key={skill} variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 text-xs">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {selectedJob.projectId && (
                  <div>
                    <span className="text-xs text-muted-foreground">Project</span>
                    <p className="font-medium truncate">{getProjectName(selectedJob.projectId)}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">Status</span>
                  <p className="font-medium capitalize">{selectedJob.status.replace("_", " ")}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Assigned to</span>
                  <p className="font-medium truncate">{getAgentName(selectedJob.claimedBy)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Posted</span>
                  <p className="font-medium">{formatTime(selectedJob.createdAt)}</p>
                </div>
              </div>

              {/* Assign agent */}
              {selectedJob.status === "open" && agents.length > 0 && (
                <div className="pt-3 border-t">
                  <span className="text-xs text-muted-foreground block mb-2">Assign an agent</span>
                  <div className="flex flex-wrap gap-2">
                    {agents.map((agent) => (
                      <Button key={agent.id} size="sm" variant="outline" onClick={() => handleTakeJob(selectedJob, agent.id)} disabled={updating} className="text-xs">
                        🤖 {agent.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Update status */}
              <div className="flex items-center gap-2 pt-3 border-t">
                <span className="text-xs text-muted-foreground">Status:</span>
                <div className="flex gap-1.5">
                  {(["open", "claimed", "closed"] as const).map((status) => (
                    <Button
                      key={status} size="sm"
                      variant={selectedJob.status === status ? "default" : "outline"}
                      onClick={() => handleUpdateJobStatus(selectedJob, status)}
                      disabled={updating || selectedJob.status === status}
                      className={cn("text-xs", selectedJob.status === status && "bg-amber-600 hover:bg-amber-700")}
                    >
                      {status === "claimed" ? "Claimed" : status === "open" ? "Open" : "Closed"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Onchain Task Detail */}
      {selectedOnchainTask && (
        <Dialog open={onchainDetailOpen} onOpenChange={setOnchainDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2 leading-snug">
                <span className="text-xs font-mono text-muted-foreground shrink-0 pt-0.5">#{selectedOnchainTask.taskId}</span>
                <span className="min-w-0 break-words">{selectedOnchainTask.title}</span>
                <Badge className={cn("text-xs shrink-0", STATUS_CONFIG[selectedOnchainTask.status]?.bg, STATUS_CONFIG[selectedOnchainTask.status]?.color)}>
                  {STATUS_CONFIG[selectedOnchainTask.status]?.label}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {selectedOnchainTask.description || "No description provided"}
              </p>

              <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  💰 Budget: {selectedOnchainTask.budget.toFixed(2)} HBAR
                </span>
              </div>

              {selectedOnchainTask.requiredSkills && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1.5">Required Skills</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedOnchainTask.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean).map((skill) => (
                      <Badge key={skill} variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 text-xs">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Posted by</span>
                  <p className="font-medium font-mono text-xs truncate">{shortAddr(selectedOnchainTask.creator)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Deadline</span>
                  <p className="font-medium text-xs">
                    {new Date(selectedOnchainTask.deadline * 1000).toLocaleDateString()}
                    <span className="text-muted-foreground ml-1">({timeRemaining(selectedOnchainTask.deadline)})</span>
                  </p>
                </div>
                {selectedOnchainTask.claimedBy && selectedOnchainTask.claimedBy !== "0x0000000000000000000000000000000000000000" && (
                  <div>
                    <span className="text-xs text-muted-foreground">Claimed by</span>
                    <p className="font-medium font-mono text-xs truncate">{shortAddr(selectedOnchainTask.claimedBy)}</p>
                  </div>
                )}
                {selectedOnchainTask.completedAt > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Completed</span>
                    <p className="font-medium text-xs">{new Date(selectedOnchainTask.completedAt * 1000).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {selectedOnchainTask.deliveryHash && selectedOnchainTask.deliveryHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Delivery Hash</span>
                  <p className="font-mono text-[11px] break-all bg-muted rounded p-2">{selectedOnchainTask.deliveryHash}</p>
                </div>
              )}

              {selectedOnchainTask.status === TaskStatus.Open && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-2">Claim via smart contract:</p>
                  <code className="text-[11px] text-muted-foreground block bg-muted rounded p-2 overflow-x-auto whitespace-pre">
{`const board = new ethers.Contract("${CONTRACTS.TASK_BOARD}", abi, wallet);
await board.claimTask(${selectedOnchainTask.taskId});`}
                  </code>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Job Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post a New Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Title <span className="text-red-500">*</span></label>
              <Input placeholder="What needs to be done?" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Description</label>
              <Textarea placeholder="Details, requirements, deliverables..." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Reward</label>
                <Input placeholder="e.g. 0.5 ETH" value={jobReward} onChange={(e) => setJobReward(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Priority</label>
                <Select value={jobPriority} onValueChange={(value: Job["priority"]) => setJobPriority(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Required Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {SKILL_OPTIONS.map((skill) => (
                  <Badge
                    key={skill} variant="outline"
                    className={cn(
                      "cursor-pointer transition-colors text-xs",
                      jobSkills.includes(skill)
                        ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                        : "hover:bg-muted"
                    )}
                    onClick={() => toggleSkill(skill)}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
            {projects.length > 0 && (
              <div>
                <label className="text-xs font-medium mb-1 block">Project (optional)</label>
                <Select value={jobProject} onValueChange={setJobProject}>
                  <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreateJob} disabled={creating || !jobTitle.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
                {creating ? "Posting..." : "Post Job"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Onchain Card Components ─────────────────────────────

function OnchainTaskCard({ task, onClick }: { task: TaskListing; onClick: () => void }) {
  const status = STATUS_CONFIG[task.status] ?? STATUS_CONFIG[TaskStatus.Open];
  const skills = task.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean);
  const isOpen = task.status === TaskStatus.Open;
  const now = Math.floor(Date.now() / 1000);
  const isExpired = task.deadline < now;

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-all",
        isOpen ? "hover:border-emerald-300 dark:hover:border-emerald-700" : "hover:border-amber-300 dark:hover:border-amber-700"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-muted-foreground font-mono">#{task.taskId}</span>
              <Badge variant="outline" className={cn("text-[10px]", status.bg, status.color)}>
                {status.label}
              </Badge>
              {isOpen && !isExpired && (
                <span className="text-[10px] text-muted-foreground truncate">{timeRemaining(task.deadline)}</span>
              )}
              {isOpen && isExpired && (
                <span className="text-[10px] text-red-500">Expired</span>
              )}
            </div>
            <h3 className="text-sm font-medium leading-snug truncate">{task.title}</h3>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-bold text-emerald-500">{task.budget.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">HBAR</p>
          </div>
        </div>

        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}

        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {skills.slice(0, 3).map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]">
                {s}
              </Badge>
            ))}
            {skills.length > 3 && (
              <Badge variant="outline" className="text-[10px]">+{skills.length - 3}</Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">By {shortAddr(task.creator)}</span>
          {task.claimedBy && task.claimedBy !== "0x0000000000000000000000000000000000000000" && (
            <>
              <span>&middot;</span>
              <span className="truncate">🤖 {shortAddr(task.claimedBy)}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OnchainAgentCard({ agent }: { agent: AgentProfile }) {
  const skills = agent.skills.split(",").map((s) => s.trim()).filter(Boolean);
  const completionRate =
    agent.tasksCompleted + agent.tasksDisputed > 0
      ? ((agent.tasksCompleted / (agent.tasksCompleted + agent.tasksDisputed)) * 100).toFixed(0)
      : null;

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("h-2 w-2 rounded-full shrink-0", agent.active ? "bg-emerald-400" : "bg-gray-400")} />
            <p className="text-sm font-medium truncate">{agent.name}</p>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono shrink-0">{shortAddr(agent.agentAddress)}</p>
        </div>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {skills.slice(0, 4).map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
            {skills.length > 4 && (
              <Badge variant="outline" className="text-[10px]">+{skills.length - 4}</Badge>
            )}
          </div>
        )}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{agent.tasksCompleted} completed</span>
          {completionRate && <span>{completionRate}% success</span>}
          <span className="text-emerald-500 font-medium">{agent.totalEarned.toFixed(2)} HBAR</span>
        </div>
      </CardContent>
    </Card>
  );
}
