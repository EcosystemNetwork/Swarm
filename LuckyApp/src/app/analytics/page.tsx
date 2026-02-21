"use client";

import { useState, useMemo } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/analytics/stat-card";
import { PerformanceTable, PnlDisplay, WinRateBar } from "@/components/analytics/performance-table";
import { Leaderboard } from "@/components/leaderboard";
import {
  mockOverviewStats,
  mockAgentPerformance,
  mockSwarmPerformance,
  mockMarketBreakdown,
  type AgentPerformance,
  type SwarmPerformance,
  type MarketBreakdown,
  type OverviewStats,
} from "@/lib/mock-data";
import { useSwarmData } from "@/hooks/useSwarmData";
import { TaskStatus } from "@/lib/swarm-contracts";
import { cn } from "@/lib/utils";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";

// ─── Page ────────────────────────────────────────────────

type AnalyticsView = "simulated" | "live";

export default function AnalyticsPage() {
  const [view, setView] = useState<AnalyticsView>("simulated");
  const swarm = useSwarmData();
  const currency = view === "live" ? "HBAR" : "$";

  // ── Compute live data from on-chain ──

  const liveOverview = useMemo<OverviewStats>(() => {
    const completed = swarm.tasks.filter((t) => t.status === TaskStatus.Completed).length;
    const expired = swarm.tasks.filter((t) => t.status === TaskStatus.Expired).length;
    const disputed = swarm.tasks.filter((t) => t.status === TaskStatus.Disputed).length;
    const resolved = completed + expired + disputed;
    const winRate = resolved > 0 ? (completed / resolved) * 100 : 0;

    return {
      totalPnl: swarm.treasury?.totalRevenue ?? 0,
      winRate: Math.round(winRate * 10) / 10,
      totalPredictions: swarm.totalTasks,
      activeAgents: swarm.agents.filter((a) => a.active).length,
    };
  }, [swarm.tasks, swarm.treasury, swarm.totalTasks, swarm.agents]);

  const liveAgentPerf = useMemo<AgentPerformance[]>(() => {
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
      const pnl = agentTasks
        .filter((t) => t.status === TaskStatus.Completed)
        .reduce((sum, t) => sum + t.budget, 0);
      const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
      const firstSkill = agent.skills.split(",")[0]?.trim() || "Agent";

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

  const liveSwarmPerf = useMemo<SwarmPerformance[]>(() => {
    if (!swarm.treasury) return [];
    return [
      {
        swarmId: "treasury",
        name: "Agent Treasury",
        status: "active" as const,
        totalPnl: swarm.treasury.totalRevenue,
        missionsCompleted: swarm.tasks.filter((t) => t.status === TaskStatus.Completed).length,
        missionsActive: swarm.tasks.filter((t) => t.status === TaskStatus.Claimed).length,
        winRate: liveOverview.winRate,
        agentCount: swarm.agents.filter((a) => a.active).length,
      },
    ];
  }, [swarm.treasury, swarm.tasks, swarm.agents, liveOverview.winRate]);

  const liveMarketBreakdown = useMemo<MarketBreakdown[]>(() => {
    if (!swarm.treasury) return [];
    return [
      { category: "crypto" as const, label: "Total Revenue", icon: "💰", totalPredictions: swarm.totalTasks, wins: swarm.tasks.filter((t) => t.status === TaskStatus.Completed).length, losses: swarm.tasks.filter((t) => t.status === TaskStatus.Expired || t.status === TaskStatus.Disputed).length, pending: swarm.tasks.filter((t) => t.status === TaskStatus.Claimed).length, winRate: liveOverview.winRate, totalPnl: swarm.treasury.totalRevenue },
      { category: "sports" as const, label: "Compute", icon: "⚙️", totalPredictions: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalPnl: swarm.treasury.computeBalance },
      { category: "esports" as const, label: "Growth", icon: "📈", totalPredictions: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalPnl: swarm.treasury.growthBalance },
      { category: "events" as const, label: "Reserve", icon: "🏦", totalPredictions: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalPnl: swarm.treasury.reserveBalance },
    ];
  }, [swarm.treasury, swarm.totalTasks, swarm.tasks, liveOverview.winRate]);

  // ── Select data based on view ──

  const stats = view === "simulated" ? mockOverviewStats : liveOverview;
  const agentPerfData = view === "simulated" ? mockAgentPerformance : liveAgentPerf;
  const swarmPerfData = view === "simulated" ? mockSwarmPerformance : liveSwarmPerf;
  const marketData = view === "simulated" ? mockMarketBreakdown : liveMarketBreakdown;

  // ── Column definitions (need currency) ──

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
      label: "P&L",
      sortable: true,
      getValue: (a: AgentPerformance) => a.pnl,
      render: (a: AgentPerformance) => <PnlDisplay value={a.pnl} currency={currency} />,
    },
    {
      key: "predictions",
      label: view === "live" ? "Tasks" : "Predictions",
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
          <span className={cn("text-sm font-medium", isWin ? "text-amber-600" : a.streak === 0 ? "text-muted-foreground" : "text-red-500")}>
            {a.streak === 0 ? "—" : isWin ? `🔥 ${a.streak}W` : `${Math.abs(a.streak)}L`}
          </span>
        );
      },
    },
  ], [currency, view]);

  const swarmColumns = useMemo(() => [
    {
      key: "name",
      label: view === "live" ? "Treasury" : "Project",
      render: (s: SwarmPerformance) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{s.name}</span>
          <Badge className={cn(
            "text-[10px]",
            s.status === "active" ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground"
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
      render: (s: SwarmPerformance) => <PnlDisplay value={s.totalPnl} currency={currency} />,
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
  ], [currency, view]);

  // ── Format P&L value for stat card ──

  const pnlValue = currency === "HBAR"
    ? `${stats.totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HBAR`
    : `$${stats.totalPnl.toLocaleString()}`;

  // ── Render ──

  return (
    <div className="space-y-6">
      <div>
        <BlurText text="Analytics" className="text-3xl font-bold tracking-tight" delay={80} animateBy="letters" />
        <p className="text-muted-foreground mt-1">Performance metrics and leaderboards</p>
      </div>

      {/* Data Source Toggle */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setView("simulated")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            view === "simulated"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Simulated
        </button>
        <button
          onClick={() => setView("live")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            view === "live"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Live (Hedera)
          {view === "live" && swarm.lastRefresh && (
            <span className="text-[10px] text-muted-foreground ml-2">
              {swarm.lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </button>
      </div>

      {/* Loading / Error for Live */}
      {view === "live" && swarm.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading live data from Hedera Testnet...</p>
          </div>
        </div>
      ) : view === "live" && swarm.error ? (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
          {swarm.error}
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total P&L"
              value={pnlValue}
              icon="💰"
              change={stats.pnlChange}
              changeLabel={stats.pnlChange !== undefined ? "vs last month" : undefined}
            />
            <StatCard
              title="Win Rate"
              value={`${stats.winRate}%`}
              icon="🎯"
              change={stats.winRateChange}
              changeLabel={stats.winRateChange !== undefined ? "vs last month" : undefined}
            />
            <StatCard
              title={view === "live" ? "Total Tasks" : "Total Predictions"}
              value={stats.totalPredictions.toLocaleString()}
              icon="📈"
              change={stats.predictionsChange}
              changeLabel={stats.predictionsChange !== undefined ? "vs last month" : undefined}
            />
            <StatCard
              title="Active Agents"
              value={String(stats.activeAgents)}
              icon="🤖"
              change={stats.agentsChange}
              changeLabel={stats.agentsChange !== undefined ? "vs last month" : undefined}
            />
          </div>

          {/* Agent Performance + Leaderboard */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SpotlightCard className="p-0" spotlightColor="rgba(255, 191, 0, 0.06)">
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
            <Leaderboard agents={agentPerfData} currency={currency} />
          </div>

          {/* Project / Treasury Performance */}
          <SpotlightCard className="p-0" spotlightColor="rgba(255, 191, 0, 0.06)">
            <CardHeader>
              <CardTitle className="text-lg">
                {view === "live" ? "🏦 Treasury Performance" : "📁 Project Performance"}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {swarmPerfData.length > 0 ? (
                <PerformanceTable
                  data={swarmPerfData}
                  columns={swarmColumns}
                  defaultSortKey="totalPnl"
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
              )}
            </CardContent>
          </SpotlightCard>

          {/* Market / Treasury Breakdown */}
          <SpotlightCard className="p-0" spotlightColor="rgba(255, 191, 0, 0.06)">
            <CardHeader>
              <CardTitle className="text-lg">
                {view === "live" ? "📊 Treasury Breakdown" : "📊 Market Breakdown"}
              </CardTitle>
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
                      {(view === "simulated" || m.totalPredictions > 0) && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{view === "live" ? "Tasks" : "Predictions"}</span>
                          <span className="font-medium">{m.totalPredictions}</span>
                        </div>
                      )}
                      {(view === "simulated" || m.winRate > 0) && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win Rate</span>
                          <span className="font-medium">{m.winRate}%</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{view === "live" ? "Balance" : "P&L"}</span>
                        <span className={cn("font-semibold", m.totalPnl >= 0 ? "text-amber-600" : "text-red-500")}>
                          {m.totalPnl >= 0 ? "+" : "-"}
                          {currency === "HBAR"
                            ? `${Math.abs(m.totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HBAR`
                            : `$${Math.abs(m.totalPnl).toLocaleString()}`}
                        </span>
                      </div>
                      {(view === "simulated" || m.winRate > 0) && (
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
