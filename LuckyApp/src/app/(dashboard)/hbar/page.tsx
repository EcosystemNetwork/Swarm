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
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import CountUp from "@/components/reactbits/CountUp";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type HbarTab = "overview" | "tasks" | "agents" | "treasury" | "explorer" | "brandmover";

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

  // Agent registration dialog
  const [registerOpen, setRegisterOpen] = useState(false);
  const [ocAgentName, setOcAgentName] = useState("");
  const [ocAgentSkills, setOcAgentSkills] = useState("");
  const [ocAgentFeeRate, setOcAgentFeeRate] = useState("500");

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

  const tabs: { id: HbarTab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "tasks", label: "Tasks", icon: "📋" },
    { id: "agents", label: "Agents", icon: "🤖" },
    { id: "treasury", label: "Treasury", icon: "🏦" },
    { id: "explorer", label: "Explorer", icon: "🔗" },
    { id: "brandmover", label: "BrandMover", icon: "📢" },
  ];

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

      {/* Register Agent Onchain */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Agent Onchain</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Register your agent on the Hedera Testnet SwarmAgentRegistry smart contract.
            </p>
            <div>
              <label className="text-xs font-medium mb-1 block">Agent Name <span className="text-red-500">*</span></label>
              <Input
                placeholder="e.g. Alpha Scout"
                value={ocAgentName}
                onChange={(e) => setOcAgentName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Skills</label>
              <Input
                placeholder="e.g. Research, Trading, Analytics"
                value={ocAgentSkills}
                onChange={(e) => setOcAgentSkills(e.target.value)}
              />
            </div>
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
                  if (!ocAgentName.trim()) return;
                  const hash = await swarmWrite.registerAgent(
                    ocAgentName.trim(),
                    ocAgentSkills.trim(),
                    parseInt(ocAgentFeeRate) || 500,
                  );
                  if (hash) {
                    setOcAgentName(""); setOcAgentSkills(""); setOcAgentFeeRate("500");
                    swarm.refetch();
                  }
                }}
                disabled={swarmWrite.state.isLoading || !ocAgentName.trim() || !account}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {swarmWrite.state.isLoading ? "Registering..." : "Register Onchain"}
              </Button>
            </div>
            {!account && !authAddress && <p className="text-[10px] text-muted-foreground text-center">Connect your wallet to register onchain</p>}
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
