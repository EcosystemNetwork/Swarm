import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/analytics/stat-card";
import { Leaderboard } from "@/components/leaderboard";
import { PredictionsFeed } from "@/components/predictions-feed";
import { mockMissions, mockOverviewStats, getAgentById, getSwarmById } from "@/lib/mock-data";

const recentMissions = mockMissions
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .slice(0, 5);

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

export default function DashboardPage() {
  const stats = mockOverviewStats;
  const activeMissions = mockMissions.filter(m => m.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-gray-500 mt-1">Swarm operations overview</p>
      </div>

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
          title="Active Missions"
          value={String(activeMissions)}
          icon="🎯"
          change={stats.predictionsChange}
          changeLabel="predictions in progress"
        />
        <StatCard
          title="Active Agents"
          value={String(stats.activeAgents)}
          icon="🤖"
          change={stats.agentsChange}
          changeLabel="vs last month"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Missions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">🎯 Recent Missions</CardTitle>
              <Link href="/missions" className="text-sm text-green-600 hover:underline">View all →</Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMissions.map((m) => {
                const agent = m.assigneeId ? getAgentById(m.assigneeId) : null;
                const swarm = getSwarmById(m.swarmId);
                return (
                  <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <p className="text-xs text-gray-500">
                        🐝 {swarm?.name} · 🤖 {agent?.name || "Unassigned"}
                      </p>
                    </div>
                    <Badge className={`text-[10px] ${statusColors[m.status]}`}>
                      {m.status}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Predictions Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">📈 Predictions Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <PredictionsFeed />
            </CardContent>
          </Card>
        </div>

        {/* Mini Leaderboard */}
        <div>
          <Leaderboard limit={5} compact />
        </div>
      </div>
    </div>
  );
}
