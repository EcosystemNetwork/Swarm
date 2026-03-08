/** Dashboard — Customizable command center with drag-and-drop widgets, add/remove from catalog. */
'use client';

import { useState, useEffect, useCallback, useMemo, type DragEvent } from 'react';
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
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { VitalsWidget } from "@/components/vitals-widget";
import { useActiveAccount } from "thirdweb/react";
import { GripVertical, RotateCcw, Plus, X, Check, FolderKanban, Bot, Target, CheckCircle2, Briefcase, ListTodo, BarChart3, Handshake, Users } from "lucide-react";
import {
  getOrgStats,
  getTasksByOrg,
  getProjectsByOrg,
  getAgentsByOrg,
  getJobsByOrg,
  getOrganization,
  createJob,
  claimJob,
  type Task,
  type Agent,
  type Job,
} from "@/lib/firestore";
import { getAgentAvatarUrl } from "@/lib/agent-avatar";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getActivityFeed,
  EVENT_TYPE_CONFIG,
  type ActivityEvent,
} from "@/lib/activity";
import type { DispatchPayload } from "@/components/agent-map/agent-map";
import { TaskDonutChart } from "@/components/charts/task-donut-chart";
import { AgentStatusChart } from "@/components/charts/agent-status-chart";
import { MiniSparkline } from "@/components/charts/mini-sparkline";
import { TaskVelocityChart } from "@/components/charts/task-velocity-chart";
import { CostTrendChart } from "@/components/charts/cost-trend-chart";
import { AgentWorkloadChart } from "@/components/charts/agent-workload-chart";
import { ActivityHeatmapChart } from "@/components/charts/activity-heatmap-chart";
import {
  computeTaskVelocity,
  computeAgentWorkload,
  computeActivityByHour,
} from "@/lib/dashboard-data";
import type { DailyCost } from "@/lib/usage";

const AgentMap = dynamic(
  () => import('@/components/agent-map/agent-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        Loading agent map...
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

const WIDGET_ORDER_KEY = "swarm-dashboard-widget-order-v4";
const ACTIVE_WIDGETS_KEY = "swarm-dashboard-active-widgets-v4";
const WIDGET_WIDTHS_KEY = "swarm-dashboard-widget-widths-v5";

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

interface WidgetCatalogEntry {
  id: string;
  icon: string;
  label: string;
  description: string;
  colSpan?: string;
  category: "widgets" | "stats" | "integrations";
}

const ALL_WIDGET_CATALOG: WidgetCatalogEntry[] = [
  // Widgets
  { id: "widget-daily-briefing", icon: "📋", label: "Daily Briefing", description: "Daily org summary from your briefing agent", colSpan: "lg:col-span-3", category: "widgets" },
  { id: "widget-recent-tasks", icon: "📋", label: "Recent Tasks", description: "Latest tasks with status and assignee", colSpan: "lg:col-span-2", category: "widgets" },
  { id: "widget-recent-jobs", icon: "💼", label: "Recent Jobs", description: "Latest posted jobs with rewards", colSpan: "lg:col-span-2", category: "widgets" },
  { id: "widget-quick-actions", icon: "⚡", label: "Quick Actions", description: "Shortcuts to common operations", colSpan: "", category: "widgets" },
  { id: "widget-org-info", icon: "🏢", label: "Organization", description: "Organization profile and details", colSpan: "", category: "widgets" },
  { id: "widget-activity-feed", icon: "📜", label: "Activity Feed", description: "Recent system events and audit log", colSpan: "lg:col-span-3", category: "widgets" },
  { id: "widget-agent-status", icon: "🟢", label: "Agent Status", description: "Online, offline, and busy agent breakdown", colSpan: "", category: "widgets" },
  { id: "widget-task-breakdown", icon: "📈", label: "Task Breakdown", description: "Visual breakdown of task statuses", colSpan: "", category: "widgets" },
  { id: "widget-system-vitals", icon: "🖥️", label: "System Vitals", description: "CPU, memory, and disk usage gauges", colSpan: "", category: "widgets" },
  // Stats
  { id: "stat-projects", icon: "📁", label: "Projects", description: "Total active projects", colSpan: "", category: "stats" },
  { id: "stat-agents", icon: "🤖", label: "Agents", description: "Total registered agents", colSpan: "", category: "stats" },
  { id: "stat-active-tasks", icon: "🎯", label: "Active Tasks", description: "Tasks currently in progress", colSpan: "", category: "stats" },
  { id: "stat-completed-tasks", icon: "✅", label: "Completed Tasks", description: "Total finished tasks", colSpan: "", category: "stats" },
  { id: "stat-open-jobs", icon: "💼", label: "Open Jobs", description: "Total open jobs", colSpan: "", category: "stats" },
  { id: "stat-todo-tasks", icon: "📝", label: "Todo Tasks", description: "Pending tasks pipeline", colSpan: "", category: "stats" },
  { id: "stat-total-tasks", icon: "📊", label: "Total Tasks", description: "All tasks", colSpan: "", category: "stats" },
  { id: "stat-claimed-jobs", icon: "🤝", label: "Claimed Jobs", description: "Currently claimed jobs", colSpan: "", category: "stats" },
  { id: "stat-members", icon: "👥", label: "Members", description: "Registered org members", colSpan: "", category: "stats" },
  // Integrations
  { id: "widget-llm-usage", icon: "💰", label: "API Usage & Costs", description: "Live tracking of LLM token costs & rate limits", colSpan: "lg:col-span-2", category: "integrations" },
  { id: "widget-live-stream", icon: "Terminal", label: "Live Feed Stream", description: "Raw I/O stream of agent messages", colSpan: "lg:col-span-2", category: "integrations" },
  { id: "widget-cron-jobs", icon: "🕒", label: "Cron Jobs", description: "Manage background scheduled agent tasks", colSpan: "lg:col-span-2", category: "integrations" },
];

const DEFAULT_ACTIVE_WIDGETS = [
  "widget-daily-briefing",
  "stat-projects", "stat-agents", "stat-active-tasks", "stat-open-jobs",
  "widget-recent-tasks", "widget-quick-actions",
  "widget-recent-jobs", "widget-org-info",
  "widget-agent-status", "widget-task-breakdown",
  "widget-activity-feed",
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

function getColSpanClass(cols: number, isStat: boolean) {
  if (isStat) {
    if (cols === 1) return "col-span-1 md:col-span-2 lg:col-span-1";
    return "col-span-2 md:col-span-2 lg:col-span-2";
  }

  switch (cols) {
    case 1: return "col-span-2 md:col-span-2 lg:col-span-1";
    case 2: return "col-span-2 md:col-span-2 lg:col-span-2";
    case 3: return "col-span-2 md:col-span-3 lg:col-span-3";
    case 4: return "col-span-2 md:col-span-4 lg:col-span-4";
    case 5: return "col-span-2 md:col-span-4 lg:col-span-5";
    case 6: return "col-span-2 md:col-span-4 lg:col-span-6";
    default: return "col-span-2 md:col-span-4 lg:col-span-6";
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const currencySymbol = "$";
  const account = useActiveAccount();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<(Task & { agentName?: string; projectName?: string })[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [activityAll, setActivityAll] = useState<ActivityEvent[]>([]);
  const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([]);
  const [swarmSlots, setSwarmSlots] = useState<Record<string, { agentId: string; assignedAt: unknown } | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dashTab, setDashTab] = useState("overview");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Active widget sets (which widgets are visible)
  const [activeWidgetIds, setActiveWidgetIds] = useState<string[]>(DEFAULT_ACTIVE_WIDGETS);

  // Ordered arrays (only active ones, in display order)
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_ACTIVE_WIDGETS);

  // Widget width overrides
  const [widgetWidths, setWidgetWidths] = useState<Record<string, number>>({});

  // Drag state
  const [draggingWidget, setDraggingWidget] = useState<string | null>(null);
  const [dropTargetWidget, setDropTargetWidget] = useState<string | null>(null);

  // Catalog dialog
  const [showCatalog, setShowCatalog] = useState(false);

  // Load saved layout on mount
  useEffect(() => {
    const savedActiveWidgets = loadJSON<string[]>(ACTIVE_WIDGETS_KEY) ?? DEFAULT_ACTIVE_WIDGETS;
    // Filter to only known IDs
    const validWidgets = savedActiveWidgets.filter(id => ALL_WIDGET_CATALOG.some(w => w.id === id));
    setActiveWidgetIds(validWidgets);
    setWidgetOrder(applySavedOrder(WIDGET_ORDER_KEY, validWidgets));

    const savedWidths = loadJSON<Record<string, number>>(WIDGET_WIDTHS_KEY);
    if (savedWidths) setWidgetWidths(savedWidths);
  }, []);

  // Load dashboard data — extracted so dispatch can refresh
  const loadDashboardData = useCallback(async (isInitial = false) => {
    if (!currentOrg) return;
    try {
      if (isInitial) { setLoading(true); setError(null); }

      const orgStats = await getOrgStats(currentOrg.id);
      setStats(orgStats);

      const [tasks, projects, agentsData, jobs, freshOrg] = await Promise.all([
        getTasksByOrg(currentOrg.id),
        getProjectsByOrg(currentOrg.id),
        getAgentsByOrg(currentOrg.id),
        getJobsByOrg(currentOrg.id),
        getOrganization(currentOrg.id),
      ]);

      setSwarmSlots(freshOrg?.swarmSlots || {});

      setAgents(agentsData);
      setAllTasks(tasks);
      setAllJobs(jobs);

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

      // Load activity feed (200 for heatmap, slice 8 for feed widget)
      try {
        const feed = await getActivityFeed(currentOrg.id, { max: 200 });
        setActivityAll(feed);
        setActivityFeed(feed.slice(0, 8));
      } catch {
        // Activity feed is non-critical
      }

      // Load cost data
      try {
        const { getUsageRecords, aggregateDaily } = await import("@/lib/usage");
        const records = await getUsageRecords(currentOrg.id, 14);
        setDailyCosts(aggregateDaily(records));
      } catch {
        // Cost data is non-critical
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      if (isInitial) setLoading(false);
      setLastUpdated(new Date());
    }
  }, [currentOrg]);

  useEffect(() => {
    loadDashboardData(true);
  }, [loadDashboardData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!currentOrg) return;
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30_000);
    return () => clearInterval(interval);
  }, [currentOrg, loadDashboardData]);

  // ── Dispatch handler — creates job, assigns agents, refreshes data ──
  const handleDispatch = useCallback(async (payload: DispatchPayload) => {
    if (!currentOrg) return;
    const { prompt, priority, reward, agentIds } = payload;
    const agentNames = agentIds.map(id => agents.find(a => a.id === id)?.name || id);

    try {
      setDispatching(true);
      setError(null);

      // 1. Create the job (org-wide, no single project)
      const jobId = await createJob({
        orgId: currentOrg.id,
        projectId: "",
        title: prompt.slice(0, 120) + (prompt.length > 120 ? "\u2026" : ""),
        description: prompt,
        status: "open",
        reward: reward || undefined,
        requiredSkills: [],
        postedByAddress: account?.address || "unknown",
        priority,
        createdAt: new Date(),
      });

      // 2. Assign each selected agent
      for (const agentId of agentIds) {
        await claimJob(jobId, agentId, currentOrg.id, "");
      }

      // 3. Log to agentComms
      try {
        await addDoc(collection(db, "agentComms"), {
          orgId: currentOrg.id,
          fromAgentId: "system",
          fromAgentName: "Agent Dispatch",
          toAgentId: agentIds.join(","),
          toAgentName: agentNames.join(", "),
          type: "handoff",
          content: `🚀 **Job Dispatched**\n\n**Prompt:** ${prompt}\n\n**Assigned Agents:** ${agentNames.map(n => `@${n}`).join(", ")}\n**Priority:** ${priority}${reward ? `\n**Reward:** ${reward} ${currencySymbol}` : ""}\n\nCoordinate as a team to complete this task.`,
          metadata: { jobId, priority, reward, agentIds },
          createdAt: serverTimestamp(),
        });
      } catch { /* comms log is non-critical */ }

      // 4. Refresh dashboard data so the new job appears on the map
      await loadDashboardData();
    } catch (err) {
      console.error("Dispatch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to dispatch job");
    } finally {
      setDispatching(false);
    }
  }, [currentOrg, agents, account, currencySymbol, loadDashboardData]);

  // ── Assign handler — assigns agents to open jobs via drag connections ──
  const handleAssign = useCallback(async (assignments: { jobId: string; agentId: string; jobTitle: string; agentName: string }[]) => {
    if (!currentOrg) return;
    try {
      setDispatching(true);
      setError(null);
      for (const a of assignments) {
        await claimJob(a.jobId, a.agentId, currentOrg.id, "");
      }
      await loadDashboardData();
    } catch (err) {
      console.error("Assign failed:", err);
      setError(err instanceof Error ? err.message : "Failed to assign agents");
    } finally {
      setDispatching(false);
    }
  }, [currentOrg, loadDashboardData]);



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
    setActiveWidgetIds(DEFAULT_ACTIVE_WIDGETS);
    setWidgetOrder(DEFAULT_ACTIVE_WIDGETS);
    setWidgetWidths({});
    localStorage.removeItem(WIDGET_ORDER_KEY);
    localStorage.removeItem(ACTIVE_WIDGETS_KEY);
    localStorage.removeItem(WIDGET_WIDTHS_KEY);
  }, []);

  /* ── Resize Widget ── */
  const cycleWidgetWidth = useCallback((id: string, defaultCols: number, maxCols: number) => {
    setWidgetWidths(prev => {
      const current = prev[id] || defaultCols;
      let next = current + 1;
      if (next > maxCols) next = 1;

      const newWidths = { ...prev, [id]: next };
      saveJSON(WIDGET_WIDTHS_KEY, newWidths);
      return newWidths;
    });
  }, []);

  /* ── Widget Renderers ── */

  const onlineAgents = agents.filter(a => a.status === "online");
  const busyAgents = agents.filter(a => a.status === "busy");
  const offlineAgents = agents.filter(a => a.status === "offline");

  const widgetRenderers: Record<string, { label: string; colSpan: string; render: () => React.ReactNode }> = {
    "widget-recent-tasks": {
      label: "Recent Tasks",
      colSpan: "lg:col-span-2",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
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
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
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
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
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
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
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
      colSpan: "lg:col-span-3",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
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
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
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
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
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
    "widget-daily-briefing": {
      label: "Daily Briefing",
      colSpan: "lg:col-span-3",
      render: () => {
        const slot = swarmSlots["daily-briefings"];
        const briefingAgent = slot ? agents.find(a => a.id === slot.agentId) : null;

        if (!briefingAgent) {
          return (
            <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">
                  📋 <DecryptedText text="Daily Briefing" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6 space-y-3">
                  <div className="text-4xl opacity-30">📋</div>
                  <p className="text-sm text-muted-foreground">No agent assigned to Daily Briefings</p>
                  <p className="text-xs text-muted-foreground/60">Equip an agent in the Swarm inventory to start receiving daily briefings.</p>
                  <Button asChild variant="outline" size="sm" className="mt-2">
                    <Link href="/swarm">Go to Swarm Inventory</Link>
                  </Button>
                </div>
              </CardContent>
            </SpotlightCard>
          );
        }

        // Briefing agent is equipped — show digest
        const today = new Date();
        const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

        const todoCount = stats?.todoTasks || 0;
        const activeCount = stats?.activeTasks || 0;
        const doneCount = stats?.completedTasks || 0;
        const openJobCount = stats?.openJobs || 0;
        const onlineCount = agents.filter(a => a.status === "online").length;
        const totalAgents = agents.length;

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between px-6 pt-6">
              <CardTitle className="text-lg">
                📋 <DecryptedText text="Daily Briefing" speed={30} maxIterations={6} animateOn="view" sequential className="text-lg font-semibold" encryptedClassName="text-lg font-semibold text-amber-500/40" />
              </CardTitle>
              <Link href="/swarm" className="text-sm">
                <ShinyText text="Swarm →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-sm" />
              </Link>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              {/* Agent badge */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <img
                  src={briefingAgent.avatarUrl || getAgentAvatarUrl(briefingAgent.name, briefingAgent.type)}
                  alt={briefingAgent.name}
                  className="w-8 h-8 rounded-full border-2 border-amber-500/30"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{briefingAgent.name}</p>
                  <p className="text-[10px] text-muted-foreground">Briefing Agent · {dateStr}</p>
                </div>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${briefingAgent.status === "online" ? "bg-emerald-400" : briefingAgent.status === "busy" ? "bg-amber-400" : "bg-gray-400"}`} />
              </div>

              {/* Briefing digest */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-base">🤖</span>
                  <span className="text-muted-foreground">Agents:</span>
                  <span className="font-medium">{onlineCount} online</span>
                  <span className="text-muted-foreground/50">/ {totalAgents} total</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-base">🎯</span>
                  <span className="text-muted-foreground">Active tasks:</span>
                  <span className="font-medium">{activeCount}</span>
                  {todoCount > 0 && <span className="text-muted-foreground/50">({todoCount} pending)</span>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-base">✅</span>
                  <span className="text-muted-foreground">Completed:</span>
                  <span className="font-medium text-emerald-400">{doneCount}</span>
                </div>
                {openJobCount > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base">💼</span>
                    <span className="text-muted-foreground">Open jobs:</span>
                    <span className="font-medium text-amber-400">{openJobCount}</span>
                  </div>
                )}
              </div>

              {/* Recent activity summary */}
              {activityFeed.length > 0 && (
                <div className="pt-3 border-t border-border space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Recent Activity</p>
                  {activityFeed.slice(0, 4).map((event) => {
                    const config = EVENT_TYPE_CONFIG[event.eventType] || { label: event.eventType, icon: "📌", color: "text-muted-foreground" };
                    return (
                      <div key={event.id} className="flex items-center gap-2 text-xs">
                        <span className="shrink-0">{config.icon}</span>
                        <span className="text-muted-foreground truncate flex-1">{event.description}</span>
                        <span className="text-muted-foreground/40 shrink-0">{formatRelativeTime(event.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "stat-projects": { label: "Projects", colSpan: "", render: () => <StatCard title="Projects" value={String(stats?.projectCount || 0)} icon={FolderKanban} changeLabel="active projects" change={0} /> },
    "stat-agents": { label: "Agents", colSpan: "", render: () => <StatCard title="Agents" value={String(stats?.agentCount || 0)} icon={Bot} changeLabel="registered agents" change={0} /> },
    "stat-active-tasks": { label: "Active Tasks", colSpan: "", render: () => <StatCard title="Active Tasks" value={String(stats?.activeTasks || 0)} icon={Target} changeLabel="in progress" change={0} /> },
    "stat-completed-tasks": { label: "Completed Tasks", colSpan: "", render: () => <StatCard title="Completed Tasks" value={String(stats?.completedTasks || 0)} icon={CheckCircle2} changeLabel="total completed" change={0} /> },
    "stat-open-jobs": { label: "Open Jobs", colSpan: "", render: () => <StatCard title="Open Jobs" value={String(stats?.openJobs || 0)} icon={Briefcase} changeLabel={`${stats?.jobCount || 0} total jobs`} change={0} /> },
    "stat-todo-tasks": { label: "Todo Tasks", colSpan: "", render: () => <StatCard title="Todo Tasks" value={String(stats?.todoTasks || 0)} icon={ListTodo} changeLabel="pending tasks" change={0} /> },
    "stat-total-tasks": { label: "Total Tasks", colSpan: "", render: () => <StatCard title="Total Tasks" value={String(stats?.taskCount || 0)} icon={BarChart3} changeLabel="all tasks" change={0} /> },
    "stat-claimed-jobs": { label: "Claimed Jobs", colSpan: "", render: () => <StatCard title="Claimed Jobs" value={String(stats?.claimedJobs || 0)} icon={Handshake} changeLabel="jobs in progress" change={0} /> },
    "stat-members": { label: "Members", colSpan: "", render: () => <StatCard title="Members" value={String(currentOrg?.members.length || 0)} icon={Users} changeLabel="org members" change={0} /> },
  };

  /* ── Greeting ── */
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  /* ── Guards ── */

  if (!currentOrg) {
    return (
      <div className="space-y-1.5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-1.5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-muted-foreground mt-1">{currentOrg.name}</p>
        </div>
        {/* Skeleton grid matching widget layout */}
        <div className="grid gap-1 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 grid-flow-row-dense auto-rows-auto">
          {/* Briefing skeleton — 3 cols */}
          <div className="col-span-2 md:col-span-3 lg:col-span-3 h-40 rounded-lg bg-muted/30 animate-pulse" />
          {/* 6 stat card skeletons */}
          {Array.from({ length: 6 }, (_, i) => (
            <div key={`sk-stat-${i}`} className="col-span-1 md:col-span-2 lg:col-span-1 h-24 rounded-lg bg-muted/30 animate-pulse" />
          ))}
          {/* 2 panel skeletons — 2 cols each */}
          <div className="col-span-2 md:col-span-2 lg:col-span-2 h-52 rounded-lg bg-muted/30 animate-pulse" />
          <div className="col-span-2 md:col-span-2 lg:col-span-1 h-52 rounded-lg bg-muted/30 animate-pulse" />
          <div className="col-span-2 md:col-span-2 lg:col-span-2 h-52 rounded-lg bg-muted/30 animate-pulse" />
          <div className="col-span-2 md:col-span-2 lg:col-span-1 h-52 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-1.5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-muted-foreground mt-1">{currentOrg.name}</p>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-center max-w-sm">
            <div className="p-3 rounded-full bg-red-500/10 inline-flex mb-4">
              <X className="h-6 w-6 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Failed to load dashboard</h2>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button
              onClick={() => loadDashboardData(true)}
              variant="outline"
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Check if layout is customized ── */
  const isCustomized =
    JSON.stringify(activeWidgetIds) !== JSON.stringify(DEFAULT_ACTIVE_WIDGETS) ||
    JSON.stringify(widgetOrder) !== JSON.stringify(DEFAULT_ACTIVE_WIDGETS) ||
    Object.keys(widgetWidths).length > 0;

  /* ── Render ── */

  return (
    <div className="space-y-1.5">
      {/* Dashboard header */}
      <div className="space-y-1.5">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
            <p className="text-muted-foreground mt-1">{currentOrg.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                Updated {formatRelativeTime(lastUpdated)}
              </span>
            )}
            {dashTab === "overview" && (
              <div className="flex items-center gap-2">
                {isCustomized && (
                  <Button variant="ghost" size="sm" onClick={resetLayout} className="text-muted-foreground hover:text-foreground gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setShowCatalog(true)} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Widgets
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Summary stats bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
            {[
              { label: "Agents Online", value: `${onlineAgents.length}/${agents.length}`, color: onlineAgents.length > 0 ? "text-emerald-400" : "text-muted-foreground" },
              { label: "Active Tasks", value: String(stats.activeTasks), color: stats.activeTasks > 0 ? "text-amber-400" : "text-muted-foreground" },
              { label: "Open Jobs", value: String(stats.openJobs), color: stats.openJobs > 0 ? "text-amber-400" : "text-muted-foreground" },
              { label: "Completion", value: `${stats.taskCount > 0 ? Math.round((stats.completedTasks / stats.taskCount) * 100) : 0}%`, color: "text-emerald-400" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card/50 border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className={`text-lg font-bold tabular-nums ${item.color}`}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Tabs value={dashTab} onValueChange={setDashTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="swarm">Agent Map</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-1.5">

            {/* ═══ Draggable Main Widgets ═══ */}
            {widgetOrder.length > 0 && (
              <div className="grid gap-1 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 grid-flow-row-dense auto-rows-auto">
                {widgetOrder.map((id, index) => {
                  const widget = widgetRenderers[id];
                  if (!widget) return null;
                  const isDragging = draggingWidget === id;
                  const isDropTarget = dropTargetWidget === id;

                  const isStatCard = id.startsWith("stat-");

                  // Determine columns in a 6-col grid
                  let defaultCols = isStatCard ? 1 : 2;
                  const maxCols = isStatCard ? 2 : 6;

                  if (widget.colSpan.includes("col-span-2")) { defaultCols = 4; }
                  if (widget.colSpan.includes("col-span-3")) { defaultCols = 6; }

                  const effectiveCols = widgetWidths[id] || defaultCols;
                  const spanClass = getColSpanClass(effectiveCols, isStatCard);

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
                      className={`relative group cursor-grab active:cursor-grabbing transition-all duration-200 overflow-hidden rounded-lg ${spanClass} ${isDragging ? "opacity-40 scale-[0.98] z-50" : ""
                        } ${isDropTarget ? "ring-2 ring-amber-500 ring-offset-0" : ""}`}
                    >
                      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); cycleWidgetWidth(id, defaultCols, maxCols); }}
                          className="p-0.5 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400 transition-colors"
                          title={`Resize Widget (1-${maxCols} Columns)`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                        </button>
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
            {widgetOrder.length === 0 && (
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
          <AgentMap
            projectName={currentOrg?.name || "Organization"}
            agents={agents.map((a) => {
              const activeJob = allJobs.find(j => j.takenByAgentId === a.id && j.status === 'in_progress');
              const agentJobs = allJobs.filter(j => j.takenByAgentId === a.id);
              const parseReward = (r?: string) => { if (!r) return 0; const n = parseFloat(r.replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };
              const agentCost = agentJobs.reduce((s, j) => s + parseReward(j.reward), 0);
              return {
                id: a.id,
                name: a.name,
                type: a.type,
                status: activeJob ? 'busy' : a.status,
                activeJobName: activeJob?.title,
                assignedCost: agentCost,
              };
            })}
            tasks={allTasks.map((t) => ({ id: t.id, status: t.status, assigneeAgentId: t.assigneeAgentId }))}
            jobs={allJobs.map((j) => ({ id: j.id, title: j.title, reward: j.reward, priority: j.priority, requiredSkills: j.requiredSkills ?? [], status: j.status }))}
            onDispatch={handleDispatch}
            onAssign={handleAssign}
            executing={dispatching}
            currencySymbol={currencySymbol}
          />
        </TabsContent>
      </Tabs>

      {/* ═══════════════ Widget Catalog Dialog ═══════════════ */}
      <Dialog open={showCatalog} onOpenChange={setShowCatalog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Widget Catalog</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {(["widgets", "stats", "integrations"] as const).map((cat) => {
              const label = { widgets: "Widgets", stats: "Stat Cards", integrations: "Integrations" }[cat];
              const items = ALL_WIDGET_CATALOG.filter(e => e.category === cat);
              return (
                <div key={cat}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{label}</h3>
                  <div className="space-y-1">
                    {items.map((entry) => {
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
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
