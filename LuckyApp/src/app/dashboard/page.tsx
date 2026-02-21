'use client';

import { useState, useEffect } from 'react';
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { useOrg } from "@/contexts/OrgContext";
import BlurText from "@/components/reactbits/BlurText";
import GradientText from "@/components/reactbits/GradientText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import DecryptedText from "@/components/reactbits/DecryptedText";
import {
  getOrgStats,
  getTasksByOrg,
  getProjectsByOrg,
  getAgentsByOrg,
  getJobsByOrg,
  type Task,
  type Project,
  type Agent,
  type Job,
} from "@/lib/firestore";

const SwarmCanvas = dynamic(
  () => import('@/components/swarm-workflow/swarm-canvas').then(mod => ({ default: mod.SwarmCanvas })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        Loading workflow editor...
      </div>
    ),
  }
);

interface OrgStats {
  projectCount: number;
  agentCount: number;
  taskCount: number;
  completedTasks: number;
  activeTasks: number;
  todoTasks: number;
  jobCount: number;
  openJobs: number;
  claimedJobs: number;
  closedJobs: number;
}

const statusColors: Record<string, string> = {
  todo: "badge-neon-default",
  in_progress: "badge-neon-amber",
  done: "badge-neon-green",
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

const jobStatusColors: Record<string, string> = {
  open: "badge-neon-green",
  claimed: "badge-neon-amber",
  closed: "badge-neon-default",
};

const jobStatusLabels: Record<string, string> = {
  open: "Open",
  claimed: "Claimed",
  closed: "Closed",
};

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<(Task & { agentName?: string; projectName?: string })[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
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

        // Load recent tasks and jobs
        const [tasks, projects, agentsData, jobs] = await Promise.all([
          getTasksByOrg(currentOrg.id),
          getProjectsByOrg(currentOrg.id),
          getAgentsByOrg(currentOrg.id),
          getJobsByOrg(currentOrg.id),
        ]);

        // Store agents for the swarm workflow tab
        setAgents(agentsData);

        // Create lookup maps for names
        const projectMap = new Map(projects.map(p => [p.id, p.name]));
        const agentMap = new Map(agentsData.map(a => [a.id, a.name]));

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

        // Sort jobs by most recent and take top 5
        const sortedJobs = jobs
          .sort((a, b) => {
            const aTime = a.createdAt && typeof a.createdAt === 'object' && 'seconds' in a.createdAt
              ? (a.createdAt as any).seconds * 1000
              : new Date(a.createdAt as any).getTime();
            const bTime = b.createdAt && typeof b.createdAt === 'object' && 'seconds' in b.createdAt
              ? (b.createdAt as any).seconds * 1000
              : new Date(b.createdAt as any).getTime();
            return bTime - aTime;
          })
          .slice(0, 5);
        setRecentJobs(sortedJobs);
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
          <p className="text-muted-foreground mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <BlurText
            text="Dashboard"
            className="text-3xl font-bold tracking-tight"
            delay={80}
            animateBy="words"
          />
          <p className="text-muted-foreground mt-1 truncate">
            <GradientText colors={['#FFD700', '#FFA500', '#FF8C00']} animationSpeed={6} className="text-base font-medium">
              {currentOrg.name}
            </GradientText>
            <span className="ml-1">operations overview</span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link href="/swarms">Create Project</Link>
          </Button>
          <Button asChild>
            <Link href="/agents">Register Agent</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="swarm">Swarm Workflow</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Stat Cards with staggered entrance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
            >
              {[
                { title: "Projects", value: String(stats?.projectCount || 0), icon: "📁", changeLabel: "active projects" },
                { title: "Agents", value: String(stats?.agentCount || 0), icon: "🤖", changeLabel: "registered agents" },
                { title: "Active Tasks", value: String(stats?.activeTasks || 0), icon: "🎯", changeLabel: "in progress" },
                { title: "Completed Tasks", value: String(stats?.completedTasks || 0), icon: "✅", changeLabel: "total completed" },
                { title: "Open Jobs", value: String(stats?.openJobs || 0), icon: "💼", changeLabel: `${stats?.jobCount || 0} total jobs` },
              ].map((card, index) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
                >
                  <StatCard {...card} change={0} />
                </motion.div>
              ))}
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-3">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                className="lg:col-span-2 space-y-6"
              >
                {/* Recent Tasks */}
                <SpotlightCard className="p-0 glass-card-enhanced" spotlightColor="rgba(255, 191, 0, 0.06)">
                  <CardHeader className="flex flex-row items-center justify-between px-6 pt-6">
                    <CardTitle className="text-lg">
                      📋 <DecryptedText text="Recent Tasks" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
                    </CardTitle>
                    <Link href="/missions" className="text-sm">
                      <ShinyText text="View all →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-sm" />
                    </Link>
                  </CardHeader>
                  <CardContent className="space-y-3 px-6 pb-6">
                    {recentTasks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No tasks yet</p>
                        <Link href="/missions" className="text-amber-600 dark:text-amber-400 hover:underline text-sm">
                          Create your first task →
                        </Link>
                      </div>
                    ) : (
                      recentTasks.map((task, index) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between py-2 border-b border-border last:border-0 animate-in fade-in slide-in-from-bottom-2"
                          style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{task.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              📁 {task.projectName} · 🤖 {task.agentName}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${statusColors[task.status]}`}>
                            {statusLabels[task.status]}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </SpotlightCard>

                {/* Recent Jobs */}
                <SpotlightCard className="p-0 glass-card-enhanced" spotlightColor="rgba(255, 191, 0, 0.06)">
                  <CardHeader className="flex flex-row items-center justify-between px-6 pt-6">
                    <CardTitle className="text-lg">
                      💼 <DecryptedText text="Recent Jobs" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
                    </CardTitle>
                    <Link href="/jobs" className="text-sm">
                      <ShinyText text="View all →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-sm" />
                    </Link>
                  </CardHeader>
                  <CardContent className="space-y-3 px-6 pb-6">
                    {recentJobs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No jobs posted yet</p>
                        <Link href="/jobs" className="text-amber-600 dark:text-amber-400 hover:underline text-sm">
                          Post your first job →
                        </Link>
                      </div>
                    ) : (
                      recentJobs.map((job, index) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between py-2 border-b border-border last:border-0 animate-in fade-in slide-in-from-bottom-2"
                          style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{job.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {job.reward && <span>💰 {job.reward} · </span>}
                              {job.priority} priority
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${jobStatusColors[job.status]}`}>
                            {jobStatusLabels[job.status]}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </SpotlightCard>
              </motion.div>

              {/* Quick Actions & Org Info */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
                className="space-y-6"
              >
                <SpotlightCard className="p-0 glass-card-enhanced" spotlightColor="rgba(255, 191, 0, 0.06)">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      ⚡ <DecryptedText text="Quick Actions" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button asChild className="w-full btn-glow" variant="outline">
                      <Link href="/swarms">
                        📁 Create Project
                      </Link>
                    </Button>
                    <Button asChild className="w-full btn-glow" variant="outline">
                      <Link href="/agents">
                        🤖 Register Agent
                      </Link>
                    </Button>
                    <Button asChild className="w-full btn-glow" variant="outline">
                      <Link href="/missions">
                        📋 Create Task
                      </Link>
                    </Button>
                    <Button asChild className="w-full btn-glow" variant="outline">
                      <Link href="/jobs">
                        💼 Post Job
                      </Link>
                    </Button>
                    <Button asChild className="w-full btn-glow" variant="outline">
                      <Link href="/chat">
                        💬 Open Chat
                      </Link>
                    </Button>
                  </CardContent>
                </SpotlightCard>

                {/* Org Info */}
                <SpotlightCard className="p-0 glass-card-enhanced" spotlightColor="rgba(255, 191, 0, 0.06)">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      🏢 <DecryptedText text="Organization" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {currentOrg.logoUrl ? (
                          <img src={currentOrg.logoUrl} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <span className="text-lg">🏢</span>
                        )}
                        <p className="font-medium truncate">{currentOrg.name}</p>
                      </div>
                      {currentOrg.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{currentOrg.description}</p>
                      )}
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        <p>Members: {currentOrg.members.length}</p>
                        <p>Owner: {currentOrg.ownerAddress.slice(0, 6)}...{currentOrg.ownerAddress.slice(-4)}</p>
                      </div>
                    </div>
                  </CardContent>
                </SpotlightCard>
              </motion.div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="swarm">
          <SwarmCanvas agents={agents} />
        </TabsContent>
      </Tabs>
    </div>
  );
}