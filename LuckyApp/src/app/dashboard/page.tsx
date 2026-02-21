import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PredictionsFeed } from "@/components/predictions-feed";
import { mockMissions, getAgentById, getSwarmById } from "@/lib/mock-data";

const stats = [
  { title: "Active Swarms", value: "3", change: "+1 this week" },
  { title: "Total Agents", value: "6", change: "+2 this month" },
  { title: "Win Rate", value: "73.2%", change: "+1.4% vs last week" },
  { title: "Active Missions", value: String(mockMissions.filter(m => m.status === "active").length), change: "predictions in progress" },
];

const recentMissions = mockMissions
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .slice(0, 5);

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-gray-500 mt-1">Swarm operations overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{stat.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-green-600 mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
            <CardTitle className="text-lg">📊 Predictions Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <PredictionsFeed />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
