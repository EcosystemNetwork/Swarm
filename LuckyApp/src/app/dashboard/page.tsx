'use client';

import { useState, useEffect } from 'react';
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/analytics/stat-card";
import { useOrg } from "@/contexts/OrgContext";
import { 
  getOrgStats, 
  getTasksByOrg, 
  getProjectsByOrg,
  getAgentsByOrg,
  type Task, 
  type Project, 
  type Agent 
} from "@/lib/firestore";

interface OrgStats {
  projectCount: number;
  agentCount: number;
  taskCount: number;
  completedTasks: number;
  activeTasks: number;
  todoTasks: number;
}

const statusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800", 
  done: "bg-green-100 text-green-800",
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<(Task & { agentName?: string; projectName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrg) return;

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load stats
        const orgStats = await getOrgStats(currentOrg.id);
        setStats(orgStats);

        // Load recent tasks
        const [tasks, projects, agents] = await Promise.all([
          getTasksByOrg(currentOrg.id),
          getProjectsByOrg(currentOrg.id),
          getAgentsByOrg(currentOrg.id)
        ]);

        // Create lookup maps for names
        const projectMap = new Map(projects.map(p => [p.id, p.name]));
        const agentMap = new Map(agents.map(a => [a.id, a.name]));

        // Enrich tasks with names and sort by most recent
        const enrichedTasks = tasks
          .map(task => ({
            ...task,
            projectName: projectMap.get(task.projectId) || 'Unknown Project',
            agentName: task.assigneeAgentId ? agentMap.get(task.assigneeAgentId) || 'Unknown Agent' : 'Unassigned'
          }))
          .sort((a, b) => {
            // Sort by createdAt, assuming it's a Firestore timestamp or Date
            const aTime = a.createdAt && typeof a.createdAt === 'object' && 'seconds' in a.createdAt 
              ? (a.createdAt as any).seconds * 1000 
              : new Date(a.createdAt as any).getTime();
            const bTime = b.createdAt && typeof b.createdAt === 'object' && 'seconds' in b.createdAt 
              ? (b.createdAt as any).seconds * 1000 
              : new Date(b.createdAt as any).getTime();
            return bTime - aTime;
          })
          .slice(0, 5);

        setRecentTasks(enrichedTasks);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [currentOrg]);

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-gray-500 mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-gray-500 mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-red-500 mt-1">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-gray-500 mt-1">{currentOrg.name} operations overview</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/swarms">Create Project</Link>
          </Button>
          <Button asChild>
            <Link href="/agents">Register Agent</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Projects"
          value={String(stats?.projectCount || 0)}
          icon="📁"
          change={0}
          changeLabel="active projects"
        />
        <StatCard
          title="Agents"
          value={String(stats?.agentCount || 0)}
          icon="🤖"
          change={0}
          changeLabel="registered agents"
        />
        <StatCard
          title="Active Tasks"
          value={String(stats?.activeTasks || 0)}
          icon="🎯"
          change={0}
          changeLabel="in progress"
        />
        <StatCard
          title="Completed Tasks"
          value={String(stats?.completedTasks || 0)}
          icon="✅"
          change={0}
          changeLabel="total completed"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">📋 Recent Tasks</CardTitle>
              <Link href="/missions" className="text-sm text-blue-600 hover:underline">View all →</Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No tasks yet</p>
                  <Link href="/missions" className="text-blue-600 hover:underline text-sm">
                    Create your first task →
                  </Link>
                </div>
              ) : (
                recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <p className="text-xs text-gray-500">
                        📁 {task.projectName} · 🤖 {task.agentName}
                      </p>
                    </div>
                    <Badge className={`text-[10px] ${statusColors[task.status]}`}>
                      {statusLabels[task.status]}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Activity Feed Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">📈 Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <p>Activity feed coming soon</p>
                <p className="text-sm">Track agent actions and task updates here</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">⚡ Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" variant="outline">
                <Link href="/swarms">
                  📁 Create Project
                </Link>
              </Button>
              <Button asChild className="w-full" variant="outline">
                <Link href="/agents">
                  🤖 Register Agent
                </Link>
              </Button>
              <Button asChild className="w-full" variant="outline">
                <Link href="/missions">
                  📋 Create Task
                </Link>
              </Button>
              <Button asChild className="w-full" variant="outline">
                <Link href="/chat">
                  💬 Open Chat
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Org Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">🏢 Organization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-medium">{currentOrg.name}</p>
                {currentOrg.description && (
                  <p className="text-sm text-gray-600">{currentOrg.description}</p>
                )}
                <div className="text-xs text-gray-500 pt-2 border-t">
                  <p>Members: {currentOrg.members.length}</p>
                  <p>Owner: {currentOrg.ownerAddress.slice(0, 6)}...{currentOrg.ownerAddress.slice(-4)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}