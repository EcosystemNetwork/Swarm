/** Analytics — Live on-chain performance analytics from Hedera Testnet. */
"use client";

import { useMemo } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/analytics/stat-card";
import { PerformanceTable, PnlDisplay, WinRateBar } from "@/components/analytics/performance-table";
import { Leaderboard } from "@/components/leaderboard";
import { useSwarmData } from "@/hooks/useSwarmData";
import { useChainCurrency } from "@/hooks/useChainCurrency";
import { TaskStatus } from "@/lib/swarm-contracts";
import { cn } from "@/lib/utils";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";

// ─── Types (previously from mock-data) ───────────────────

export interface AgentPerformance {
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

export interface SwarmPerformance {
  swarmId: string;
  name: string;
  status: "active" | "paused";
  totalPnl: number;
  missionsCompleted: number;
  missionsActive: number;
  winRate: number;
  agentCount: number;
}

export interface MarketBreakdown {
  category: string;
  label: string;
  icon: string;
  totalPredictions: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  totalPnl: number;
}

interface OverviewStats {
  totalPnl: number;
  winRate: number;
  totalTasks: number;
  activeAgents: number;
}

// ─── Page ────────────────────────────────────────────────

export default function AnalyticsPage() {
  const swarm = useSwarmData();
  const { symbol: currencySymbol, fmt: fmtCurrency } = useChainCurrency();

  // ── Compute live data from on-chain ──

  const stats = useMemo<OverviewStats>(() => {
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

  const swarmPerfData = useMemo<SwarmPerformance[]>(() => {
    if (!swarm.treasury) return [];
    return [
      {
        swarmId: "treasury",
        name: "Agent Treasury",
        status: "active" as const,
        totalPnl: swarm.treasury.totalRevenue,
        missionsCompleted: swarm.tasks.filter((t) => t.status === TaskStatus.Completed).length,
        missionsActive: swarm.tasks.filter((t) => t.status === TaskStatus.Claimed).length,
        winRate: stats.winRate,
        agentCount: swarm.agents.filter((a) => a.active).length,
      },
    ];
  }, [swarm.treasury, swarm.tasks, swarm.agents, stats.winRate]);

  const marketData = useMemo<MarketBreakdown[]>(() => {
    if (!swarm.treasury) return [];
    return [
      { category: "revenue", label: "Total Revenue", icon: "💰", totalPredictions: swarm.totalTasks, wins: swarm.tasks.filter((t) => t.status === TaskStatus.Completed).length, losses: swarm.tasks.filter((t) => t.status === TaskStatus.Expired || t.status === TaskStatus.Disputed).length, pending: swarm.tasks.filter((t) => t.status === TaskStatus.Claimed).length, winRate: stats.winRate, totalPnl: swarm.treasury.totalRevenue },
      { category: "compute", label: "Compute", icon: "⚙️", totalPredictions: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalPnl: swarm.treasury.computeBalance },
      { category: "growth", label: "Growth", icon: "📈", totalPredictions: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalPnl: swarm.treasury.growthBalance },
      { category: "reserve", label: "Reserve", icon: "🏦", totalPredictions: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalPnl: swarm.treasury.reserveBalance },
    ];
  }, [swarm.treasury, swarm.totalTasks, swarm.tasks, stats.winRate]);

  // ── Column definitions ──

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

  const swarmColumns = useMemo(() => [
    {
      key: "name",
      label: "Treasury",
      render: (s: SwarmPerformance) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{s.name}</span>
          <Badge className={cn(
            "text-[10px]",
            s.status === "active" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-muted text-muted-foreground"
          )}>
            {s.status}
          </Badge>
        </div>
      ),
    },
    {
      key: "totalPnl",
      label: "Total P&L",
      sortable: true,
      getValue: (s: SwarmPerformance) => s.totalPnl,
      render: (s: SwarmPerformance) => <PnlDisplay value={s.totalPnl} currency={currencySymbol} />,
    },
    {
      key: "winRate",
      label: "Win Rate",
      sortable: true,
      getValue: (s: SwarmPerformance) => s.winRate,
      render: (s: SwarmPerformance) => <WinRateBar rate={s.winRate} />,
    },
    {
      key: "missions",
      label: "Tasks",
      sortable: true,
      getValue: (s: SwarmPerformance) => s.missionsCompleted,
      render: (s: SwarmPerformance) => (
        <span className="text-sm">
          <span className="font-medium">{s.missionsCompleted}</span>
          <span className="text-muted-foreground"> done</span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="font-medium">{s.missionsActive}</span>
          <span className="text-muted-foreground"> active</span>
        </span>
      ),
    },
    {
      key: "agents",
      label: "Agents",
      sortable: true,
      getValue: (s: SwarmPerformance) => s.agentCount,
      render: (s: SwarmPerformance) => (
        <span className="text-sm">{s.agentCount} 🤖</span>
      ),
    },
  ], [currencySymbol]);

  // ── Format P&L value ──

  const pnlValue = fmtCurrency(stats.totalPnl, 2);

  // ── Render ──

  return (
    <div className="space-y-6">
      <div>
        <BlurText text="Analytics" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
        <div className="flex items-center gap-2 mt-1">
          <p className="text-muted-foreground">Live performance from Hedera Testnet</p>
          {swarm.lastRefresh && (
            <span className="text-[10px] text-muted-foreground">
              Updated {swarm.lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {swarm.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading live data from Hedera Testnet...</p>
          </div>
        </div>
      ) : swarm.error ? (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
          {swarm.error}
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={`Treasury ${currencySymbol}`}
              value={pnlValue}
              icon="💰"
            />
            <StatCard
              title="Win Rate"
              value={`${stats.winRate}%`}
              icon="🎯"
            />
            <StatCard
              title="Total Tasks"
              value={stats.totalTasks.toLocaleString()}
              icon="📈"
            />
            <StatCard
              title="Active Agents"
              value={String(stats.activeAgents)}
              icon="🤖"
            />
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

          {/* Treasury Performance */}
          <SpotlightCard className="p-0 overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
            <CardHeader>
              <CardTitle className="text-lg">🏦 Treasury Performance</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {swarmPerfData.length > 0 ? (
                <PerformanceTable
                  data={swarmPerfData}
                  columns={swarmColumns}
                  defaultSortKey="totalPnl"
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No treasury data available</p>
              )}
            </CardContent>
          </SpotlightCard>

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
                      {m.totalPredictions > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tasks</span>
                          <span className="font-medium">{m.totalPredictions}</span>
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
        </>
      )}
    </div>
  );
}
