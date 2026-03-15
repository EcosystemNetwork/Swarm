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
import { GripVertical, RotateCcw, Plus, X, Check, FolderKanban, Bot, Target, CheckCircle2, Briefcase, ListTodo, BarChart3, Handshake, Users, Loader2, Pencil } from "lucide-react";
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
  ensureAgentGroupChat,
  sendMessage,
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
import { getCronJobs, createCronJob, updateCronJob, SCHEDULE_PRESETS, parseCronToHuman, type CronJob } from "@/lib/cron";
import type { DailySummary } from "@/lib/daily-summary";

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
import AgentMessagesWidget from "@/components/agent-messages-widget";
import AgentSessionsWidget from "@/components/agent-sessions-widget";
import CoordinatorDashboardWidget from "@/components/coordinator-dashboard-widget";

interface WidgetCatalogEntry {
  id: string;
  icon: string;
  label: string;
  description: string;
  colSpan?: string;
  category: "widgets" | "stats" | "analytics" | "operations" | "integrations";
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
  // Analytics
  { id: "widget-task-velocity", icon: "📊", label: "Task Velocity", description: "Task completion rate over time", colSpan: "lg:col-span-2", category: "analytics" },
  { id: "widget-cost-trend", icon: "💸", label: "Cost Trends", description: "Daily and weekly API cost analysis", colSpan: "lg:col-span-2", category: "analytics" },
  { id: "widget-agent-workload", icon: "⚖️", label: "Agent Workload", description: "Task distribution across agents", colSpan: "lg:col-span-2", category: "analytics" },
  { id: "widget-activity-heatmap", icon: "🔥", label: "Activity Heatmap", description: "Hourly activity patterns", colSpan: "lg:col-span-3", category: "analytics" },
  { id: "widget-performance-metrics", icon: "⚡", label: "Performance Metrics", description: "Response times and throughput stats", colSpan: "lg:col-span-2", category: "analytics" },
  { id: "widget-top-performers", icon: "🏆", label: "Top Performers", description: "Highest performing agents this week", colSpan: "", category: "analytics" },
  { id: "widget-error-rate", icon: "⚠️", label: "Error Rate", description: "Failed tasks and error trends", colSpan: "", category: "analytics" },
  { id: "widget-completion-time", icon: "⏱️", label: "Completion Time", description: "Average time to complete tasks", colSpan: "", category: "analytics" },
  // Operations
  { id: "widget-alerts", icon: "🚨", label: "Alert Center", description: "Critical warnings and notifications", colSpan: "lg:col-span-2", category: "operations" },
  { id: "widget-capacity", icon: "📈", label: "Capacity Planning", description: "Resource utilization forecasts", colSpan: "lg:col-span-2", category: "operations" },
  { id: "widget-deployments", icon: "🚀", label: "Recent Deployments", description: "Latest agent deployments and updates", colSpan: "", category: "operations" },
  { id: "widget-health-checks", icon: "❤️", label: "Health Checks", description: "System and integration health status", colSpan: "", category: "operations" },
  { id: "widget-rate-limits", icon: "🔒", label: "Rate Limits", description: "API rate limit usage and quotas", colSpan: "", category: "operations" },
  { id: "widget-audit-log", icon: "📝", label: "Audit Log", description: "Security and compliance event log", colSpan: "lg:col-span-2", category: "operations" },
  // Integrations
  { id: "widget-llm-usage", icon: "💰", label: "API Usage & Costs", description: "Live tracking of LLM token costs & rate limits", colSpan: "lg:col-span-2", category: "integrations" },
  { id: "widget-live-stream", icon: "Terminal", label: "Live Feed Stream", description: "Raw I/O stream of agent messages", colSpan: "lg:col-span-2", category: "integrations" },
  { id: "widget-cron-jobs", icon: "🕒", label: "Cron Jobs", description: "Manage background scheduled agent tasks", colSpan: "lg:col-span-2", category: "integrations" },
  { id: "widget-agent-messages", icon: "💬", label: "Agent Messages", description: "Structured agent-to-agent messages (a2a, coord, session)", colSpan: "lg:col-span-2", category: "integrations" },
  { id: "widget-agent-sessions", icon: "🔄", label: "Agent Sessions", description: "Active workflow sessions with multi-agent coordination", colSpan: "lg:col-span-2", category: "integrations" },
  { id: "widget-coordinators", icon: "🎯", label: "Coordinators", description: "Registered coordinator agents and their load status", colSpan: "lg:col-span-2", category: "integrations" },
];

const DEFAULT_ACTIVE_WIDGETS = [
  // Core dashboard
  "widget-daily-briefing",
  "widget-recent-tasks",
  "widget-quick-actions",
  "widget-recent-jobs",
  "widget-org-info",

  // Status & monitoring
  "widget-agent-status",
  "widget-task-breakdown",
  "widget-health-checks",
  "widget-system-vitals",

  // Analytics
  "widget-task-velocity",
  "widget-cost-trend",
  "widget-agent-workload",
  "widget-activity-heatmap",
  "widget-top-performers",
  "widget-performance-metrics",

  // Operations
  "widget-alerts",
  "widget-capacity",
  "widget-deployments",
  "widget-rate-limits",

  // Activity & logs
  "widget-activity-feed",
  "widget-audit-log",

  // Integrations
  "widget-llm-usage",
  "widget-agent-messages",
  "widget-agent-sessions",
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
    if (cols === 1) return "col-span-1 md:col-span-1 lg:col-span-1";
    return "col-span-1 md:col-span-2 lg:col-span-2";
  }

  switch (cols) {
    case 1: return "col-span-1 md:col-span-2 lg:col-span-1";
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

  // Daily Briefing state
  const [briefingCronJob, setBriefingCronJob] = useState<CronJob | null>(null);
  const [latestBriefing, setLatestBriefing] = useState<DailySummary | null>(null);
  const [briefingSetupMode, setBriefingSetupMode] = useState(false);
  const [briefingSchedule, setBriefingSchedule] = useState("0 9 * * *");
  const [briefingPrompt, setBriefingPrompt] = useState(
    "Generate a daily activity summary for the organization. Include task completion stats, agent activity highlights, any errors or failures, and key metrics like token usage and cost."
  );
  const [briefingSaving, setBriefingSaving] = useState(false);

  // Compute analytics data
  const taskVelocity = useMemo(() => computeTaskVelocity(allTasks), [allTasks]);
  const agentWorkload = useMemo(() => computeAgentWorkload(allTasks, agents), [allTasks, agents]);
  const activityHeatmap = useMemo(() => computeActivityByHour(activityAll), [activityAll]);

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

      // Load daily briefing cron job + latest summary
      try {
        const cronJobs = await getCronJobs(currentOrg.id);
        const briefingJob = cronJobs.find(j => j.name === "Daily Briefing" && j.enabled);
        setBriefingCronJob(briefingJob || null);
        if (briefingJob) {
          const res = await fetch(`/api/summaries?orgId=${currentOrg.id}&limit=1`);
          if (res.ok) {
            const data = await res.json();
            if (data.summaries?.length > 0) setLatestBriefing(data.summaries[0]);
          }
        }
      } catch {
        // Briefing data is non-critical
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

  // ── Daily Briefing setup/edit handler ──
  const handleBriefingSetup = useCallback(async () => {
    if (!currentOrg || !account) return;
    setBriefingSaving(true);
    try {
      const slot = swarmSlots["daily-briefings"];
      const briefingAgent = slot ? agents.find(a => a.id === slot.agentId) : null;
      const scheduleLabel = parseCronToHuman(briefingSchedule);
      const isEditing = !!briefingCronJob;

      if (isEditing) {
        await updateCronJob(briefingCronJob.id, {
          message: briefingPrompt,
          schedule: briefingSchedule,
          scheduleLabel,
          agentIds: briefingAgent ? [briefingAgent.id] : undefined,
        });
      } else {
        await createCronJob({
          orgId: currentOrg.id,
          name: "Daily Briefing",
          message: briefingPrompt,
          schedule: briefingSchedule,
          scheduleLabel,
          agentIds: briefingAgent ? [briefingAgent.id] : undefined,
          priority: "medium",
          enabled: true,
          createdBy: account.address || "unknown",
        });
      }

      // Notify assigned briefing agent through Agent Hub
      if (briefingAgent) {
        ensureAgentGroupChat(currentOrg.id).then(hub => {
          const action = isEditing ? "updated" : "configured";
          sendMessage({
            channelId: hub.id,
            senderId: "system",
            senderName: "Swarm Protocol",
            senderType: "agent",
            content: [
              `📋 **Daily Briefing ${action}** — assigned to **@${briefingAgent.name}**`,
              ``,
              `**Schedule:** ${scheduleLabel}`,
              `**Prompt:** ${briefingPrompt}`,
              ``,
              `You are responsible for generating briefings on this schedule. Begin operations when ready.`,
            ].join("\n"),
            orgId: currentOrg.id,
            createdAt: new Date(),
          });
        }).catch(() => {});
      }

      setBriefingSetupMode(false);
      await loadDashboardData();
    } catch (err) {
      console.error("Failed to set up daily briefing:", err);
    } finally {
      setBriefingSaving(false);
    }
  }, [currentOrg, account, briefingSchedule, briefingPrompt, briefingCronJob, swarmSlots, agents, loadDashboardData]);

  // ── Open briefing editor pre-filled with current config ──
  const openBriefingEditor = useCallback(() => {
    if (briefingCronJob) {
      setBriefingSchedule(briefingCronJob.schedule);
      setBriefingPrompt(briefingCronJob.message);
    }
    setBriefingSetupMode(true);
  }, [briefingCronJob]);

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
          <CardHeader className="flex flex-row items-center justify-between px-2 pt-2 pb-1">
            <CardTitle className="text-sm">
              📋 <DecryptedText text="Recent Tasks" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
            </CardTitle>
            <Link href="/missions" className="text-xs">
              <ShinyText text="View all →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-xs" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-0.5 px-2 pb-2">
            {recentTasks.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
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
          <CardHeader className="flex flex-row items-center justify-between px-2 pt-2 pb-1">
            <CardTitle className="text-sm">
              💼 <DecryptedText text="Recent Jobs" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
            </CardTitle>
            <Link href="/jobs" className="text-xs">
              <ShinyText text="View all →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-xs" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-0.5 px-2 pb-2">
            {recentJobs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
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
          <CardHeader className="px-2 pt-2 pb-1">
            <CardTitle className="text-sm">
              ⚡ <DecryptedText text="Quick Actions" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-2 pb-2">
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
          <CardHeader className="px-2 pt-2 pb-1">
            <CardTitle className="text-sm">
              🏢 <DecryptedText text="Organization" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between px-2 pt-2 pb-1">
            <CardTitle className="text-sm">
              📜 <DecryptedText text="Activity Feed" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
            </CardTitle>
            <Link href="/activity" className="text-xs">
              <ShinyText text="View all →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-xs" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1 px-2 pb-2">
            {activityFeed.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
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
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">
                🟢 <DecryptedText text="Agent Status" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-2 pb-2">
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
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">
                📈 <DecryptedText text="Task Breakdown" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-2 pb-2">
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
    "widget-agent-messages": {
      label: "Agent Messages",
      colSpan: "lg:col-span-2",
      render: () => {
        // Get current user's agent (if any)
        const userAgent = agents.find(a => a.walletAddress === account?.address);
        if (!userAgent || !currentOrg) {
          return (
            <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
              <CardHeader className="px-2 pt-2 pb-1">
                <CardTitle className="text-sm">💬 Agent Messages</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">Register as an agent to view messages</p>
                  <Button asChild variant="outline" size="sm" className="mt-2">
                    <Link href="/agents">Register Agent</Link>
                  </Button>
                </div>
              </CardContent>
            </SpotlightCard>
          );
        }
        return <AgentMessagesWidget agentId={userAgent.id} orgId={currentOrg.id} />;
      },
    },
    "widget-agent-sessions": {
      label: "Agent Sessions",
      colSpan: "lg:col-span-2",
      render: () => {
        const userAgent = agents.find(a => a.walletAddress === account?.address);
        if (!userAgent || !currentOrg) {
          return (
            <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
              <CardHeader className="px-2 pt-2 pb-1">
                <CardTitle className="text-sm">🔄 Agent Sessions</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">Register as an agent to view sessions</p>
                  <Button asChild variant="outline" size="sm" className="mt-2">
                    <Link href="/agents">Register Agent</Link>
                  </Button>
                </div>
              </CardContent>
            </SpotlightCard>
          );
        }
        return <AgentSessionsWidget agentId={userAgent.id} orgId={currentOrg.id} />;
      },
    },
    "widget-coordinators": {
      label: "Coordinators",
      colSpan: "lg:col-span-2",
      render: () => {
        if (!currentOrg) return null;
        return <CoordinatorDashboardWidget orgId={currentOrg.id} />;
      },
    },
    "widget-daily-briefing": {
      label: "Daily Briefing",
      colSpan: "lg:col-span-3",
      render: () => {
        const slot = swarmSlots["daily-briefings"];
        const briefingAgent = slot ? agents.find(a => a.id === slot.agentId) : null;

        // ─── Setup / Edit mode: schedule picker + prompt editor ───
        if (briefingSetupMode) {
          const briefingPresets = SCHEDULE_PRESETS.filter(p =>
            ["daily", "weekly"].includes(p.type) || p.value === "0 */6 * * *"
          );
          const isEditing = !!briefingCronJob;
          return (
            <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
              <CardHeader className="px-2 pt-2 pb-1">
                <CardTitle className="text-sm">
                  📋 <DecryptedText text={isEditing ? "Edit Briefing" : "Set Up Daily Briefing"} speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2 space-y-3">
                {/* Schedule picker */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Schedule</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {briefingPresets.map((preset) => (
                      <button
                        key={preset.value + preset.label}
                        type="button"
                        onClick={() => setBriefingSchedule(preset.value)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left text-xs transition-all ${
                          briefingSchedule === preset.value
                            ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                            : "border-border hover:border-amber-500/30 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>{preset.icon}</span>
                        <span className="truncate">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt editor */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Briefing Prompt</p>
                  <textarea
                    value={briefingPrompt}
                    onChange={(e) => setBriefingPrompt(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20 resize-none"
                    placeholder="Describe what the briefing should include..."
                  />
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setBriefingSetupMode(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBriefingSetup}
                    disabled={briefingSaving || !briefingPrompt.trim()}
                    className="bg-amber-500 hover:bg-amber-600 text-black"
                  >
                    {briefingSaving ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</>
                    ) : isEditing ? (
                      "Save Changes"
                    ) : (
                      "Enable Briefings"
                    )}
                  </Button>
                </div>
              </CardContent>
            </SpotlightCard>
          );
        }

        // ─── Unconfigured: no cron job exists ───
        if (!briefingCronJob) {
          return (
            <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
              <CardHeader className="px-2 pt-2 pb-1">
                <CardTitle className="text-sm">
                  📋 <DecryptedText text="Daily Briefing" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <div className="text-center py-4 space-y-2">
                  <div className="text-4xl opacity-30">📋</div>
                  <p className="text-sm text-muted-foreground">Daily briefings are not configured</p>
                  <p className="text-xs text-muted-foreground/60">
                    {briefingAgent
                      ? "Set up a schedule to start receiving automated briefings."
                      : "Assign an agent in the Swarm inventory, then set up a schedule."}
                  </p>
                  <div className="flex justify-center gap-2 mt-2">
                    {!briefingAgent && (
                      <Button asChild variant="outline" size="sm">
                        <Link href="/swarm">Go to Swarm</Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => setBriefingSetupMode(true)}
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      Set Up
                    </Button>
                  </div>
                </div>
              </CardContent>
            </SpotlightCard>
          );
        }

        // ─── Configured: show latest summary data ───
        const scheduleLabel = briefingCronJob.scheduleLabel || parseCronToHuman(briefingCronJob.schedule);
        const summary = latestBriefing?.summary;

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between px-2 pt-2 pb-1">
              <CardTitle className="text-sm">
                📋 <DecryptedText text="Daily Briefing" speed={30} maxIterations={6} animateOn="view" sequential className="text-sm font-semibold" encryptedClassName="text-sm font-semibold text-amber-500/40" />
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 border-amber-500/20 text-amber-400">
                  {scheduleLabel}
                </Badge>
                <button
                  onClick={openBriefingEditor}
                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit briefing settings"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <Link href="/summaries" className="text-xs">
                  <ShinyText text="View All →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-xs" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-2 space-y-2">
              {/* Agent badge */}
              {briefingAgent && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <img
                    src={briefingAgent.avatarUrl || getAgentAvatarUrl(briefingAgent.name, briefingAgent.type)}
                    alt={briefingAgent.name}
                    className="w-8 h-8 rounded-full border-2 border-amber-500/30"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{briefingAgent.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Briefing Agent · {latestBriefing?.date || new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </p>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${briefingAgent.status === "online" ? "bg-emerald-400" : briefingAgent.status === "busy" ? "bg-amber-400" : "bg-gray-400"}`} />
                </div>
              )}

              {/* Summary data from Firestore */}
              {summary ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base">✅</span>
                    <span className="text-muted-foreground">Tasks completed:</span>
                    <span className="font-medium text-emerald-400">{summary.tasksCompleted}</span>
                    {summary.tasksFailed > 0 && (
                      <span className="text-red-400 text-xs">({summary.tasksFailed} failed)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base">🪙</span>
                    <span className="text-muted-foreground">Tokens used:</span>
                    <span className="font-medium">{(summary.tokensUsed / 1000).toFixed(1)}K</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base">💰</span>
                    <span className="text-muted-foreground">Cost:</span>
                    <span className="font-medium">${summary.costUsd.toFixed(4)}</span>
                  </div>

                  {/* Highlights */}
                  {summary.highlights.length > 0 && (
                    <div className="pt-2 border-t border-border space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Highlights</p>
                      {summary.highlights.map((h, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="shrink-0">✨</span>
                          <span className="text-muted-foreground truncate">{h}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top Activities */}
                  {summary.topActivities.length > 0 && (
                    <div className="pt-2 border-t border-border space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Top Activities</p>
                      {summary.topActivities.slice(0, 3).map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="shrink-0">🎯</span>
                          <span className="text-muted-foreground truncate flex-1">{a.details}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Errors */}
                  {summary.errors.length > 0 && (
                    <div className="pt-2 border-t border-border space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider text-red-400">Errors</p>
                      {summary.errors.slice(0, 2).map((e, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-red-400/80">
                          <span className="shrink-0">⚠️</span>
                          <span className="truncate">{e.lastError}</span>
                          <Badge variant="outline" className="text-[8px] px-1 border-red-500/20">{e.count}x</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Cron job exists but no summary generated yet */
                <div className="text-center py-3 space-y-1">
                  <p className="text-sm text-muted-foreground">No briefing generated yet</p>
                  <p className="text-xs text-muted-foreground/60">
                    Schedule: {scheduleLabel}. Summaries will appear here automatically.
                  </p>
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

    // Analytics Widgets
    "widget-task-velocity": {
      label: "Task Velocity",
      colSpan: "lg:col-span-2",
      render: () => <TaskVelocityChart data={taskVelocity} />,
    },
    "widget-cost-trend": {
      label: "Cost Trends",
      colSpan: "lg:col-span-2",
      render: () => <CostTrendChart data={dailyCosts} />,
    },
    "widget-agent-workload": {
      label: "Agent Workload",
      colSpan: "lg:col-span-2",
      render: () => <AgentWorkloadChart data={agentWorkload} />,
    },
    "widget-activity-heatmap": {
      label: "Activity Heatmap",
      colSpan: "lg:col-span-3",
      render: () => <ActivityHeatmapChart data={activityHeatmap} />,
    },
    "widget-performance-metrics": {
      label: "Performance Metrics",
      colSpan: "lg:col-span-2",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
          <CardHeader className="px-2 pt-2 pb-1">
            <CardTitle className="text-sm">⚡ Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">Avg Response Time</span>
                <span className="text-sm font-medium">342ms</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">Throughput</span>
                <span className="text-sm font-medium">1.2k msg/hr</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">Success Rate</span>
                <span className="text-sm font-medium text-emerald-400">98.3%</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">Uptime</span>
                <span className="text-sm font-medium text-emerald-400">99.99%</span>
              </div>
            </div>
          </CardContent>
        </SpotlightCard>
      ),
    },
    "widget-top-performers": {
      label: "Top Performers",
      colSpan: "",
      render: () => {
        const sortedAgents = [...agents]
          .filter(a => a.tasksCompleted && a.tasksCompleted > 0)
          .sort((a, b) => (b.tasksCompleted || 0) - (a.tasksCompleted || 0))
          .slice(0, 5);

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">🏆 Top Performers</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {sortedAgents.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">No completed tasks yet</div>
              ) : (
                <div className="space-y-2">
                  {sortedAgents.map((agent, index) => (
                    <div key={agent.id} className="flex items-center gap-2 py-1">
                      <span className="text-lg">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅'}</span>
                      <span className="text-xs truncate flex-1">{agent.name}</span>
                      <Badge variant="outline" className="text-[10px]">{agent.tasksCompleted}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "widget-error-rate": {
      label: "Error Rate",
      colSpan: "",
      render: () => {
        const errorRate = 1.7; // Mock data
        const trend = -0.3;
        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">⚠️ Error Rate</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div className="space-y-2">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-400">{errorRate}%</div>
                  <div className="text-xs text-muted-foreground">Last 24 hours</div>
                </div>
                <div className="flex items-center justify-center gap-1 text-xs">
                  <span className="text-emerald-400">↓ {Math.abs(trend)}%</span>
                  <span className="text-muted-foreground">vs yesterday</span>
                </div>
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <div className="flex justify-between py-1">
                    <span>Failed tasks:</span>
                    <span className="font-medium">12</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Retries:</span>
                    <span className="font-medium">8</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "widget-completion-time": {
      label: "Completion Time",
      colSpan: "",
      render: () => {
        const avgTime = "2.4h"; // Mock data
        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">⏱️ Avg Completion</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div className="space-y-2">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-400">{avgTime}</div>
                  <div className="text-xs text-muted-foreground">Per task</div>
                </div>
                <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Fastest:</span>
                    <span className="font-medium text-emerald-400">12m</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Slowest:</span>
                    <span className="font-medium text-orange-400">8.2h</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </SpotlightCard>
        );
      },
    },

    // Operations Widgets
    "widget-alerts": {
      label: "Alert Center",
      colSpan: "lg:col-span-2",
      render: () => {
        const alerts = [
          { id: 1, severity: "warning", message: "Agent capacity at 85%", time: "5m ago" },
          { id: 2, severity: "info", message: "System update scheduled for 2AM", time: "1h ago" },
        ];

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">🚨 Alert Center</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {alerts.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">No active alerts</div>
              ) : (
                <div className="space-y-2">
                  {alerts.map(alert => (
                    <div key={alert.id} className="flex items-start gap-2 p-2 rounded border border-border">
                      <span className="text-base mt-0.5">{alert.severity === "warning" ? "⚠️" : "ℹ️"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{alert.message}</p>
                        <p className="text-[10px] text-muted-foreground">{alert.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "widget-capacity": {
      label: "Capacity Planning",
      colSpan: "lg:col-span-2",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
          <CardHeader className="px-2 pt-2 pb-1">
            <CardTitle className="text-sm">📈 Capacity Planning</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Agent Utilization</span>
                  <span className="font-medium">68%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: '68%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Task Queue</span>
                  <span className="font-medium">42%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400" style={{ width: '42%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">API Rate Limit</span>
                  <span className="font-medium">15%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400" style={{ width: '15%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </SpotlightCard>
      ),
    },
    "widget-deployments": {
      label: "Recent Deployments",
      colSpan: "",
      render: () => {
        const deployments = agents.slice(0, 3).map(agent => ({
          name: agent.name,
          time: "Just now",
          status: "success",
        }));

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">🚀 Deployments</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {deployments.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">No recent deployments</div>
              ) : (
                <div className="space-y-2">
                  {deployments.map((deploy, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-400">✓</span>
                      <span className="truncate flex-1">{deploy.name}</span>
                      <span className="text-muted-foreground text-[10px]">{deploy.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "widget-health-checks": {
      label: "Health Checks",
      colSpan: "",
      render: () => {
        const services = [
          { name: "WebSocket Hub", status: "healthy", uptime: "99.9%" },
          { name: "Database", status: "healthy", uptime: "100%" },
          { name: "Redis Cache", status: "healthy", uptime: "99.8%" },
          { name: "Pub/Sub", status: "degraded", uptime: "98.1%" },
        ];

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="px-2 pt-2 pb-1">
              <CardTitle className="text-sm">❤️ System Health</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div className="space-y-2">
                {services.map((service, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${service.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="truncate">{service.name}</span>
                    </div>
                    <span className="text-muted-foreground text-[10px]">{service.uptime}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </SpotlightCard>
        );
      },
    },
    "widget-rate-limits": {
      label: "Rate Limits",
      colSpan: "",
      render: () => (
        <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
          <CardHeader className="px-2 pt-2 pb-1">
            <CardTitle className="text-sm">🔒 Rate Limits</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>OpenAI API</span>
                  <span className="font-medium">2.4k / 10k</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: '24%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Anthropic API</span>
                  <span className="font-medium">8.2k / 10k</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: '82%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Webhook Calls</span>
                  <span className="font-medium">142 / 1k</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: '14%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </SpotlightCard>
      ),
    },
    "widget-audit-log": {
      label: "Audit Log",
      colSpan: "lg:col-span-2",
      render: () => {
        const auditEvents = activityFeed.slice(0, 5);

        return (
          <SpotlightCard className="p-0 glass-card-enhanced h-full overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between px-2 pt-2 pb-1">
              <CardTitle className="text-sm">📝 Audit Log</CardTitle>
              <Link href="/activity" className="text-xs">
                <ShinyText text="View all →" speed={3} color="#b5954a" shineColor="#FFD700" className="text-xs" />
              </Link>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {auditEvents.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">No audit events</div>
              ) : (
                <div className="space-y-1.5">
                  {auditEvents.map(event => {
                    const config = EVENT_TYPE_CONFIG[event.eventType] || { icon: "📌", color: "text-muted-foreground" };
                    return (
                      <div key={event.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                        <span className="text-sm mt-0.5">{config.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{event.description}</p>
                          <p className="text-[10px] text-muted-foreground">{formatRelativeTime(event.createdAt)}</p>
                        </div>
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
      <div className="space-y-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">Dashboard</h1>
          <p className="text-muted-foreground text-xs">No organization selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">{greeting}</h1>
          <p className="text-muted-foreground text-xs">{currentOrg.name}</p>
        </div>
        {/* Skeleton grid matching widget layout */}
        <div className="grid gap-0.5 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 grid-flow-row-dense auto-rows-auto">
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
      <div className="space-y-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">{greeting}</h1>
          <p className="text-muted-foreground text-xs">{currentOrg.name}</p>
        </div>
        <div className="flex items-center justify-center py-8">
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
    <div className="space-y-0.5">
      {/* Dashboard header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-lg font-bold tracking-tight leading-tight">{greeting}</h1>
          <p className="text-muted-foreground text-[10px]">{currentOrg.name}</p>
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

      <Tabs value={dashTab} onValueChange={setDashTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="swarm">Agent Map</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <div>

            {/* ═══ Draggable Main Widgets ═══ */}
            {widgetOrder.length > 0 && (
              <div className="grid gap-0.5 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 grid-flow-row-dense auto-rows-auto">
                {widgetOrder.map((id, index) => {
                  const widget = widgetRenderers[id];
                  if (!widget) return null;
                  const isDragging = draggingWidget === id;
                  const isDropTarget = dropTargetWidget === id;

                  const isStatCard = id.startsWith("stat-");

                  // Determine columns in a 6-col grid
                  let defaultCols = isStatCard ? 1 : 2;
                  const maxCols = isStatCard ? 2 : 6;

                  if (widget.colSpan.includes("col-span-2")) { defaultCols = 3; }
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
              <div className="text-center py-8 text-muted-foreground">
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
            {(["widgets", "stats", "analytics", "operations", "integrations"] as const).map((cat) => {
              const label = { widgets: "Widgets", stats: "Stat Cards", analytics: "Analytics", operations: "Operations", integrations: "Integrations" }[cat];
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
