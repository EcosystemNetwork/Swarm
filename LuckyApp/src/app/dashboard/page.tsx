/** Dashboard — Customizable command center with drag-and-drop widgets, add/remove from catalog. */
'use client';

import { useState, useEffect, useCallback, type DragEvent } from 'react';
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/analytics/stat-card";
import { useOrg } from "@/contexts/OrgContext";
import BlurText from "@/components/reactbits/BlurText";
import GradientText from "@/components/reactbits/GradientText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { VitalsWidget } from "@/components/vitals-widget";
import { GripVertical, RotateCcw, Plus, X, Check } from "lucide-react";
import {
  getOrgStats,
  getTasksByOrg,
  getProjectsByOrg,
  getAgentsByOrg,
  getJobsByOrg,
  type Task,
  type Agent,
  type Job,
} from "@/lib/firestore";
import {
  getActivityFeed,
  EVENT_TYPE_CONFIG,
  type ActivityEvent,
} from "@/lib/activity";

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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

const STAT_ORDER_KEY = "swarm-dashboard-stat-order";
const WIDGET_ORDER_KEY = "swarm-dashboard-widget-order";
const ACTIVE_STATS_KEY = "swarm-dashboard-active-stats";
const ACTIVE_WIDGETS_KEY = "swarm-dashboard-active-widgets";

function loadJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

function saveJSON(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

/* ------------------------------------------------------------------ */
/*  Widget Catalog                                                     */
/* ------------------------------------------------------------------ */

import { UsageWidget } from "@/components/usage-widget";
import { LiveFeedWidget } from "@/components/live-feed-widget";
import { CronWidget } from "@/components/cron-widget";

interface StatCatalogEntry {
  id: string;
  icon: string;
  label: string;
}

interface WidgetCatalogEntry {
  id: string;
  icon: string;
  label: string;
  description: string;
  colSpan?: string;
}

const ALL_STAT_CATALOG: StatCatalogEntry[] = [
  { id: "stat-projects", icon: "📁", label: "Projects" },
  { id: "stat-agents", icon: "🤖", label: "Agents" },
  { id: "stat-active-tasks", icon: "🎯", label: "Active Tasks" },
  { id: "stat-completed-tasks", icon: "✅", label: "Completed Tasks" },
  { id: "stat-open-jobs", icon: "💼", label: "Open Jobs" },
  { id: "stat-todo-tasks", icon: "📝", label: "Todo Tasks" },
  { id: "stat-total-tasks", icon: "📊", label: "Total Tasks" },
  { id: "stat-claimed-jobs", icon: "🤝", label: "Claimed Jobs" },
  { id: "stat-members", icon: "👥", label: "Members" },
];

const ALL_WIDGET_CATALOG: WidgetCatalogEntry[] = [
  { id: "widget-recent-tasks", icon: "📋", label: "Recent Tasks", description: "Latest tasks with status and assignee", colSpan: "lg:col-span-2" },
  { id: "widget-recent-jobs", icon: "💼", label: "Recent Jobs", description: "Latest posted jobs with rewards", colSpan: "lg:col-span-2" },
  { id: "widget-quick-actions", icon: "⚡", label: "Quick Actions", description: "Shortcuts to common operations", colSpan: "" },
  { id: "widget-org-info", icon: "🏢", label: "Organization", description: "Organization profile and details", colSpan: "" },
  { id: "widget-activity-feed", icon: "📜", label: "Activity Feed", description: "Recent system events and audit log", colSpan: "lg:col-span-2" },
  { id: "widget-system-vitals", icon: "🖥️", label: "System Vitals", description: "CPU, memory, and disk usage gauges", colSpan: "" },
  { id: "widget-agent-status", icon: "🟢", label: "Agent Status", description: "Online, offline, and busy agent breakdown", colSpan: "" },
  { id: "widget-task-breakdown", icon: "📈", label: "Task Breakdown", description: "Visual breakdown of task statuses", colSpan: "" },
  { id: "widget-llm-usage", icon: "💰", label: "API Usage & Costs", description: "Live tracking of LLM token costs & rate limits", colSpan: "lg:col-span-2" },
  { id: "widget-live-stream", icon: "Terminal", label: "Live Feed Stream", description: "Raw I/O stream of agent messages", colSpan: "lg:col-span-2" },
  { id: "widget-cron-jobs", icon: "🕒", label: "Cron Jobs", description: "Manage background scheduled agent tasks", colSpan: "lg:col-span-2" },
];

const DEFAULT_ACTIVE_STATS = [
  "stat-projects", "stat-agents", "stat-active-tasks", "stat-completed-tasks", "stat-open-jobs",
];

const DEFAULT_ACTIVE_WIDGETS = [
  "widget-recent-tasks", "widget-quick-actions", "widget-recent-jobs", "widget-org-info", "widget-live-stream", "widget-cron-jobs",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function applySavedOrder(key: string, activeIds: string[]): string[] {
  const saved = loadJSON<string[]>(key);
  if (!saved) return [...activeIds];
  const result: string[] = [];
  const used = new Set<string>();
  for (const id of saved) {
    if (activeIds.includes(id) && !used.has(id)) { result.push(id); used.add(id); }
  }
  for (const id of activeIds) {
    if (!used.has(id)) { result.push(id); used.add(id); }
  }
  return result;
}

/** Deduplicate an array preserving order */
function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
}

function reorder(list: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return list;
  const next = [...list];
  const fromIdx = next.indexOf(fromId);
  const toIdx = next.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return list;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, fromId);
  return next;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<(Task & { agentName?: string; projectName?: string })[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active widget sets (which widgets are visible)
  const [activeStatIds, setActiveStatIds] = useState<string[]>(DEFAULT_ACTIVE_STATS);
  const [activeWidgetIds, setActiveWidgetIds] = useState<string[]>(DEFAULT_ACTIVE_WIDGETS);

  // Ordered arrays (only active ones, in display order)
  const [statOrder, setStatOrder] = useState<string[]>(DEFAULT_ACTIVE_STATS);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_ACTIVE_WIDGETS);

  // Drag state
  const [draggingStat, setDraggingStat] = useState<string | null>(null);
  const [draggingWidget, setDraggingWidget] = useState<string | null>(null);
  const [dropTargetStat, setDropTargetStat] = useState<string | null>(null);
  const [dropTargetWidget, setDropTargetWidget] = useState<string | null>(null);

  // Catalog dialog
  const [showCatalog, setShowCatalog] = useState(false);

  // Load saved layout on mount
  useEffect(() => {
    const savedActiveStats = loadJSON<string[]>(ACTIVE_STATS_KEY) ?? DEFAULT_ACTIVE_STATS;
    const savedActiveWidgets = loadJSON<string[]>(ACTIVE_WIDGETS_KEY) ?? DEFAULT_ACTIVE_WIDGETS;
    // Filter to only known IDs
    const validStats = savedActiveStats.filter(id => ALL_STAT_CATALOG.some(s => s.id === id));
    const validWidgets = savedActiveWidgets.filter(id => ALL_WIDGET_CATALOG.some(w => w.id === id));
    setActiveStatIds(validStats);
    setActiveWidgetIds(validWidgets);
    setStatOrder(applySavedOrder(STAT_ORDER_KEY, validStats));
    setWidgetOrder(applySavedOrder(WIDGET_ORDER_KEY, validWidgets));
  }, []);

  // Load dashboard data
  useEffect(() => {
    if (!currentOrg) return;

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const orgStats = await getOrgStats(currentOrg.id);
        setStats(orgStats);

        const [tasks, projects, agentsData, jobs] = await Promise.all([
          getTasksByOrg(currentOrg.id),
          getProjectsByOrg(currentOrg.id),
          getAgentsByOrg(currentOrg.id),
          getJobsByOrg(currentOrg.id),
        ]);

        setAgents(agentsData);

        const projectMap = new Map(projects.map(p => [p.id, p.name]));
        const agentMap = new Map(agentsData.map(a => [a.id, a.name]));

        const enrichedTasks = tasks
          .map(task => ({
            ...task,
            projectName: projectMap.get(task.projectId) || 'Unknown Project',
            agentName: task.assigneeAgentId ? agentMap.get(task.assigneeAgentId) || 'Unknown Agent' : 'Unassigned'
          }))
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

        setRecentTasks(enrichedTasks);

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

        // Load activity feed
        try {
          const feed = await getActivityFeed(currentOrg.id, { max: 8 });
          setActivityFeed(feed);
        } catch {
          // Activity feed is non-critical
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [currentOrg]);

  /* ── Stat Card Drag Handlers ── */

  const onStatDragStart = useCallback((e: DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggingStat(id);
  }, []);

  const onStatDragOver = useCallback((e: DragEvent, id: string) => {
    if (!draggingStat || draggingStat === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetStat(id);
  }, [draggingStat]);

  const onStatDrop = useCallback((e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingStat) return;
    const next = reorder(statOrder, draggingStat, targetId);
    setStatOrder(next);
    saveJSON(STAT_ORDER_KEY, next);
    setDraggingStat(null);
    setDropTargetStat(null);
  }, [draggingStat, statOrder]);

  const onStatDragEnd = useCallback(() => {
    setDraggingStat(null);
    setDropTargetStat(null);
  }, []);

  /* ── Widget Drag Handlers ── */

  const onWidgetDragStart = useCallback((e: DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggingWidget(id);
  }, []);

  const onWidgetDragOver = useCallback((e: DragEvent, id: string) => {
    if (!draggingWidget || draggingWidget === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetWidget(id);
  }, [draggingWidget]);

  const onWidgetDrop = useCallback((e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingWidget) return;
    const next = reorder(widgetOrder, draggingWidget, targetId);
    setWidgetOrder(next);
    saveJSON(WIDGET_ORDER_KEY, next);
    setDraggingWidget(null);
    setDropTargetWidget(null);
  }, [draggingWidget, widgetOrder]);

  const onWidgetDragEnd = useCallback(() => {
    setDraggingWidget(null);
    setDropTargetWidget(null);
  }, []);

  /* ── Add / Remove Widgets ── */

  const toggleStat = useCallback((id: string) => {
    setActiveStatIds(prev => {
      const removing = prev.includes(id);
      const next = removing ? prev.filter(s => s !== id) : [...prev, id];
      saveJSON(ACTIVE_STATS_KEY, next);
      setStatOrder(order => {
        let newOrder: string[];
        if (removing) {
          newOrder = order.filter(s => s !== id);
        } else {
          newOrder = order.includes(id) ? order : [...order, id];
        }
        newOrder = dedupe(newOrder);
        saveJSON(STAT_ORDER_KEY, newOrder);
        return newOrder;
      });
      return next;
    });
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setActiveWidgetIds(prev => {
      const removing = prev.includes(id);
      const next = removing ? prev.filter(w => w !== id) : [...prev, id];
      saveJSON(ACTIVE_WIDGETS_KEY, next);
      setWidgetOrder(order => {
        let newOrder: string[];
        if (removing) {
          newOrder = order.filter(w => w !== id);
        } else {
          newOrder = order.includes(id) ? order : [...order, id];
        }
        newOrder = dedupe(newOrder);
        saveJSON(WIDGET_ORDER_KEY, newOrder);
        return newOrder;
      });
      return next;
    });
  }, []);

  const removeStat = useCallback((id: string) => {
    setActiveStatIds(prev => {
      const next = prev.filter(s => s !== id);
      saveJSON(ACTIVE_STATS_KEY, next);
      return next;
    });
    setStatOrder(prev => {
      const next = prev.filter(s => s !== id);
      saveJSON(STAT_ORDER_KEY, next);
      return next;
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setActiveWidgetIds(prev => {
      const next = prev.filter(w => w !== id);
      saveJSON(ACTIVE_WIDGETS_KEY, next);
      return next;
    });
    setWidgetOrder(prev => {
      const next = prev.filter(w => w !== id);
      saveJSON(WIDGET_ORDER_KEY, next);
      return next;
    });
  }, []);

  /* ── Reset Layout ── */

  const resetLayout = useCallback(() => {
    setActiveStatIds(DEFAULT_ACTIVE_STATS);
    setActiveWidgetIds(DEFAULT_ACTIVE_WIDGETS);
    setStatOrder(DEFAULT_ACTIVE_STATS);
    setWidgetOrder(DEFAULT_ACTIVE_WIDGETS);
    localStorage.removeItem(STAT_ORDER_KEY);
    localStorage.removeItem(WIDGET_ORDER_KEY);
    localStorage.removeItem(ACTIVE_STATS_KEY);
    localStorage.removeItem(ACTIVE_WIDGETS_KEY);
  }, []);

  /* ── Stat Card Config Lookup ── */

  const statCardConfigs: Record<string, { title: string; value: string; icon: string; changeLabel: string }> = {
    "stat-projects": { title: "Projects", value: String(stats?.projectCount || 0), icon: "📁", changeLabel: "active projects" },
    "stat-agents": { title: "Agents", value: String(stats?.agentCount || 0), icon: "🤖", changeLabel: "registered agents" },
    "stat-active-tasks": { title: "Active Tasks", value: String(stats?.activeTasks || 0), icon: "🎯", changeLabel: "in progress" },
    "stat-completed-tasks": { title: "Completed Tasks", value: String(stats?.completedTasks || 0), icon: "✅", changeLabel: "total completed" },
    "stat-open-jobs": { title: "Open Jobs", value: String(stats?.openJobs || 0), icon: "💼", changeLabel: `${stats?.jobCount || 0} total jobs` },
    "stat-todo-tasks": { title: "Todo Tasks", value: String(stats?.todoTasks || 0), icon: "📝", changeLabel: "pending tasks" },
    "stat-total-tasks": { title: "Total Tasks", value: String(stats?.taskCount || 0), icon: "📊", changeLabel: "all tasks" },
    "stat-claimed-jobs": { title: "Claimed Jobs", value: String(stats?.claimedJobs || 0), icon: "🤝", changeLabel: "jobs in progress" },
    "stat-members": { title: "Members", value: String(currentOrg?.members.length || 0), icon: "👥", changeLabel: "org members" },
  };

  /* ── Widget Renderers ── */

  const onlineAgents = agents.filter(a => a.status === "online");
  const busyAgents = agents.filter(a => a.status === "busy");
  const offlineAgents = agents.filter(a => a.status === "offline");

  const widgetRenderers: Record<string, { label: string; colSpan: string; render: () => React.ReactNode }> = {
    "widget-recent-tasks": {
      label: "Recent Tasks",
      colSpan: "lg:col-span-2",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
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
      ),
    },
    "widget-recent-jobs": {
      label: "Recent Jobs",
      colSpan: "lg:col-span-2",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
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
      ),
    },
    "widget-quick-actions": {
      label: "Quick Actions",
      colSpan: "",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
          <CardHeader>
            <CardTitle className="text-lg">
              ⚡ <DecryptedText text="Quick Actions" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full btn-glow" variant="outline">
              <Link href="/swarms">📁 Create Project</Link>
            </Button>
            <Button asChild className="w-full btn-glow" variant="outline">
              <Link href="/agents">🤖 Register Agent</Link>
            </Button>
            <Button asChild className="w-full btn-glow" variant="outline">
              <Link href="/missions">📋 Create Task</Link>
            </Button>
            <Button asChild className="w-full btn-glow" variant="outline">
              <Link href="/jobs">💼 Post Job</Link>
            </Button>
            <Button asChild className="w-full btn-glow" variant="outline">
              <Link href="/chat">💬 Open Chat</Link>
            </Button>
          </CardContent>
        </SpotlightCard>
      ),
    },
    "widget-org-info": {
      label: "Organization",
      colSpan: "",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
          <CardHeader>
            <CardTitle className="text-lg">
              🏢 <DecryptedText text="Organization" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {currentOrg?.logoUrl ? (
                  <img src={currentOrg.logoUrl} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <span className="text-lg">🏢</span>
                )}
                <p className="font-medium truncate">{currentOrg?.name}</p>
              </div>
              {currentOrg?.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{currentOrg.description}</p>
              )}
              <div className="text-xs text-muted-foreground pt-2 border-t">
                <p>Members: {currentOrg?.members.length}</p>
                <p>Owner: {currentOrg?.ownerAddress.slice(0, 6)}...{currentOrg?.ownerAddress.slice(-4)}</p>
              </div>
            </div>
          </CardContent>
        </SpotlightCard>
      ),
    },
    "widget-activity-feed": {
      label: "Activity Feed",
      colSpan: "lg:col-span-2",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
          <CardHeader className="flex flex-row items-center justify-between px-6 pt-6">
            <CardTitle className="text-lg">
              📜 <DecryptedText text="Activity Feed" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
            </CardTitle>
            <Link href="/activity" className="text-sm">
              <ShinyText text="View all →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-sm" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 px-6 pb-6">
            {activityFeed.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No activity yet</p>
                <p className="text-xs mt-1">Events will appear here as your swarm operates</p>
              </div>
            ) : (
              activityFeed.map((event, index) => {
                const config = EVENT_TYPE_CONFIG[event.eventType] || { label: event.eventType, icon: "📌", color: "text-muted-foreground" };
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 py-2 border-b border-border last:border-0 animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
                  >
                    <span className="text-base shrink-0 mt-0.5">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.actorName && <span>{event.actorName} · </span>}
                        {formatRelativeTime(event.createdAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${config.color}`}>
                      {config.label}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </SpotlightCard>
      ),
    },
    "widget-system-vitals": {
      label: "System Vitals",
      colSpan: "",
      render: () => (
        <VitalsWidget />
      ),
    },
    "widget-agent-status": {
      label: "Agent Status",
      colSpan: "",
      render: () => {
        const total = agents.length;
        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
            <CardHeader>
              <CardTitle className="text-lg">
                🟢 <DecryptedText text="Agent Status" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {total === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p>No agents registered</p>
                  <Link href="/agents" className="text-amber-600 dark:text-amber-400 hover:underline text-sm">
                    Register your first agent →
                  </Link>
                </div>
              ) : (
                <>
                  {[
                    { label: "Online", count: onlineAgents.length, color: "bg-emerald-500", textColor: "text-emerald-500" },
                    { label: "Busy", count: busyAgents.length, color: "bg-amber-500", textColor: "text-amber-500" },
                    { label: "Offline", count: offlineAgents.length, color: "bg-muted-foreground/40", textColor: "text-muted-foreground" },
                  ].map(s => (
                    <div key={s.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${s.color}`} />
                          <span className="font-medium">{s.label}</span>
                        </div>
                        <span className={`font-semibold tabular-nums ${s.textColor}`}>
                          {s.count} <span className="text-xs text-muted-foreground font-normal">/ {total}</span>
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${s.color}`}
                          style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "widget-task-breakdown": {
      label: "Task Breakdown",
      colSpan: "",
      render: () => {
        const todo = stats?.todoTasks || 0;
        const inProgress = stats?.activeTasks || 0;
        const done = stats?.completedTasks || 0;
        const total = todo + inProgress + done;

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden" spotlightColor="rgba(255, 191, 0, 0.06)">
            <CardHeader>
              <CardTitle className="text-lg">
                📈 <DecryptedText text="Task Breakdown" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {total === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p>No tasks yet</p>
                </div>
              ) : (
                <>
                  {/* Stacked bar */}
                  <div className="h-4 bg-muted rounded-full overflow-hidden flex">
                    {done > 0 && (
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${(done / total) * 100}%` }}
                        title={`Done: ${done}`}
                      />
                    )}
                    {inProgress > 0 && (
                      <div
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${(inProgress / total) * 100}%` }}
                        title={`In Progress: ${inProgress}`}
                      />
                    )}
                    {todo > 0 && (
                      <div
                        className="h-full bg-muted-foreground/30 transition-all duration-500"
                        style={{ width: `${(todo / total) * 100}%` }}
                        title={`Todo: ${todo}`}
                      />
                    )}
                  </div>

                  {/* Legend */}
                  <div className="space-y-2">
                    {[
                      { label: "Done", count: done, color: "bg-emerald-500", pct: ((done / total) * 100).toFixed(0) },
                      { label: "In Progress", count: inProgress, color: "bg-amber-500", pct: ((inProgress / total) * 100).toFixed(0) },
                      { label: "Todo", count: todo, color: "bg-muted-foreground/30", pct: ((todo / total) * 100).toFixed(0) },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-sm ${item.color}`} />
                          <span>{item.label}</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums">
                          {item.count} <span className="text-xs">({item.pct}%)</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Completion rate */}
                  <div className="pt-2 border-t border-border text-center">
                    <span className="text-2xl font-bold text-emerald-500">
                      {total > 0 ? ((done / total) * 100).toFixed(0) : 0}%
                    </span>
                    <p className="text-xs text-muted-foreground">Completion Rate</p>
                  </div>
                </>
              )}
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "widget-llm-usage": {
      label: "API Usage & Costs",
      colSpan: "lg:col-span-2",
      render: () => <UsageWidget />,
    },
    "widget-live-stream": {
      label: "Live Feed Stream",
      colSpan: "lg:col-span-2",
      render: () => <LiveFeedWidget />,
    },
    "widget-cron-jobs": {
      label: "Cron Jobs",
      colSpan: "lg:col-span-2",
      render: () => <CronWidget />,
    },
  };

  /* ── Guards ── */

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

  /* ── Check if layout is customized ── */
  const isCustomized =
    JSON.stringify(activeStatIds) !== JSON.stringify(DEFAULT_ACTIVE_STATS) ||
    JSON.stringify(activeWidgetIds) !== JSON.stringify(DEFAULT_ACTIVE_WIDGETS) ||
    JSON.stringify(statOrder) !== JSON.stringify(DEFAULT_ACTIVE_STATS) ||
    JSON.stringify(widgetOrder) !== JSON.stringify(DEFAULT_ACTIVE_WIDGETS);

  /* ── Render ── */

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
          {isCustomized && (
            <Button variant="ghost" size="sm" onClick={resetLayout} className="text-muted-foreground hover:text-foreground gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowCatalog(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Widget
          </Button>
          <Button asChild variant="outline">
            <Link href="/swarms">Create Project</Link>
          </Button>
          <Button asChild className="bg-amber-600 hover:bg-amber-700 text-black">
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
            {/* ═══ Draggable Stat Cards ═══ */}
            {statOrder.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={`grid gap-4 md:grid-cols-2 ${statOrder.length <= 3 ? "lg:grid-cols-3" : statOrder.length <= 4 ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}
              >
                {statOrder.map((id, index) => {
                  const config = statCardConfigs[id];
                  if (!config) return null;
                  const isDragging = draggingStat === id;
                  const isDropTarget = dropTargetStat === id;

                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
                      draggable
                      onDragStart={(e) => onStatDragStart(e as unknown as DragEvent, id)}
                      onDragOver={(e) => onStatDragOver(e as unknown as DragEvent, id)}
                      onDrop={(e) => onStatDrop(e as unknown as DragEvent, id)}
                      onDragEnd={onStatDragEnd}
                      onDragLeave={() => setDropTargetStat(null)}
                      className={`relative group cursor-grab active:cursor-grabbing transition-all duration-200 rounded-lg overflow-hidden ${isDragging ? "opacity-40 scale-95" : ""
                        } ${isDropTarget ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-background" : ""}`}
                    >
                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeStat(id); }}
                          className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Remove widget"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <GripVertical className="w-4 h-4 text-muted-foreground/60" />
                      </div>
                      <StatCard {...config} change={0} />
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* ═══ Draggable Main Widgets ═══ */}
            {widgetOrder.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-3">
                {widgetOrder.map((id, index) => {
                  const widget = widgetRenderers[id];
                  if (!widget) return null;
                  const isDragging = draggingWidget === id;
                  const isDropTarget = dropTargetWidget === id;

                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.2 + index * 0.1, ease: "easeOut" }}
                      draggable
                      onDragStart={(e) => onWidgetDragStart(e as unknown as DragEvent, id)}
                      onDragOver={(e) => onWidgetDragOver(e as unknown as DragEvent, id)}
                      onDrop={(e) => onWidgetDrop(e as unknown as DragEvent, id)}
                      onDragEnd={onWidgetDragEnd}
                      onDragLeave={() => setDropTargetWidget(null)}
                      className={`relative group cursor-grab active:cursor-grabbing transition-all duration-200 overflow-hidden rounded-lg ${widget.colSpan} ${isDragging ? "opacity-40 scale-[0.98]" : ""
                        } ${isDropTarget ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-background" : ""}`}
                    >
                      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeWidget(id); }}
                          className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Remove widget"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <GripVertical className="w-4 h-4 text-muted-foreground/60" />
                      </div>
                      {widget.render()}
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {statOrder.length === 0 && widgetOrder.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-lg font-medium mb-2">No widgets on your dashboard</p>
                <p className="text-sm mb-4">Add some widgets to customize your view</p>
                <Button onClick={() => setShowCatalog(true)} className="bg-amber-600 hover:bg-amber-700 text-black gap-1.5">
                  <Plus className="w-4 h-4" />
                  Add Widgets
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="swarm">
          <SwarmCanvas agents={agents} />
        </TabsContent>
      </Tabs>

      {/* ═══════════════ Widget Catalog Dialog ═══════════════ */}
      <Dialog open={showCatalog} onOpenChange={setShowCatalog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Widget Catalog</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* Stat Cards */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Stat Cards</h3>
              <div className="space-y-1">
                {ALL_STAT_CATALOG.map((entry) => {
                  const isActive = activeStatIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => toggleStat(entry.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive
                        ? "bg-amber-500/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                      <span className="text-base shrink-0">{entry.icon}</span>
                      <span className="flex-1 text-left font-medium">{entry.label}</span>
                      {isActive && (
                        <Check className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Widgets */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Widgets</h3>
              <div className="space-y-1">
                {ALL_WIDGET_CATALOG.map((entry) => {
                  const isActive = activeWidgetIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => toggleWidget(entry.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive
                        ? "bg-amber-500/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                      <span className="text-base shrink-0">{entry.icon}</span>
                      <div className="flex-1 text-left">
                        <p className="font-medium">{entry.label}</p>
                        <p className="text-xs text-muted-foreground">{entry.description}</p>
                      </div>
                      {isActive && (
                        <Check className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
