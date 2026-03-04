/** Metrics — Platform performance indicators and operational statistics. */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    BarChart3, TrendingUp, Users, CheckCircle2, Clock,
    Loader2, Shield, Zap, Trophy, Target,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/contexts/OrgContext";
import { useActiveAccount } from "thirdweb/react";
import { getPendingCount } from "@/lib/approvals";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface Metrics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    completionRate: number;
    activeAgents: number;
    totalAgents: number;
    pendingApprovals: number;
    jobsDispatched: number;
    avgDurationMin: number;
}

interface AgentLeaderboard {
    agentId: string;
    agentName: string;
    tasksCompleted: number;
    successRate: number;
}

// ═══════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════

function KpiCard({
    label, value, subLabel, icon: Icon, iconColor, iconBg,
}: {
    label: string;
    value: string | number;
    subLabel?: string;
    icon: typeof BarChart3;
    iconColor: string;
    iconBg: string;
}) {
    return (
        <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <div>
                    <p className="text-2xl font-bold tracking-tight">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    {subLabel && <p className="text-[10px] text-muted-foreground">{subLabel}</p>}
                </div>
            </div>
        </Card>
    );
}

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function MetricsPage() {
    const { currentOrg } = useOrg();
    const account = useActiveAccount();
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
    const [metrics, setMetrics] = useState<Metrics>({
        totalTasks: 0, completedTasks: 0, failedTasks: 0, completionRate: 0,
        activeAgents: 0, totalAgents: 0, pendingApprovals: 0, jobsDispatched: 0, avgDurationMin: 0,
    });

    const loadMetrics = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const pending = await getPendingCount(currentOrg.id);
            // In production, these would come from aggregated Firestore queries.
            // For now, we show the pending approvals count plus placeholder KPIs.
            setMetrics({
                totalTasks: 0,
                completedTasks: 0,
                failedTasks: 0,
                completionRate: 0,
                activeAgents: 0,
                totalAgents: 0,
                pendingApprovals: pending,
                jobsDispatched: 0,
                avgDurationMin: 0,
            });
        } catch (err) {
            console.error("Failed to load metrics:", err);
        } finally {
            setLoading(false);
        }
    }, [currentOrg]);

    useEffect(() => { loadMetrics(); }, [loadMetrics]);

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <BarChart3 className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to view metrics</p>
            </div>
        );
    }

    const ranges = [
        { key: "24h" as const, label: "24 Hours" },
        { key: "7d" as const, label: "7 Days" },
        { key: "30d" as const, label: "30 Days" },
    ];

    return (
        <div className="max-w-6xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <BarChart3 className="h-6 w-6 text-amber-500" />
                        </div>
                        Metrics
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Operational KPIs — task throughput, agent performance, approval turnaround
                    </p>
                </div>

                {/* Time range */}
                <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
                    {ranges.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setRange(key)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${range === key
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                </div>
            ) : (
                <>
                    {/* KPI Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <KpiCard
                            label="Total Tasks"
                            value={metrics.totalTasks}
                            icon={Target}
                            iconColor="text-blue-400"
                            iconBg="bg-blue-500/10"
                        />
                        <KpiCard
                            label="Completion Rate"
                            value={`${metrics.completionRate}%`}
                            subLabel={`${metrics.completedTasks} completed`}
                            icon={CheckCircle2}
                            iconColor="text-emerald-400"
                            iconBg="bg-emerald-500/10"
                        />
                        <KpiCard
                            label="Active Agents"
                            value={metrics.activeAgents}
                            subLabel={`of ${metrics.totalAgents} total`}
                            icon={Users}
                            iconColor="text-purple-400"
                            iconBg="bg-purple-500/10"
                        />
                        <KpiCard
                            label="Pending Approvals"
                            value={metrics.pendingApprovals}
                            icon={Shield}
                            iconColor="text-amber-400"
                            iconBg="bg-amber-500/10"
                        />
                    </div>

                    {/* Secondary KPIs */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <KpiCard
                            label="Jobs Dispatched"
                            value={metrics.jobsDispatched}
                            icon={Zap}
                            iconColor="text-cyan-400"
                            iconBg="bg-cyan-500/10"
                        />
                        <KpiCard
                            label="Failed Tasks"
                            value={metrics.failedTasks}
                            icon={TrendingUp}
                            iconColor="text-red-400"
                            iconBg="bg-red-500/10"
                        />
                        <KpiCard
                            label="Avg Duration"
                            value={metrics.avgDurationMin > 0 ? `${metrics.avgDurationMin}m` : "—"}
                            icon={Clock}
                            iconColor="text-amber-400"
                            iconBg="bg-amber-500/10"
                        />
                    </div>

                    {/* Agent Leaderboard Placeholder */}
                    <Card className="bg-card border-border">
                        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-amber-500" />
                            <span className="text-sm font-semibold">Agent Leaderboard</span>
                            <Badge variant="outline" className="text-[10px] ml-auto">Coming soon</Badge>
                        </div>
                        <div className="p-8 text-center">
                            <Trophy className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                            <p className="text-sm text-muted-foreground">
                                Agent rankings will appear here as tasks are completed.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Track tasks completed, success rate, and avg response time per agent.
                            </p>
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
