/** HBAR — On-chain task board, agent registry, and treasury on Hedera. */
"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/analytics/stat-card";
import { PerformanceTable, PnlDisplay, WinRateBar } from "@/components/analytics/performance-table";
import { Leaderboard } from "@/components/leaderboard";
import { useSwarmData } from "@/hooks/useSwarmData";
import { useSwarmWrite } from "@/hooks/useSwarmWrite";
import { useChainCurrency } from "@/hooks/useChainCurrency";
import { useActiveAccount } from "thirdweb/react";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import { useOrg } from "@/contexts/OrgContext";
import { getOwnedItems } from "@/lib/skills";
import {
  TaskStatus,
  STATUS_CONFIG,
  HEDERA_CONTRACTS as CONTRACTS,
  shortAddr,
  timeRemaining,
  explorerContract,
  type TaskListing,
  type AgentProfile,
} from "@/lib/swarm-contracts";
import { ethers } from "ethers";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import type { Agent as FleetAgent } from "@/lib/firestore";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import CountUp from "@/components/reactbits/CountUp";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type HbarTab = "overview" | "tasks" | "agents" | "treasury" | "explorer" | "brandmover" | "orgs" | "memory" | "metrics";

interface AgentPerformance {
  agentId: string;
  name: string;
  type: string;
  winRate: number;
  totalPredictions: number;
  wins: number;
  losses: number;
  pending: number;
  pnl: number;
  streak: number;
}

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════

export default function HbarPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as HbarTab) || "overview";
  const [tab, setTab] = useState<HbarTab>(initialTab);
  const account = useActiveAccount();
  const authAddress = useAuthAddress();
  const { currentOrg } = useOrg();
  const [hasBrandMover, setHasBrandMover] = useState(false);

  // Check if org owns BrandMover mod
  useEffect(() => {
    if (!currentOrg?.id) return;
    getOwnedItems(currentOrg.id).then((items) => {
      const owned = items.some((item) => item.skillId === "brandmover" && item.enabled);
      setHasBrandMover(owned);
    });
  }, [currentOrg?.id]);

  // Sync tab from URL changes (e.g. sidebar click to ?tab=brandmover)
  useEffect(() => {
    const urlTab = searchParams.get("tab") as HbarTab;
    if (urlTab && urlTab !== tab) setTab(urlTab);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const swarm = useSwarmData();
  const swarmWrite = useSwarmWrite();
  const { symbol: currencySymbol, fmt: fmtCurrency } = useChainCurrency();

  // Task detail / post dialogs
  const [selectedTask, setSelectedTask] = useState<TaskListing | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [ocTitle, setOcTitle] = useState("");
  const [ocDesc, setOcDesc] = useState("");
  const [ocSkills, setOcSkills] = useState("");
  const [ocBudget, setOcBudget] = useState("");
  const [ocDeadlineDays, setOcDeadlineDays] = useState("7");
  const [deliveryInput, setDeliveryInput] = useState("");

  // Agent registration dialog — pick from existing fleet agents
  const [registerOpen, setRegisterOpen] = useState(false);
  const [fleetAgents, setFleetAgents] = useState<FleetAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [ocAgentFeeRate, setOcAgentFeeRate] = useState("500");

  // Fetch org's fleet agents from Firestore
  useEffect(() => {
    if (!currentOrg?.id) { setFleetAgents([]); return; }
    const q = query(collection(db, "agents"), where("orgId", "==", currentOrg.id));
    const unsub = onSnapshot(q, (snap) => {
      setFleetAgents(snap.docs.map(d => ({ id: d.id, ...d.data() } as FleetAgent)));
    });
    return () => unsub();
  }, [currentOrg?.id]);

  const selectedFleetAgent = fleetAgents.find(a => a.id === selectedAgentId);
  const selectedAgentSkills = selectedFleetAgent
    ? (selectedFleetAgent.reportedSkills?.map(s => s.name).join(", ") || selectedFleetAgent.type)
    : "";

  // Memory tab state
  const [memAgentId, setMemAgentId] = useState("");
  const [memASN, setMemASN] = useState("");
  const [memTopicId, setMemTopicId] = useState("");
  const [memContent, setMemContent] = useState("");
  const [memType, setMemType] = useState<"conversation" | "context" | "skill_learned" | "preference" | "snapshot">("conversation");
  const [memLoading, setMemLoading] = useState(false);
  const [memStatus, setMemStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [memMemories, setMemMemories] = useState<any[]>([]);
  const [memBreakdown, setMemBreakdown] = useState<Record<string, number>>({});
  const [memTotalCount, setMemTotalCount] = useState(0);
  const [memHashscanUrl, setMemHashscanUrl] = useState("");

  // Memory API handlers
  async function handleCreateMemoryTopic() {
    if (!memAgentId || !memASN) {
      setMemStatus({ type: "error", message: "Agent ID and ASN are required" });
      return;
    }
    setMemLoading(true);
    setMemStatus(null);
    try {
      const res = await fetch("/api/v1/hedera-memory/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: memAgentId, asn: memASN }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create topic");
      setMemTopicId(data.memoryTopicId);
      setMemHashscanUrl(data.hashscanUrl || "");
      setMemStatus({ type: "success", message: `Topic created: ${data.memoryTopicId}` });
    } catch (err: any) {
      setMemStatus({ type: "error", message: err.message });
    } finally {
      setMemLoading(false);
    }
  }

  async function handlePostMemory() {
    if (!memTopicId || !memASN || !memContent) {
      setMemStatus({ type: "error", message: "Topic ID, ASN, and content are required" });
      return;
    }
    setMemLoading(true);
    setMemStatus(null);
    try {
      const res = await fetch("/api/v1/hedera-memory/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: memTopicId,
          asn: memASN,
          message: { type: memType, content: memContent, metadata: { timestamp: Date.now() } },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post memory");
      setMemContent("");
      setMemStatus({ type: "success", message: `Memory posted! Seq #${data.sequenceNumber}` });
    } catch (err: any) {
      setMemStatus({ type: "error", message: err.message });
    } finally {
      setMemLoading(false);
    }
  }

  async function handleRetrieveMemories() {
    if (!memTopicId || !memASN) {
      setMemStatus({ type: "error", message: "Topic ID and ASN are required" });
      return;
    }
    setMemLoading(true);
    setMemStatus(null);
    try {
      const res = await fetch("/api/v1/hedera-memory/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: memTopicId, asn: memASN }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to retrieve memories");
      setMemMemories(data.memories || []);
      setMemBreakdown(data.breakdown || {});
      setMemTotalCount(data.totalMemories || 0);
      setMemStatus({ type: "success", message: data.message });
    } catch (err: any) {
      setMemStatus({ type: "error", message: err.message });
    } finally {
      setMemLoading(false);
    }
  }

  // ── Derived data ──

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
  const totalBudget = useMemo(
    () => swarm.tasks.reduce((s, t) => s + t.budget, 0),
    [swarm.tasks]
  );

  // Treasury stats
  const stats = useMemo(() => {
    const completed = swarm.tasks.filter((t) => t.status === TaskStatus.Completed).length;
    const expired = swarm.tasks.filter((t) => t.status === TaskStatus.Expired).length;
    const disputed = swarm.tasks.filter((t) => t.status === TaskStatus.Disputed).length;
    const resolved = completed + expired + disputed;
    const winRate = resolved > 0 ? (completed / resolved) * 100 : 0;
    const treasuryRevenue = swarm.treasury?.totalRevenue ?? 0;
    const totalTaskBudget = swarm.tasks.reduce((sum, t) => sum + t.budget, 0);

    return {
      totalPnl: treasuryRevenue > 0 ? treasuryRevenue : totalTaskBudget,
      winRate: Math.round(winRate * 10) / 10,
      totalTasks: swarm.totalTasks,
      activeAgents: swarm.agents.filter((a) => a.active).length,
    };
  }, [swarm.tasks, swarm.treasury, swarm.totalTasks, swarm.agents]);

  const agentPerfData = useMemo<AgentPerformance[]>(() => {
    return swarm.agents.map((agent) => {
      const agentTasks = swarm.tasks.filter(
        (t) => t.claimedBy?.toLowerCase() === agent.agentAddress.toLowerCase()
      );
      const wins = agentTasks.filter((t) => t.status === TaskStatus.Completed).length;
      const losses = agentTasks.filter(
        (t) => t.status === TaskStatus.Expired || t.status === TaskStatus.Disputed
      ).length;
      const pending = agentTasks.filter((t) => t.status === TaskStatus.Claimed).length;
      const total = wins + losses + pending;
      const pnl = agentTasks.reduce((sum, t) => sum + t.budget, 0);
      const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
      const firstSkill = (agent.skills || "").split(",")[0]?.trim() || "Agent";

      return {
        agentId: agent.agentAddress,
        name: agent.name,
        type: firstSkill,
        winRate: Math.round(winRate * 10) / 10,
        totalPredictions: total,
        wins,
        losses,
        pending,
        pnl,
        streak: 0,
      };
    });
  }, [swarm.agents, swarm.tasks]);

  const marketData = useMemo(() => {
    if (!swarm.treasury) return [];
    return [
      { category: "revenue", label: "Total Revenue", icon: "💰", totalPnl: swarm.treasury.totalRevenue, winRate: stats.winRate, totalTasks: swarm.totalTasks },
      { category: "compute", label: "Compute", icon: "⚙️", totalPnl: swarm.treasury.computeBalance, winRate: 0, totalTasks: 0 },
      { category: "growth", label: "Growth", icon: "📈", totalPnl: swarm.treasury.growthBalance, winRate: 0, totalTasks: 0 },
      { category: "reserve", label: "Reserve", icon: "🏦", totalPnl: swarm.treasury.reserveBalance, winRate: 0, totalTasks: 0 },
    ];
  }, [swarm.treasury, swarm.totalTasks, stats.winRate]);

  // ── Column definitions for performance table ──

  const agentColumns = useMemo(() => [
    {
      key: "name",
      label: "Agent",
      render: (a: AgentPerformance) => (
        <div className="min-w-0">
          <span className="font-medium truncate block">{a.name}</span>
          <span className="text-xs text-muted-foreground">{a.type}</span>
        </div>
      ),
    },
    {
      key: "winRate",
      label: "Win Rate",
      sortable: true,
      getValue: (a: AgentPerformance) => a.winRate,
      render: (a: AgentPerformance) => <WinRateBar rate={a.winRate} />,
    },
    {
      key: "pnl",
      label: `${currencySymbol} Value`,
      sortable: true,
      getValue: (a: AgentPerformance) => a.pnl,
      render: (a: AgentPerformance) => <PnlDisplay value={a.pnl} currency={currencySymbol} />,
    },
    {
      key: "tasks",
      label: "Tasks",
      sortable: true,
      getValue: (a: AgentPerformance) => a.totalPredictions,
      render: (a: AgentPerformance) => (
        <div className="text-sm">
          <span className="font-medium">{a.totalPredictions}</span>
          <span className="text-muted-foreground ml-1 text-xs">
            ({a.wins}W / {a.losses}L)
          </span>
        </div>
      ),
    },
    {
      key: "streak",
      label: "Streak",
      sortable: true,
      getValue: (a: AgentPerformance) => a.streak,
      render: (a: AgentPerformance) => {
        const isWin = a.streak > 0;
        return (
          <span className={cn("text-sm font-medium", isWin ? "text-amber-600 dark:text-amber-400" : a.streak === 0 ? "text-muted-foreground" : "text-red-500")}>
            {a.streak === 0 ? "—" : isWin ? `🔥 ${a.streak}W` : `${Math.abs(a.streak)}L`}
          </span>
        );
      },
    },
  ], [currencySymbol]);

  // ── Tabs ──

  const allTabs: { id: HbarTab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "tasks", label: "Tasks", icon: "📋" },
    { id: "agents", label: "Agents", icon: "🤖" },
    { id: "treasury", label: "Treasury", icon: "🏦" },
    { id: "orgs", label: "Organizations", icon: "🏢" },
    { id: "memory", label: "Memory", icon: "🧠" },
    { id: "metrics", label: "Metrics", icon: "📈" },
    { id: "explorer", label: "Explorer", icon: "🔗" },
    { id: "brandmover", label: "BrandMover", icon: "📢" },
  ];

  // Filter out BrandMover tab if not owned from marketplace
  const tabs = allTabs.filter((t) => t.id !== "brandmover" || hasBrandMover);

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HBAR</h1>
          <p className="text-sm text-muted-foreground">On-chain task board, agent registry &amp; treasury on Hedera</p>
        </div>
        <div className="flex items-center gap-2">
          {swarm.lastRefresh && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {swarm.lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={swarm.refetch}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Loading / Error */}
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
          {/* ═══════════ OVERVIEW TAB ═══════════ */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Tasks", value: swarm.totalTasks, color: "text-emerald-500", isNum: true },
                  { label: "Active Agents", value: stats.activeAgents, color: "text-amber-500", isNum: true },
                  { label: "Treasury", value: fmtCurrency(stats.totalPnl, 2), color: "text-emerald-400", isNum: false },
                  { label: "Win Rate", value: `${stats.winRate}%`, color: "text-blue-500", isNum: false },
                ].map((stat) => (
                  <SpotlightCard key={stat.label} className="p-4" spotlightColor="rgba(16, 185, 129, 0.08)">
                    <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                    <p className={cn("text-xl font-bold truncate", stat.color)}>
                      {stat.isNum ? <CountUp to={stat.value as number} duration={1.5} /> : stat.value}
                    </p>
                  </SpotlightCard>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="grid sm:grid-cols-3 gap-3">
                <Card className="cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors" onClick={() => { setTab("tasks"); setPostOpen(true); }}>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl mb-2">📋</p>
                    <p className="text-sm font-medium">Post Onchain Task</p>
                    <p className="text-xs text-muted-foreground mt-1">Create a task with {currencySymbol} budget</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition-colors" onClick={() => { setTab("agents"); setRegisterOpen(true); }}>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl mb-2">🤖</p>
                    <p className="text-sm font-medium">Register Agent</p>
                    <p className="text-xs text-muted-foreground mt-1">Add agent to onchain registry</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors" onClick={() => setTab("treasury")}>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl mb-2">🏦</p>
                    <p className="text-sm font-medium">View Treasury</p>
                    <p className="text-xs text-muted-foreground mt-1">P&amp;L and agent performance</p>
                  </CardContent>
                </Card>
              </div>

              {/* Recent tasks preview */}
              {onchainOpen.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold mb-3">Recent Open Tasks</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {onchainOpen.slice(0, 3).map((task) => (
                      <OnchainTaskCard key={task.taskId} task={task} currencySymbol={currencySymbol} onClick={() => { setSelectedTask(task); setDetailOpen(true); }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TASKS TAB ═══════════ */}
          {tab === "tasks" && (
            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={() => setPostOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  + Post Onchain Task
                </Button>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Open", value: onchainOpen.length, color: "text-emerald-500", isNum: true },
                  { label: "In Progress", value: onchainClaimed.length, color: "text-amber-500", isNum: true },
                  { label: "Completed", value: onchainCompleted.length, color: "text-blue-500", isNum: true },
                  { label: "Total Budget", value: fmtCurrency(totalBudget, 2), color: "text-emerald-400", isNum: false },
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
                        <span>Browse open tasks below. Each has {currencySymbol} escrowed in the smart contract.</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="font-mono text-emerald-500 font-bold shrink-0">2.</span>
                        <span>Call <code className="bg-muted px-1 rounded text-[11px]">claimTask(taskId)</code> with your connected wallet.</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="font-mono text-emerald-500 font-bold shrink-0">3.</span>
                        <span>Submit delivery via <code className="bg-muted px-1 rounded text-[11px]">submitDelivery(taskId, hash)</code>. Payout on approval.</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3 font-mono truncate">
                      Contract: {CONTRACTS.TASK_BOARD}
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
                        <OnchainTaskCard key={task.taskId} task={task} currencySymbol={currencySymbol} onClick={() => { setSelectedTask(task); setDetailOpen(true); }} />
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

              {/* Registered Agents (from tasks tab) */}
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
            </div>
          )}

          {/* ═══════════ AGENTS TAB ═══════════ */}
          {tab === "agents" && (
            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={() => setRegisterOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  + Register Agent Onchain
                </Button>
              </div>

              {swarm.agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="text-5xl mb-4">🤖</div>
                  <h2 className="text-lg font-semibold mb-1">No onchain agents</h2>
                  <p className="text-sm text-muted-foreground mb-4">Register an agent on the Hedera AgentRegistry contract</p>
                  <Button onClick={() => setRegisterOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    Register First Agent
                  </Button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {swarm.agents.map((agent) => (
                    <OnchainAgentCard key={agent.agentAddress} agent={agent} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TREASURY TAB ═══════════ */}
          {tab === "treasury" && (
            <div className="space-y-6">
              {/* Overview Stats */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title={`Treasury ${currencySymbol}`} value={fmtCurrency(stats.totalPnl, 2)} icon="💰" />
                <StatCard title="Win Rate" value={`${stats.winRate}%`} icon="🎯" />
                <StatCard title="Total Tasks" value={stats.totalTasks.toLocaleString()} icon="📈" />
                <StatCard title="Active Agents" value={String(stats.activeAgents)} icon="🤖" />
              </div>

              {/* Agent Performance + Leaderboard */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <SpotlightCard className="p-0 overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
                    <CardHeader>
                      <CardTitle className="text-lg">🤖 Agent Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      {agentPerfData.length > 0 ? (
                        <PerformanceTable
                          data={agentPerfData}
                          columns={agentColumns}
                          defaultSortKey="pnl"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">No agent data available</p>
                      )}
                    </CardContent>
                  </SpotlightCard>
                </div>
                <Leaderboard agents={agentPerfData} currency={currencySymbol} />
              </div>

              {/* Treasury Breakdown */}
              <SpotlightCard className="p-0 overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
                <CardHeader>
                  <CardTitle className="text-lg">📊 Treasury Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {marketData.map((m) => (
                      <div
                        key={m.category}
                        className="border rounded-lg p-4 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">{m.icon}</span>
                          <span className="font-semibold">{m.label}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          {m.totalTasks > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tasks</span>
                              <span className="font-medium">{m.totalTasks}</span>
                            </div>
                          )}
                          {m.winRate > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Win Rate</span>
                              <span className="font-medium">{m.winRate}%</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Balance</span>
                            <span className={cn("font-semibold", m.totalPnl >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-500")}>
                              {m.totalPnl >= 0 ? "+" : "-"}
                              {fmtCurrency(Math.abs(m.totalPnl), 2)}
                            </span>
                          </div>
                          {m.winRate > 0 && (
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-amber-600 rounded-full"
                                style={{ width: `${m.winRate}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </SpotlightCard>
            </div>
          )}

          {/* ═══════════ EXPLORER TAB ═══════════ */}
          {tab === "explorer" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Smart Contracts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: "Task Board", address: CONTRACTS.TASK_BOARD },
                    { label: "Agent Registry", address: CONTRACTS.AGENT_REGISTRY },
                    { label: "Brand Vault", address: CONTRACTS.BRAND_VAULT },
                    { label: "Agent Treasury", address: CONTRACTS.AGENT_TREASURY },
                  ].map((c) => (
                    <div key={c.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="text-xs font-mono text-muted-foreground break-all">{c.address}</p>
                      </div>
                      <a
                        href={explorerContract(c.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-600 hover:text-emerald-500 underline-offset-2 hover:underline shrink-0 ml-3"
                      >
                        View on HashScan
                      </a>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Network Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Network</span>
                      <p className="font-medium">Hedera Testnet</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Currency</span>
                      <p className="font-medium">{currencySymbol}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Block Explorer</span>
                      <a href="https://hashscan.io/testnet" target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-600 hover:underline block">
                        hashscan.io/testnet
                      </a>
                    </div>
                    <div>
                      <span className="text-muted-foreground">RPC</span>
                      <p className="font-medium font-mono text-xs">https://testnet.hashio.io/api</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ BRANDMOVER TAB ═══════════ */}
          {tab === "brandmover" && (
            <div className="space-y-6">
              {/* BrandMover Header */}
              <div className="flex items-center gap-3">
                <span className="text-3xl">📢</span>
                <div>
                  <h2 className="text-xl font-bold">BrandMover</h2>
                  <p className="text-sm text-muted-foreground">Autonomous AI CMO — encrypted brand vault, campaigns, HSS remarketing</p>
                </div>
                <Badge variant="outline" className="ml-auto bg-emerald-500/10 border-emerald-500/20 text-emerald-400">Live on Hedera Testnet</Badge>
              </div>

              {/* Architecture Overview */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">🔐 Brand Vault</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">AES-256-CBC encrypted brand guidelines stored on-chain. Agent access control with time-locked delegation.</p>
                    <code className="text-[10px] font-mono text-muted-foreground/70 block break-all">0x2254185AB8B6AC995F97C769a414A0281B42853b</code>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">📢 Campaign Engine</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">Generate campaigns across 7 platforms — Twitter, LinkedIn, Discord, Instagram, YouTube, Email, PR. Content hashed on-chain.</p>
                    <div className="flex flex-wrap gap-1">
                      {["twitter", "linkedin", "discord", "instagram", "youtube", "email", "pr"].map(p => (
                        <Badge key={p} variant="outline" className="text-[9px] px-1.5 py-0">{p}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">⏰ HSS Scheduler</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">Auto-schedule remarketing via Hedera Schedule Service (0x16b). Truly autonomous — no bots or keepers needed.</p>
                    <Badge variant="outline" className="text-[9px] bg-amber-500/10 border-amber-500/20 text-amber-400">HIP-1215</Badge>
                  </CardContent>
                </Card>
              </div>

              {/* Campaign Pricing */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Campaign Pricing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { tier: "Full Campaign", price: "100 HBAR", platforms: "All 7 platforms", desc: "PR, social, video, email" },
                      { tier: "Social Only", price: "40 HBAR", platforms: "Social platforms", desc: "Twitter, LinkedIn, Discord, Instagram" },
                      { tier: "Single Platform", price: "15 HBAR", platforms: "1 platform", desc: "Any single channel" },
                    ].map(t => (
                      <div key={t.tier} className="p-4 rounded-lg border border-border hover:border-emerald-500/50 transition-colors">
                        <div className="font-semibold text-sm">{t.tier}</div>
                        <div className="text-2xl font-bold text-emerald-400 my-1">{t.price}</div>
                        <div className="text-xs text-muted-foreground">{t.platforms}</div>
                        <div className="text-xs text-muted-foreground/60 mt-1">{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Treasury Auto-Split */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Agent Treasury Auto-Split</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">All incoming payments auto-split on receive(). Trading agents earn, brand agents spend.</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                      <div className="text-xs text-muted-foreground">Reserve</div>
                      <div className="text-xl font-bold text-emerald-400">80%</div>
                      <div className="text-[10px] text-muted-foreground/60">Worker payments, escrow</div>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <div className="text-xs text-muted-foreground">Compute</div>
                      <div className="text-xl font-bold text-blue-400">10%</div>
                      <div className="text-[10px] text-muted-foreground/60">Claude API costs</div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <div className="text-xs text-muted-foreground">Growth</div>
                      <div className="text-xl font-bold text-amber-400">10%</div>
                      <div className="text-[10px] text-muted-foreground/60">Self-marketing campaigns</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Task Delegation Flow */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Task Delegation Flow</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { step: "1", label: "Post Task", desc: "Brand agent posts task to SwarmTaskBoard with HBAR escrow" },
                      { step: "2", label: "Grant Access", desc: "Time-locked encrypted guidelines shared with worker via grantTaskAccess()" },
                      { step: "3", label: "Claim & Work", desc: "Worker claims task, receives re-encrypted guidelines subset" },
                      { step: "4", label: "Submit Proof", desc: "Worker submits delivery hash (SHA-256) as proof of completion" },
                      { step: "5", label: "Approve & Pay", desc: "Creator approves — escrow released to worker, registry stats updated" },
                    ].map(s => (
                      <div key={s.step} className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0">{s.step}</div>
                        <div>
                          <div className="font-semibold text-sm">{s.label}</div>
                          <div className="text-xs text-muted-foreground">{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* BrandMover Contracts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">BrandMover Contracts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "BrandVault", address: "0x2254185AB8B6AC995F97C769a414A0281B42853b", desc: "Encrypted guidelines, campaigns, HSS scheduling" },
                    { label: "BrandRegistry", address: "0x76c00C56A60F0a92ED899246Af76c65D835A8EAA", desc: "All vault deployments, aggregate revenue" },
                    { label: "AgentTreasury", address: "0x1AC9C959459ED904899a1d52f493e9e4A879a9f4", desc: "Auto-split 80/10/10 treasury" },
                    { label: "SwarmTaskBoard", address: "0x00CBBA3bb2Bd5B860b2D17660F801eA5a2e9a8c9", desc: "HBAR-escrowed task marketplace" },
                    { label: "SwarmAgentRegistry", address: "0x557Ac244E4D73910C89631937699cDb44Fb04cc6", desc: "Worker registration, stats tracking" },
                  ].map(c => (
                    <div key={c.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="text-[10px] text-muted-foreground mb-0.5">{c.desc}</p>
                        <p className="text-xs font-mono text-muted-foreground/70 break-all">{c.address}</p>
                      </div>
                      <a
                        href={`https://hashscan.io/testnet/contract/${c.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-600 hover:text-emerald-500 underline-offset-2 hover:underline shrink-0 ml-3"
                      >
                        HashScan
                      </a>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* GitHub Link */}
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-semibold text-sm">Source Code</p>
                    <p className="text-xs text-muted-foreground">5 contracts, 11 agent scripts, 9 dashboard panels</p>
                  </div>
                  <a
                    href="https://github.com/The-Swarm-Protocol/brandmover"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-emerald-600 hover:text-emerald-500 underline-offset-2 hover:underline"
                  >
                    github.com/The-Swarm-Protocol/brandmover →
                  </a>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ ORGS TAB ═══════════ */}
          {tab === "orgs" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">HCS-Backed Organizations</h2>
                  <p className="text-sm text-muted-foreground">Create organizations with immutable ownership proof on Hedera HCS + tradeable ERC20 shares</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {/* TODO: Open create org dialog */}}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  + Create Organization
                </Button>
              </div>

              {/* Coming soon placeholder */}
              <Card>
                <CardContent className="py-16 text-center">
                  <p className="text-4xl mb-4">🏢</p>
                  <p className="text-lg font-semibold mb-2">HCS Organization Creation</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Create organizations with cryptographically signed ownership proofs submitted to Hedera Consensus Service,
                    plus ERC20 share tokens for tradeable equity.
                  </p>
                  <div className="mt-6 grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
                    <div className="p-4 rounded-lg border border-border">
                      <p className="text-sm font-medium mb-1">🔐 Immutable Proof</p>
                      <p className="text-xs text-muted-foreground">Ownership records on HCS with dual-signature transfers</p>
                    </div>
                    <div className="p-4 rounded-lg border border-border">
                      <p className="text-sm font-medium mb-1">💎 ERC20 Shares</p>
                      <p className="text-xs text-muted-foreground">Native Hedera tokens tradeable on DEXs</p>
                    </div>
                    <div className="p-4 rounded-lg border border-border">
                      <p className="text-sm font-medium mb-1">📊 Full Audit Trail</p>
                      <p className="text-xs text-muted-foreground">Query complete ownership history from HCS</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-6">UI Coming Soon</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ MEMORY TAB ═══════════ */}
          {tab === "memory" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Agent Memory (HCS)</h2>
                <p className="text-sm text-muted-foreground">Private encrypted memories stored on Hedera Consensus Service, reconnectable with ASN</p>
              </div>

              {/* Status banner */}
              {memStatus && (
                <div className={cn(
                  "px-4 py-3 rounded-lg text-sm border",
                  memStatus.type === "success"
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                )}>
                  {memStatus.type === "success" ? "✅ " : "❌ "}{memStatus.message}
                </div>
              )}

              {/* Feature overview cards */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border border-border">
                  <p className="text-sm font-medium mb-1">🔒 AES-256-GCM</p>
                  <p className="text-xs text-muted-foreground">End-to-end encryption with ASN-derived keys</p>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <p className="text-sm font-medium mb-1">⚡ Real-time</p>
                  <p className="text-xs text-muted-foreground">3-5s finality, $0.0001 per memory</p>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <p className="text-sm font-medium mb-1">🔄 Reconnectable</p>
                  <p className="text-xs text-muted-foreground">Agent memories persist across chains and sessions</p>
                </div>
              </div>

              {/* Step 1: Create Memory Topic */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Step 1 — Create Private Memory Topic</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Each agent gets a private HCS topic for storing encrypted memories. The topic is linked to the agent&apos;s ASN for decryption.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Agent ID</label>
                      <Input
                        placeholder="e.g. agent-abc123"
                        value={memAgentId}
                        onChange={(e) => setMemAgentId(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">ASN (Agent Social Number)</label>
                      <Input
                        placeholder="e.g. ASN-SWM-2025-A1B2-C3D4-XY"
                        value={memASN}
                        onChange={(e) => setMemASN(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleCreateMemoryTopic} disabled={memLoading || !memAgentId || !memASN} size="sm">
                      {memLoading ? "Creating..." : "Create HCS Topic"}
                    </Button>
                    {memTopicId && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-xs">{memTopicId}</Badge>
                        {memHashscanUrl && (
                          <a href={memHashscanUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                            View on HashScan
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {memTopicId && (
                    <div className="text-xs text-muted-foreground">
                      Or enter an existing topic:
                      <Input
                        className="mt-1"
                        placeholder="0.0.XXXXX"
                        value={memTopicId}
                        onChange={(e) => setMemTopicId(e.target.value)}
                      />
                    </div>
                  )}
                  {!memTopicId && (
                    <div className="text-xs text-muted-foreground">
                      Already have a topic? Enter it directly:
                      <Input
                        className="mt-1"
                        placeholder="0.0.XXXXX"
                        value={memTopicId}
                        onChange={(e) => setMemTopicId(e.target.value)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Step 2: Post Memory */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Step 2 — Post Encrypted Memory</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Post an encrypted message to the agent&apos;s private HCS topic. Content is encrypted with AES-256-GCM using the ASN-derived key before submission.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Topic ID</label>
                      <Input
                        placeholder="0.0.XXXXX"
                        value={memTopicId}
                        onChange={(e) => setMemTopicId(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Memory Type</label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={memType}
                        onChange={(e) => setMemType(e.target.value as typeof memType)}
                      >
                        <option value="conversation">Conversation</option>
                        <option value="context">Context</option>
                        <option value="skill_learned">Skill Learned</option>
                        <option value="preference">Preference</option>
                        <option value="snapshot">Snapshot</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Memory Content</label>
                    <Textarea
                      placeholder="Enter memory content to encrypt and store on Hedera..."
                      value={memContent}
                      onChange={(e) => setMemContent(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button onClick={handlePostMemory} disabled={memLoading || !memTopicId || !memASN || !memContent} size="sm">
                    {memLoading ? "Encrypting & Posting..." : "Post Encrypted Memory"}
                  </Button>
                </CardContent>
              </Card>

              {/* Step 3: Retrieve Memories */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Step 3 — Retrieve & Decrypt Memories</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Retrieve all encrypted memories from the HCS topic and decrypt them using the ASN. Only the agent with the correct ASN can read their memories.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleRetrieveMemories} disabled={memLoading || !memTopicId || !memASN} size="sm">
                      {memLoading ? "Retrieving..." : "Retrieve Memories"}
                    </Button>
                    {memTotalCount > 0 && (
                      <span className="text-sm text-muted-foreground">{memTotalCount} memories found</span>
                    )}
                  </div>

                  {/* Breakdown stats */}
                  {Object.keys(memBreakdown).length > 0 && (
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(memBreakdown).map(([type, count]) => (
                        <div key={type} className="text-center p-2 rounded-lg border border-border">
                          <p className="text-lg font-bold">{count}</p>
                          <p className="text-[10px] text-muted-foreground">{type.replace("_", " ")}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Memory list */}
                  {memMemories.length > 0 && (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {memMemories.map((m, i) => (
                        <div key={i} className="p-3 rounded-lg border border-border bg-muted/30">
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-[10px]">{m.type}</Badge>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {m.sequenceNumber && <span>Seq #{m.sequenceNumber}</span>}
                              {m.consensusTimestamp && (
                                <span>{new Date(m.consensusTimestamp).toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm break-words">{m.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Architecture diagram */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Multi-Chain Memory Architecture</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <span className="text-2xl">⚡</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Hedera HCS (Real-time)</p>
                      <p className="text-xs text-muted-foreground">Active memories, 3-5s finality, private encrypted topics</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <span className="text-2xl">💾</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Storacha (Backup)</p>
                      <p className="text-xs text-muted-foreground">Decentralized backup layer with CID indexing</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                    <span className="text-2xl">🗄️</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-400">Filecoin (Archival)</p>
                      <p className="text-xs text-muted-foreground">100+ year persistence via MemoryVault Pro NFT access</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ METRICS TAB ═══════════ */}
          {tab === "metrics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Hedera Metrics Dashboard</h2>
                <p className="text-sm text-muted-foreground">Real-time usage statistics and cost comparisons</p>
              </div>

              {/* Coming soon placeholder */}
              <Card>
                <CardContent className="py-16 text-center">
                  <p className="text-4xl mb-4">📈</p>
                  <p className="text-lg font-semibold mb-2">Hedera Usage Metrics</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Comprehensive dashboard showing organizations created, shares issued, memories stored, and cost savings vs Ethereum.
                  </p>
                  <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
                    {[
                      { label: "Organizations Created", icon: "🏢", desc: "HCS-backed orgs" },
                      { label: "Shares Issued", icon: "💎", desc: "Total ERC20 supply" },
                      { label: "Memories Stored", icon: "🧠", desc: "HCS messages" },
                      { label: "Cost Savings", icon: "💰", desc: "vs Ethereum" },
                    ].map((metric) => (
                      <div key={metric.label} className="p-4 rounded-lg border border-border text-left">
                        <p className="text-2xl mb-2">{metric.icon}</p>
                        <p className="text-sm font-medium mb-1">{metric.label}</p>
                        <p className="text-xs text-muted-foreground">{metric.desc}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-6">UI Coming Soon</p>
                </CardContent>
              </Card>

              {/* Cost comparison */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Hedera vs Ethereum Cost Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { action: "Post HCS Message (Memory)", hedera: "$0.0001", ethereum: "$2-5", savings: "99.98%" },
                      { action: "Create Token (Org Shares)", hedera: "$1", ethereum: "$50-200", savings: "98-99%" },
                      { action: "Token Transfer", hedera: "$0.001", ethereum: "$3-10", savings: "99.97%" },
                      { action: "Smart Contract Call", hedera: "$0.05", ethereum: "$10-50", savings: "99.5%" },
                    ].map((row) => (
                      <div key={row.action} className="grid grid-cols-4 gap-4 items-center py-2 border-b border-border last:border-0">
                        <p className="text-sm font-medium col-span-2">{row.action}</p>
                        <div className="text-right">
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{row.hedera}</p>
                          <p className="text-xs text-muted-foreground line-through">{row.ethereum}</p>
                        </div>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 text-right">↓ {row.savings}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ═══════════ DIALOGS ═══════════ */}

      {/* Task Detail */}
      {selectedTask && (
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2 leading-snug">
                <span className="text-xs font-mono text-muted-foreground shrink-0 pt-0.5">#{selectedTask.taskId}</span>
                <span className="min-w-0 break-words">{selectedTask.title}</span>
                <Badge className={cn("text-xs shrink-0", STATUS_CONFIG[selectedTask.status]?.bg, STATUS_CONFIG[selectedTask.status]?.color)}>
                  {STATUS_CONFIG[selectedTask.status]?.label}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {selectedTask.description || "No description provided"}
              </p>

              <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  💰 Budget: {fmtCurrency(selectedTask.budget, 2)}
                </span>
              </div>

              {selectedTask.requiredSkills && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1.5">Required Skills</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean).map((skill) => (
                      <Badge key={skill} variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 text-xs">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Posted by</span>
                  <p className="font-medium font-mono text-xs truncate">{shortAddr(selectedTask.poster)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Deadline</span>
                  <p className="font-medium text-xs">
                    {new Date(selectedTask.deadline * 1000).toLocaleDateString()}
                    <span className="text-muted-foreground ml-1">({timeRemaining(selectedTask.deadline)})</span>
                  </p>
                </div>
                {selectedTask.claimedBy && selectedTask.claimedBy !== "0x0000000000000000000000000000000000000000" && (
                  <div>
                    <span className="text-xs text-muted-foreground">Claimed by</span>
                    <p className="font-medium font-mono text-xs truncate">{shortAddr(selectedTask.claimedBy)}</p>
                  </div>
                )}
                {selectedTask.createdAt > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Created</span>
                    <p className="font-medium text-xs">{new Date(selectedTask.createdAt * 1000).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {selectedTask.deliveryHash && selectedTask.deliveryHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Delivery Hash</span>
                  <p className="font-mono text-[11px] break-all bg-muted rounded p-2">{selectedTask.deliveryHash}</p>
                </div>
              )}

              {selectedTask.status === TaskStatus.Open && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 space-y-3">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Claim this task to start working on it</p>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={swarmWrite.state.isLoading || !account}
                    onClick={async () => {
                      const hash = await swarmWrite.claimTask(selectedTask.taskId);
                      if (hash) {
                        setDetailOpen(false);
                        swarm.refetch();
                      }
                    }}
                  >
                    {swarmWrite.state.isLoading ? "Claiming..." : `Claim Task #${selectedTask.taskId}`}
                  </Button>
                  {!account && !authAddress && <p className="text-[10px] text-muted-foreground">Connect your wallet to claim</p>}
                  {swarmWrite.state.error && <p className="text-[10px] text-red-500">{swarmWrite.state.error}</p>}
                </div>
              )}

              {selectedTask.status === TaskStatus.Claimed && selectedTask.claimedBy?.toLowerCase() === account?.address?.toLowerCase() && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Submit your delivery hash</p>
                  <Input
                    placeholder="Paste your output text to hash, or a 0x... hash"
                    value={deliveryInput}
                    onChange={(e) => setDeliveryInput(e.target.value)}
                    className="text-xs"
                  />
                  <Button
                    className="w-full bg-amber-600 hover:bg-amber-700 text-black"
                    disabled={swarmWrite.state.isLoading || !deliveryInput.trim()}
                    onClick={async () => {
                      let hash = deliveryInput.trim();
                      if (!hash.startsWith("0x")) {
                        hash = ethers.keccak256(ethers.toUtf8Bytes(hash));
                      }
                      const txHash = await swarmWrite.submitDelivery(selectedTask.taskId, hash);
                      if (txHash) {
                        setDeliveryInput("");
                        setDetailOpen(false);
                        swarm.refetch();
                      }
                    }}
                  >
                    {swarmWrite.state.isLoading ? "Submitting..." : "Submit Delivery"}
                  </Button>
                  {swarmWrite.state.error && <p className="text-[10px] text-red-500">{swarmWrite.state.error}</p>}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Post Onchain Task */}
      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post Onchain Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              This posts a task to the Hedera Testnet SwarmTaskBoard. Budget is escrowed in {currencySymbol}.
            </p>
            <div>
              <label className="text-xs font-medium mb-1 block">Title <span className="text-red-500">*</span></label>
              <Input placeholder="Task title" value={ocTitle} onChange={(e) => setOcTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Description</label>
              <Textarea placeholder="What needs to be done..." value={ocDesc} onChange={(e) => setOcDesc(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Required Skills</label>
              <Input placeholder="e.g. Research, Trading, Analytics" value={ocSkills} onChange={(e) => setOcSkills(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Budget ({currencySymbol}) <span className="text-red-500">*</span></label>
                <Input type="number" placeholder={`Min. 100 ${currencySymbol}`} value={ocBudget} onChange={(e) => setOcBudget(e.target.value)} min="100" step="1" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Minimum 100 {currencySymbol} required by contract</p>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Deadline (days)</label>
                <Input type="number" placeholder="7" value={ocDeadlineDays} onChange={(e) => setOcDeadlineDays(e.target.value)} min="1" />
              </div>
            </div>
            {swarmWrite.state.error && (
              <p className="text-xs text-red-500">{swarmWrite.state.error}</p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setPostOpen(false)} disabled={swarmWrite.state.isLoading}>Cancel</Button>
              <Button
                onClick={async () => {
                  if (!ocTitle.trim() || !ocBudget.trim()) return;
                  const deadlineUnix = Math.floor(Date.now() / 1000) + (parseInt(ocDeadlineDays) || 7) * 86400;
                  const hash = await swarmWrite.postTask(
                    CONTRACTS.BRAND_VAULT,
                    ocTitle.trim(),
                    ocDesc.trim(),
                    ocSkills.trim(),
                    deadlineUnix,
                    ocBudget.trim(),
                  );
                  if (hash) {
                    setOcTitle(""); setOcDesc(""); setOcSkills(""); setOcBudget(""); setOcDeadlineDays("7");
                    setPostOpen(false);
                    swarm.refetch();
                  }
                }}
                disabled={swarmWrite.state.isLoading || !ocTitle.trim() || !ocBudget.trim() || !account}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {swarmWrite.state.isLoading ? "Posting..." : `Post Task (${ocBudget || "0"} ${currencySymbol})`}
              </Button>
            </div>
            {!account && !authAddress && <p className="text-[10px] text-muted-foreground text-center">Connect your wallet to post onchain tasks</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Register Agent Onchain — pick from fleet */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Agent Onchain</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Select one of your fleet agents to register on the Hedera SwarmAgentRegistry contract.
            </p>

            {fleetAgents.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-2">No agents in your fleet yet</p>
                <p className="text-xs text-muted-foreground">Register agents on the <a href="/agents" className="text-emerald-500 underline underline-offset-2">Fleet page</a> first</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium mb-1 block">Select Agent <span className="text-red-500">*</span></label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                  >
                    <option value="">Choose an agent...</option>
                    {fleetAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.type}) {a.status === "online" ? " — online" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedFleetAgent && (
                  <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full shrink-0", selectedFleetAgent.status === "online" ? "bg-emerald-400" : "bg-gray-400")} />
                      <span className="text-sm font-medium">{selectedFleetAgent.name}</span>
                      <Badge variant="outline" className="text-[10px]">{selectedFleetAgent.type}</Badge>
                    </div>
                    {selectedAgentSkills && (
                      <p className="text-xs text-muted-foreground">Skills: {selectedAgentSkills}</p>
                    )}
                    {selectedFleetAgent.asn && (
                      <p className="text-xs text-muted-foreground font-mono">ASN: {selectedFleetAgent.asn}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium mb-1 block">Fee Rate (basis points)</label>
                  <Input
                    type="number"
                    placeholder="500 = 5%"
                    value={ocAgentFeeRate}
                    onChange={(e) => setOcAgentFeeRate(e.target.value)}
                    min="0"
                    max="10000"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">500 bps = 5% fee on completed tasks</p>
                </div>

                {swarmWrite.state.error && (
                  <p className="text-xs text-red-500">{swarmWrite.state.error}</p>
                )}
                {swarmWrite.state.txHash && (
                  <p className="text-xs text-emerald-500">Registered! Tx: {swarmWrite.state.txHash.slice(0, 16)}...</p>
                )}
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setRegisterOpen(false)} disabled={swarmWrite.state.isLoading}>Cancel</Button>
                  <Button
                    onClick={async () => {
                      if (!selectedFleetAgent) return;
                      const hash = await swarmWrite.registerAgent(
                        selectedFleetAgent.name,
                        selectedAgentSkills,
                        parseInt(ocAgentFeeRate) || 500,
                      );
                      if (hash) {
                        setSelectedAgentId("");
                        setOcAgentFeeRate("500");
                        swarm.refetch();
                      }
                    }}
                    disabled={swarmWrite.state.isLoading || !selectedFleetAgent || !account}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {swarmWrite.state.isLoading ? "Registering..." : `Register ${selectedFleetAgent?.name || "Agent"} Onchain`}
                  </Button>
                </div>
                {!account && !authAddress && <p className="text-[10px] text-muted-foreground text-center">Connect your wallet to register onchain</p>}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Onchain Card Components
// ═══════════════════════════════════════════════════════════════

function OnchainTaskCard({ task, onClick, currencySymbol = "HBAR" }: { task: TaskListing; onClick: () => void; currencySymbol?: string }) {
  const status = STATUS_CONFIG[task.status] ?? STATUS_CONFIG[TaskStatus.Open];
  const skills = (task.requiredSkills || "").split(",").map((s) => s.trim()).filter(Boolean);
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
            <p className="text-[10px] text-muted-foreground">{currencySymbol}</p>
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
          <span className="truncate">By {shortAddr(task.poster)}</span>
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
  const skills = (agent.skills || "").split(",").map((s) => s.trim()).filter(Boolean);

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
          <span>Fee: {agent.feeRate} bps</span>
          <span className={agent.active ? "text-emerald-500" : "text-gray-500"}>{agent.active ? "Active" : "Inactive"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
