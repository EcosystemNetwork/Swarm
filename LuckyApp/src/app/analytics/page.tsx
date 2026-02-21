"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";

const agentColumns = [
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
    render: (a: AgentPerformance) => <PnlDisplay value={a.pnl} />,
  },
  {
    key: "predictions",
    label: "Predictions",
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
        <span className={cn("text-sm font-medium", isWin ? "text-amber-600" : "text-red-500")}>
          {isWin ? `🔥 ${a.streak}W` : `${Math.abs(a.streak)}L`}
        </span>
      );
    },
  },
];

const swarmColumns = [
  {
    key: "name",
    label: "Project",
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
    render: (s: SwarmPerformance) => <PnlDisplay value={s.totalPnl} />,
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
];

export default function AnalyticsPage() {
  const stats = mockOverviewStats;

  return (
    <div className="space-y-6">
      <div>
        <BlurText text="Analytics" className="text-3xl font-bold tracking-tight" delay={80} animateBy="letters" />
        <p className="text-muted-foreground mt-1">Performance metrics and leaderboards</p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total P&L"
          value={`$${stats.totalPnl.toLocaleString()}`}
          icon="💰"
          change={stats.pnlChange}
          changeLabel="vs last month"
        />
        <StatCard
          title="Win Rate"
          value={`${stats.winRate}%`}
          icon="🎯"
          change={stats.winRateChange}
          changeLabel="vs last month"
        />
        <StatCard
          title="Total Predictions"
          value={stats.totalPredictions.toLocaleString()}
          icon="📈"
          change={stats.predictionsChange}
          changeLabel="vs last month"
        />
        <StatCard
          title="Active Agents"
          value={String(stats.activeAgents)}
          icon="🤖"
          change={stats.agentsChange}
          changeLabel="vs last month"
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
              <PerformanceTable
                data={mockAgentPerformance}
                columns={agentColumns}
                defaultSortKey="pnl"
              />
            </CardContent>
          </SpotlightCard>
        </div>
        <Leaderboard />
      </div>

      {/* Swarm Performance */}
      <SpotlightCard className="p-0" spotlightColor="rgba(255, 191, 0, 0.06)">
        <CardHeader>
          <CardTitle className="text-lg">📁 Project Performance</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PerformanceTable
            data={mockSwarmPerformance}
            columns={swarmColumns}
            defaultSortKey="totalPnl"
          />
        </CardContent>
      </SpotlightCard>

      {/* Market Breakdown */}
      <SpotlightCard className="p-0" spotlightColor="rgba(255, 191, 0, 0.06)">
        <CardHeader>
          <CardTitle className="text-lg">📊 Market Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {mockMarketBreakdown.map((m) => (
              <div
                key={m.category}
                className="border rounded-lg p-4 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{m.icon}</span>
                  <span className="font-semibold">{m.label}</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Predictions</span>
                    <span className="font-medium">{m.totalPredictions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Win Rate</span>
                    <span className="font-medium">{m.winRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">P&L</span>
                    <span className={cn("font-semibold", m.totalPnl >= 0 ? "text-amber-600" : "text-red-500")}>
                      {m.totalPnl >= 0 ? "+" : ""}${Math.abs(m.totalPnl).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-amber-600 rounded-full"
                      style={{ width: `${m.winRate}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </SpotlightCard>
    </div>
  );
}
