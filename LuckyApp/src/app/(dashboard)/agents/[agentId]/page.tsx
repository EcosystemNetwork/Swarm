/** Agent Detail — Full agent profile with skills, jobs, on-chain status, and management actions. */
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import { useSwarmData } from "@/hooks/useSwarmData";
import { useSwarmWrite } from "@/hooks/useSwarmWrite";
import { useLinkData } from "@/hooks/useLinkData";
import { getScoreBand } from "@/lib/chainlink";
import { LINK_CONTRACTS } from "@/lib/link-contracts";
import {
  getAgent,
  getProjectsByOrg,
  getTasksByOrg,
  getJobsByOrg,
  updateAgent,
  deleteAgent,
  agentCheckIn,
  agentCheckOut,
  type Agent,
  type Project,
  type Task,
  type Job,
  type ReportedSkill,
} from "@/lib/firestore";
import {
  SKILL_REGISTRY,
  getOwnedItems,
  getAgentSkills,
  installSkillOnAgent,
  removeSkillFromAgent,
  type OwnedItem,
  type AgentSkill,
  type Skill,
} from "@/lib/skills";
import { shortAddress } from "@/lib/chains";
import { getAgentAvatarUrl } from "@/lib/agent-avatar";

// ---------------------------------------------------------------------------
// Error Boundary — prevents uncaught errors from crashing the entire React
// tree (which would destroy ProtectedRoute context and log the user out).
// ---------------------------------------------------------------------------
class AgentDetailErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Unknown error" };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AgentDetail] Error boundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">😕</div>
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">{this.state.message}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" asChild>
                <Link href="/agents">← Back to Fleet</Link>
              </Button>
              <Button
                onClick={() => {
                  this.setState({ hasError: false, message: "" });
                  window.location.reload();
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AGENT_TYPES: Agent['type'][] = ['Research', 'Trading', 'Operations', 'Support', 'Analytics', 'Scout', 'Security', 'Creative', 'Engineering', 'DevOps', 'Marketing', 'Finance', 'Data', 'Coordinator', 'Legal', 'Communication'];

const TYPE_COLORS: Record<string, string> = {
  Research: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  Trading: "bg-emerald-100 text-emerald-700 border-green-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  Operations: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
  Support: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
  Analytics: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800",
  Scout: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  Security: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  Creative: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800",
  Engineering: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  DevOps: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
  Marketing: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-400 dark:border-fuchsia-800",
  Finance: "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-950/40 dark:text-lime-400 dark:border-lime-800",
  Data: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800",
  Coordinator: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
  Legal: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-800",
  Communication: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
};

export default function AgentDetailPageWrapper() {
  return (
    <AgentDetailErrorBoundary>
      <AgentDetailPage />
    </AgentDetailErrorBoundary>
  );
}

function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const { currentOrg } = useOrg();
  const swarm = useSwarmData();
  const swarmWrite = useSwarmWrite();
  const linkChain = useLinkData();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [agentTasks, setAgentTasks] = useState<Task[]>([]);
  const [agentJobs, setAgentJobs] = useState<Job[]>([]);
  const [ownedItems, setOwnedItems] = useState<OwnedItem[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillBusy, setSkillBusy] = useState<string | null>(null);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<Agent['type']>('Research');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // On-chain registration state
  const [showRegister, setShowRegister] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerSkills, setRegisterSkills] = useState('');
  const [registerFeeRate, setRegisterFeeRate] = useState('500');

  const loadAgentData = async () => {
    if (!currentOrg) return;

    setLoading(true);
    setError(null);

    // Fetch agent first — if this fails, nothing else matters
    let agentData: Agent | null = null;
    try {
      agentData = await getAgent(agentId);
    } catch (err) {
      console.error('Failed to load agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agent');
      setLoading(false);
      return;
    }

    if (!agentData) {
      setError('Agent not found');
      setLoading(false);
      return;
    }

    if (agentData.orgId !== currentOrg.id) {
      setError('Agent not found in this organization');
      setLoading(false);
      return;
    }

    setAgent(agentData);

    // Fetch remaining data in parallel — each wrapped in its own try-catch
    // so one failing query doesn't prevent the others from loading
    const [allProjects, allTasks, allJobs, orgItems, agentSkillData] = await Promise.all([
      getProjectsByOrg(currentOrg.id).catch((err) => { console.error('Failed to load projects:', err); return [] as Project[]; }),
      getTasksByOrg(currentOrg.id).catch((err) => { console.error('Failed to load tasks:', err); return [] as Task[]; }),
      getJobsByOrg(currentOrg.id).catch((err) => { console.error('Failed to load jobs:', err); return [] as Job[]; }),
      getOwnedItems(currentOrg.id).catch((err) => { console.error('Failed to load owned items:', err); return [] as OwnedItem[]; }),
      getAgentSkills(agentId).catch((err) => { console.error('Failed to load agent skills:', err); return [] as AgentSkill[]; }),
    ]);

    setOwnedItems(orgItems);
    setAgentSkills(agentSkillData);

    const assigned = allProjects.filter(project =>
      agentData.projectIds.includes(project.id)
    );
    setAssignedProjects(assigned);

    const tasks = allTasks.filter(task =>
      task.assigneeAgentId === agentId
    );
    setAgentTasks(tasks);

    const jobs = allJobs.filter(job =>
      job.takenByAgentId === agentId
    );
    setAgentJobs(jobs);

    setLoading(false);
  };

  useEffect(() => {
    loadAgentData();
  }, [agentId, currentOrg]);

  const handleStatusToggle = async () => {
    if (!agent || !currentOrg) return;
    const newStatus: Agent['status'] = agent.status === 'online' ? 'offline' : 'online';
    try {
      setUpdating(true);
      await updateAgent(agentId, { status: newStatus });
      const updatedAgent = { ...agent, status: newStatus };
      setAgent(updatedAgent);

      // Auto check-in/check-out to agent group chat
      if (newStatus === 'online') {
        await agentCheckIn(updatedAgent, currentOrg.id);
      } else {
        await agentCheckOut(updatedAgent, currentOrg.id);
      }
    } catch (err) {
      console.error('Failed to update agent status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent status');
    } finally {
      setUpdating(false);
    }
  };

  const handleEditOpen = () => {
    if (!agent) return;
    setEditName(agent.name);
    setEditType(agent.type);
    setEditDescription(agent.description);
    setShowEdit(true);
  };

  const handleEditSave = async () => {
    if (!agent || !editName.trim()) return;
    try {
      setSaving(true);
      await updateAgent(agentId, { name: editName.trim(), type: editType, description: editDescription.trim() });
      setAgent({ ...agent, name: editName.trim(), type: editType, description: editDescription.trim() });
      setShowEdit(false);
    } catch (err) {
      console.error('Failed to update agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true);
      await deleteAgent(agentId);
      router.push('/agents');
    } catch (err) {
      console.error('Failed to delete agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
      setDeleting(false);
    }
  };

  const handleRegisterOpen = () => {
    if (!agent) return;
    setRegisterName(agent.name);
    setRegisterSkills((agent.capabilities ?? []).join(', '));
    setRegisterFeeRate('500');
    swarmWrite.reset();
    setShowRegister(true);
  };

  const handleRegisterSubmit = async () => {
    if (!registerName.trim()) return;
    const feeRate = parseInt(registerFeeRate, 10);
    if (isNaN(feeRate) || feeRate < 0) return;
    const txHash = await swarmWrite.registerAgent(registerName.trim(), registerSkills.trim(), feeRate);
    if (txHash) {
      swarm.refetch();
    }
  };

  const handleInstallSkill = async (skillId: string) => {
    if (!currentOrg) return;
    setSkillBusy(skillId);
    try {
      await installSkillOnAgent(agentId, skillId, currentOrg.id, "system");
      const updated = await getAgentSkills(agentId);
      setAgentSkills(updated);
    } catch (err) {
      console.error("Failed to install skill on agent:", err);
    } finally {
      setSkillBusy(null);
    }
  };

  const handleRemoveSkill = async (agentSkill: AgentSkill) => {
    setSkillBusy(agentSkill.skillId);
    try {
      await removeSkillFromAgent(agentSkill.id);
      const updated = await getAgentSkills(agentId);
      setAgentSkills(updated);
    } catch (err) {
      console.error("Failed to remove skill from agent:", err);
    } finally {
      setSkillBusy(null);
    }
  };

  const formatTime = (timestamp: unknown) => {
    if (!timestamp) return 'Unknown';
    let date: Date;
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
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
  };

  const parseReward = (r?: string) => {
    if (!r) return 0;
    const n = parseFloat(r.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p>Loading agent...</p>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold mb-2">Agent Not Found</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button asChild variant="outline">
            <Link href="/agents">← Back to Fleet</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Compute metrics
  const completedTasks = agentTasks.filter(t => t.status === 'done').length;
  const activeTasks = agentTasks.filter(t => t.status === 'in_progress').length;
  const todoTasks = agentTasks.filter(t => t.status === 'todo').length;
  const completionRate = agentTasks.length > 0 ? Math.round((completedTasks / agentTasks.length) * 100) : 0;

  const jobsCompleted = agentJobs.filter(j => j.status === 'completed' || j.status === 'closed').length;
  const jobsInProgress = agentJobs.filter(j => j.status === 'in_progress' || j.status === 'claimed').length;
  const totalEarnings = agentJobs
    .filter(j => j.status === 'completed' || j.status === 'closed')
    .reduce((sum, j) => sum + parseReward(j.reward), 0);

  // On-chain matching — Hedera
  const onchainMatch = swarm.agents.find(
    a => a.name.toLowerCase() === agent.name.toLowerCase()
  );
  // On-chain matching — LINK / Sepolia
  const linkMatch = linkChain.agents.find(
    a => a.name.toLowerCase().includes(agent.name.toLowerCase()) || a.asn === agent.asn
  );
  // ASN record from on-chain registry
  const asnRecord = agent.asn ? linkChain.asnRecords.find(r => r.asn === agent.asn) : null;
  // Credit scoring
  const creditScore = asnRecord?.creditScore ?? agent.creditScore ?? 680;
  const trustScore = asnRecord?.trustScore ?? agent.trustScore ?? 50;
  const scoreBand = getScoreBand(creditScore);
  const linkDeployed = !!(LINK_CONTRACTS.AGENT_REGISTRY || LINK_CONTRACTS.ASN_REGISTRY);

  // Skills — agent-level skills (installed on THIS agent)
  const agentSkillIds = new Set(agentSkills.map(s => s.skillId));
  const ownedSkillIds = new Set(ownedItems.map(i => i.skillId));
  const activeSkills = SKILL_REGISTRY.filter(s => agentSkillIds.has(s.id));
  // Available = in org inventory but not yet on this agent (skills & plugins only — mods are protocol-wide)
  const availableForAgent = SKILL_REGISTRY.filter(
    s => ownedSkillIds.has(s.id) && !agentSkillIds.has(s.id) && (s.type === "skill" || s.type === "plugin")
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/agents" className="text-muted-foreground hover:text-amber-600 transition-colors text-lg mt-2">
          ←
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-2xl font-bold text-amber-700 dark:text-amber-400 overflow-hidden">
            <img src={agent.avatarUrl || getAgentAvatarUrl(agent.name, agent.type)} alt={agent.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
              <Badge className={TYPE_COLORS[agent.type] || ""}>{agent.type}</Badge>
              <span className={`text-sm flex items-center gap-1.5 ${
                agent.status === "online" ? "text-emerald-600 dark:text-emerald-400" :
                agent.status === "busy" ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full ${
                  agent.status === "online" ? "bg-emerald-500" :
                  agent.status === "busy" ? "bg-orange-500" : "bg-muted"
                }`} />
                {agent.status}
              </span>
              {onchainMatch && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                  On-Chain
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">{agent.description}</p>
            <p className="text-[10px] font-mono text-muted-foreground mt-1" title={agent.id}>
              ID: {agent.id}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              onClick={handleStatusToggle}
              disabled={updating}
              variant={agent.status === 'online' ? 'outline' : 'default'}
              className={agent.status === 'online' ? 'hover:bg-red-50 hover:border-red-300 hover:text-red-600' : 'bg-emerald-600 hover:bg-green-700'}
            >
              {updating ? 'Updating...' : agent.status === 'online' ? 'Set Offline' : 'Set Online'}
            </Button>
            <Button variant="outline" onClick={handleEditOpen}>
              ✏️ Edit
            </Button>
            <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700" onClick={() => setShowDelete(true)}>
              🗑️ Remove
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Agent Bio */}
      {agent.bio && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="text-lg mt-0.5">💬</span>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Agent Bio</p>
                <p className="text-sm leading-relaxed">{agent.bio}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{assignedProjects.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Projects</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold">{agentTasks.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Tasks</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Done</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{activeTasks}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-muted-foreground">{todoTasks}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Todo</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold">{agentJobs.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {completionRate}%
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Completion</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {totalEarnings > 0 ? totalEarnings.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Earnings</div>
          </CardContent>
        </Card>
      </div>

      {/* Task completion progress */}
      {agentTasks.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium">Task Progress</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{completionRate}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden flex">
              {completedTasks > 0 && (
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(completedTasks / agentTasks.length) * 100}%` }} />
              )}
              {activeTasks > 0 && (
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${(activeTasks / agentTasks.length) * 100}%` }} />
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{completedTasks} done</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />{activeTasks} active</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/30" />{todoTasks} todo</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Capabilities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">⚡ Capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(agent.capabilities ?? []).map((cap, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {cap}
                </Badge>
              ))}
              {(agent.capabilities ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No capabilities defined</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Project Assignments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">📁 Project Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assignedProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/swarms/${project.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="font-medium text-sm">{project.name}</span>
                  <Badge
                    className={
                      project.status === "active"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        : project.status === "paused"
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {project.status}
                  </Badge>
                </Link>
              ))}
              {assignedProjects.length === 0 && (
                <p className="text-sm text-muted-foreground">Not assigned to any projects</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Skills & Plugins */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">🧩 Agent Skills & Plugins</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{activeSkills.length} installed</Badge>
              {availableForAgent.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSkillPicker(!showSkillPicker)}
                  className="h-7 text-xs gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                >
                  + Add
                </Button>
              )}
            </div>
          </div>
          <CardDescription>Skills and plugins installed on this agent. Get items from the Market, then add them here.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Available skills picker */}
          {showSkillPicker && availableForAgent.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <p className="text-xs font-medium text-amber-500 mb-2">Available from Inventory</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {availableForAgent.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => handleInstallSkill(skill.id)}
                    disabled={skillBusy === skill.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:border-amber-500/30 transition-all text-left"
                  >
                    <span className="text-lg flex-shrink-0">{skill.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{skill.name}</span>
                        <Badge variant="outline" className="text-[9px] capitalize">{skill.type}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{skill.description}</p>
                    </div>
                    {skillBusy === skill.id ? (
                      <span className="text-amber-500 text-xs">...</span>
                    ) : (
                      <span className="text-amber-500 text-xs font-medium">+ Add</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Installed skills */}
          {activeSkills.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeSkills.map((skill) => {
                const agentSkill = agentSkills.find(s => s.skillId === skill.id);
                return (
                  <div
                    key={skill.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30 group"
                  >
                    <span className="text-lg flex-shrink-0">{skill.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{skill.name}</span>
                        <span className="text-[10px] text-muted-foreground">v{skill.version}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{skill.description}</p>
                    </div>
                    {agentSkill && (
                      <button
                        onClick={() => handleRemoveSkill(agentSkill)}
                        disabled={skillBusy === skill.id}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                        title="Remove from agent"
                      >
                        {skillBusy === skill.id ? (
                          <span className="text-xs">...</span>
                        ) : (
                          <span className="text-xs">✕</span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <div className="text-2xl mb-2">🧩</div>
              <p className="text-sm">No skills installed on this agent</p>
              <p className="text-xs mt-1">
                {availableForAgent.length > 0
                  ? "Click \"+ Add\" above to install from your inventory"
                  : "Get skills from the Market first, then add them here"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Self-Reported Skills (from agent on connect) */}
      {(agent.reportedSkills ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">📡 Reported Skills</CardTitle>
              <Badge variant="secondary" className="text-xs">{(agent.reportedSkills ?? []).length} reported</Badge>
            </div>
            <CardDescription>Skills and plugins this agent reported when it connected to the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(agent.reportedSkills ?? []).map((rs: ReportedSkill) => {
                // Try to match with a registry item for a richer display
                const registryMatch = SKILL_REGISTRY.find(s => s.id === rs.id);
                return (
                  <div
                    key={rs.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30"
                  >
                    <span className="text-lg flex-shrink-0">{registryMatch?.icon ?? (rs.type === "plugin" ? "🔌" : "⚙️")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{rs.name}</span>
                        {rs.version && <span className="text-[10px] text-muted-foreground">v{rs.version}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] capitalize">{rs.type}</Badge>
                        {registryMatch && (
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400">verified</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Protocol Mods (org-wide) */}
      {(() => {
        const activeMods = SKILL_REGISTRY.filter(s => s.type === "mod" && ownedSkillIds.has(s.id));
        if (activeMods.length === 0) return null;
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">🔧 Active Protocol Mods</CardTitle>
              <CardDescription>Organization-wide mods applied to all agents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activeMods.map((mod) => (
                  <div key={mod.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30">
                    <span className="text-lg flex-shrink-0">{mod.icon}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium truncate block">{mod.name}</span>
                      <p className="text-[11px] text-muted-foreground truncate">{mod.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ASN Identity & Credit Score */}
      {agent.asn && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">🪪 Agent Identity (ASN)</CardTitle>
              <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800 font-mono text-[10px]">
                {agent.asn}
              </Badge>
            </div>
            <CardDescription>Agent Social Number — on-chain identity and credit scoring</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg border border-border">
                <div className={`text-2xl font-bold ${scoreBand.color}`}>{creditScore}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Credit Score</div>
                <Badge className={`mt-1 text-[9px] ${scoreBand.bgColor} ${scoreBand.color} ${scoreBand.borderColor}`}>
                  {scoreBand.label} ({scoreBand.range})
                </Badge>
              </div>
              <div className="text-center p-3 rounded-lg border border-border">
                <div className="text-2xl font-bold text-blue-500">{trustScore}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Trust Score</div>
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${trustScore}%` }} />
                </div>
              </div>
              <div className="text-center p-3 rounded-lg border border-border">
                <div className="text-2xl font-bold text-purple-500">{asnRecord?.tasksCompleted ?? 0}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Tasks Completed</div>
                <div className="text-[9px] text-muted-foreground mt-1">On-chain verified</div>
              </div>
              <div className="text-center p-3 rounded-lg border border-border">
                <div className="flex items-center justify-center gap-1">
                  {asnRecord ? (
                    <span className="text-emerald-500 text-lg font-bold">On-Chain</span>
                  ) : agent.asnOnChainRegistered ? (
                    <span className="text-amber-500 text-lg font-bold">Pending</span>
                  ) : (
                    <span className="text-muted-foreground text-lg font-bold">Off-Chain</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">ASN Status</div>
                {agent.asnOnChainTxHash && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${agent.asnOnChainTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-cyan-600 hover:underline mt-1 block"
                  >
                    View TX
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* On-Chain Registration — Multi-Chain */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">⛓️ On-Chain Status</CardTitle>
            <div className="flex gap-1.5">
              <Badge className={onchainMatch
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
              }>
                Hedera {onchainMatch ? "✓" : "✗"}
              </Badge>
              {linkDeployed && (
                <Badge className={linkMatch
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                  : "bg-muted text-muted-foreground"
                }>
                  Sepolia {linkMatch ? "✓" : "✗"}
                </Badge>
              )}
            </div>
          </div>
          <CardDescription>Smart contract registration across chains</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Hedera Chain */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium">Hedera Testnet</span>
                <Badge variant="outline" className="text-[9px]">HBAR</Badge>
              </div>
              {onchainMatch ? (
                <div className="grid grid-cols-2 gap-3 text-sm pl-2 border-l-2 border-emerald-500/30">
                  <div>
                    <span className="text-xs text-muted-foreground">Agent Address</span>
                    <p className="font-mono text-xs mt-0.5">{shortAddress(onchainMatch.agentAddress)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Fee Rate</span>
                    <p className="text-xs font-medium mt-0.5">{onchainMatch.feeRate} bps ({(onchainMatch.feeRate / 100).toFixed(1)}%)</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Status</span>
                    <p className="text-xs mt-0.5">
                      <span className={`inline-flex items-center gap-1 ${onchainMatch.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        <span className={`w-2 h-2 rounded-full ${onchainMatch.active ? 'bg-emerald-500' : 'bg-muted'}`} />
                        {onchainMatch.active ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Registered</span>
                    <p className="text-xs mt-0.5">
                      {onchainMatch.registeredAt > 0
                        ? new Date(onchainMatch.registeredAt * 1000).toLocaleDateString()
                        : '—'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="pl-2 border-l-2 border-muted">
                  <p className="text-xs text-muted-foreground">Not registered on Hedera</p>
                  <Button onClick={handleRegisterOpen} size="sm" className="mt-2 bg-amber-600 hover:bg-amber-700 text-black text-xs h-7">
                    Register on Hedera
                  </Button>
                </div>
              )}
            </div>

            {/* LINK / Sepolia Chain */}
            {linkDeployed && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium">Ethereum Sepolia</span>
                  <Badge variant="outline" className="text-[9px]">LINK</Badge>
                </div>
                {linkMatch ? (
                  <div className="grid grid-cols-2 gap-3 text-sm pl-2 border-l-2 border-blue-500/30">
                    <div>
                      <span className="text-xs text-muted-foreground">Agent Address</span>
                      <p className="font-mono text-xs mt-0.5">{shortAddress(linkMatch.agentAddress)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">ASN</span>
                      <p className="font-mono text-xs mt-0.5 text-cyan-600">{linkMatch.asn || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Credit / Trust</span>
                      <p className="text-xs mt-0.5">
                        <span className={scoreBand.color}>{linkMatch.creditScore}</span>
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="text-blue-500">{linkMatch.trustScore}</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Status</span>
                      <p className="text-xs mt-0.5">
                        <span className={`inline-flex items-center gap-1 ${linkMatch.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                          <span className={`w-2 h-2 rounded-full ${linkMatch.active ? 'bg-emerald-500' : 'bg-muted'}`} />
                          {linkMatch.active ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                    </div>
                  </div>
                ) : agent.linkOnChainRegistered ? (
                  <div className="pl-2 border-l-2 border-amber-500/30">
                    <p className="text-xs text-amber-600">Registered (pending sync)</p>
                    {agent.linkOnChainTxHash && (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${agent.linkOnChainTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-cyan-600 hover:underline"
                      >
                        View TX on Etherscan
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="pl-2 border-l-2 border-muted">
                    <p className="text-xs text-muted-foreground">Not registered on Sepolia</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Agents are auto-registered on Sepolia during connection</p>
                  </div>
                )}
              </div>
            )}

            {/* On-Chain Skills (from Hedera match) */}
            {onchainMatch?.skills && (
              <div className="border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">On-Chain Skills</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {onchainMatch.skills.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                    <Badge key={skill} variant="outline" className="text-[10px]">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SwarmConnect / OpenClaw Connection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🔗 SwarmConnect</CardTitle>
          <CardDescription>Agent connection details for OpenClaw integration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Agent ID</span>
                <p className="font-mono text-xs break-all mt-0.5">{agent.id}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">API Key</span>
                <p className="font-mono text-xs mt-0.5">
                  {agent.apiKey
                    ? `${agent.apiKey.slice(0, 8)}${'•'.repeat(20)}${agent.apiKey.slice(-4)}`
                    : 'Not set'}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Organization</span>
                <p className="text-xs mt-0.5">{currentOrg?.name} ({currentOrg?.id})</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Connection Method</span>
                <p className="text-xs mt-0.5">Ed25519 Signed Requests</p>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <span className="text-xs text-muted-foreground block mb-1.5">Quick Setup</span>
              <div className="bg-muted rounded-md p-3 font-mono text-[11px] space-y-1">
                <p className="text-muted-foreground"># Install the SwarmConnect skill</p>
                <p>npm install -g @swarmprotocol/agent-skill</p>
                <p className="text-muted-foreground mt-2"># Register this agent (with skills)</p>
                <p>swarm register --hub https://swarm.perkos.xyz --org {currentOrg?.id} --name &quot;{agent.name}&quot; --type &quot;{agent.type}&quot; --skills &quot;web-search,code-interpreter&quot;</p>
                <p className="text-muted-foreground mt-2"># Report skills at any time</p>
                <p>swarm report-skills --skills &quot;web-search,code-interpreter&quot;</p>
                <p className="text-muted-foreground mt-2"># Check for messages</p>
                <p>swarm check</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">💼 Assigned Jobs</CardTitle>
            <div className="flex items-center gap-2">
              {jobsCompleted > 0 && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">{jobsCompleted} completed</Badge>}
              {jobsInProgress > 0 && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">{jobsInProgress} active</Badge>}
            </div>
          </div>
          <CardDescription>Jobs claimed or assigned to this agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {agentJobs.slice(0, 10).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{job.title}</div>
                  {job.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {job.description.substring(0, 100)}{job.description.length > 100 ? '...' : ''}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span>Priority: {job.priority}</span>
                    {job.reward && <span className="text-amber-600 dark:text-amber-400 font-medium">{job.reward}</span>}
                    {job.requiredSkills?.length > 0 && (
                      <span>{job.requiredSkills.slice(0, 3).join(', ')}</span>
                    )}
                  </div>
                </div>
                <Badge
                  className={
                    job.status === "completed" || job.status === "closed"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : job.status === "in_progress" || job.status === "claimed"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {job.status === 'in_progress' ? 'In Progress' :
                   job.status === 'claimed' ? 'Claimed' :
                   job.status === 'completed' ? 'Completed' :
                   job.status === 'closed' ? 'Closed' : 'Open'}
                </Badge>
              </div>
            ))}
            {agentJobs.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <div className="text-2xl mb-2">💼</div>
                <p className="text-sm">No jobs assigned yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Tasks */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">📋 Assigned Tasks</CardTitle>
            <Badge variant="secondary" className="text-xs">{agentTasks.length} total</Badge>
          </div>
          <CardDescription>Tasks currently assigned to this agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {agentTasks.slice(0, 10).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{task.title}</div>
                  {task.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {task.description.substring(0, 80)}{task.description.length > 80 ? '...' : ''}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Priority: {task.priority} · Created {formatTime(task.createdAt)}
                  </div>
                </div>
                <Badge
                  className={
                    task.status === "done"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : task.status === "in_progress"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {task.status === 'in_progress' ? 'In Progress' :
                   task.status === 'todo' ? 'To Do' : 'Done'}
                </Badge>
              </div>
            ))}
            {agentTasks.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <div className="text-2xl mb-2">📋</div>
                <p className="text-sm">No tasks assigned yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Agent Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Name *</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Type *</label>
              <Select value={editType} onValueChange={(value: Agent['type']) => setEditType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={saving || !editName.trim()} className="bg-amber-600 hover:bg-amber-700 text-black">
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Agent Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove <strong>{agent?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Removing...' : '🗑️ Remove'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Register On-Chain Dialog */}
      <Dialog open={showRegister} onOpenChange={(open) => { setShowRegister(open); if (!open) swarmWrite.reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⛓️ Register Agent On-Chain</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Register <strong>{agent?.name}</strong> on the Hedera Agent Registry smart contract.
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Name *</label>
              <Input value={registerName} onChange={e => setRegisterName(e.target.value)} disabled={swarmWrite.state.isLoading} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Skills</label>
              <Input
                value={registerSkills}
                onChange={e => setRegisterSkills(e.target.value)}
                placeholder="e.g. research, analysis, trading"
                disabled={swarmWrite.state.isLoading}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Comma-separated list of skills stored onchain</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Fee Rate (basis points)</label>
              <Input
                type="number"
                value={registerFeeRate}
                onChange={e => setRegisterFeeRate(e.target.value)}
                min={0}
                max={10000}
                disabled={swarmWrite.state.isLoading}
              />
              <p className="text-[11px] text-muted-foreground mt-1">500 bps = 5% fee on completed tasks</p>
            </div>

            {swarmWrite.state.error && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400">
                {swarmWrite.state.error}
              </div>
            )}

            {swarmWrite.state.txHash && (
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400">
                <p className="font-medium">Registration successful!</p>
                <p className="text-xs font-mono mt-1 break-all">TX: {swarmWrite.state.txHash}</p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRegister(false)} disabled={swarmWrite.state.isLoading}>
                {swarmWrite.state.txHash ? 'Close' : 'Cancel'}
              </Button>
              {!swarmWrite.state.txHash && (
                <Button
                  onClick={handleRegisterSubmit}
                  disabled={swarmWrite.state.isLoading || !registerName.trim()}
                  className="bg-amber-600 hover:bg-amber-700 text-black"
                >
                  {swarmWrite.state.isLoading ? 'Registering...' : '⛓️ Register'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
