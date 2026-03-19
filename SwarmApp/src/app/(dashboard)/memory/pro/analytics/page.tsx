/** Memory Pro Analytics — Retrieval performance, usage trends, and insights. */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    BarChart3, Search, Zap, Bot, AlertTriangle,
    Loader2, TrendingUp, Clock, Brain, Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import Link from "next/link";

interface AnalyticsData {
    ok: boolean;
    period: {
        totalQueries: number;
        totalWrites: number;
        avgConfidence: number;
        avgRetrievalTimeMs: number;
    };
    daily: {
        date: string;
        totalQueries: number;
        totalMemoriesWritten: number;
        uniqueAgents: number;
        avgConfidence: number;
    }[];
    topAgents: { agentId: string; agentName?: string; queryCount: number }[];
    staleCount: number;
    growth: {
        entriesThisWeek: number;
        entriesLastWeek: number;
        growthPercent: number;
    };
    spaces: { spaceId: string; name: string; entryCount: number }[];
}

function StatCard({ icon: Icon, label, value, sub, color }: {
    icon: typeof BarChart3; label: string; value: string; sub?: string; color: string;
}) {
    return (
        <Card className="p-4 bg-card/80 border-border">
            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${color}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold mt-0.5">{value}</p>
                    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
                </div>
            </div>
        </Card>
    );
}

function DailyBar({ value, max, label }: { value: number; max: number; label: string }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div className="flex items-end gap-1 flex-1" title={`${label}: ${value} queries`}>
            <div className="w-full flex flex-col items-center gap-0.5">
                <div
                    className="w-full bg-purple-500/60 rounded-t min-h-[2px]"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                />
                <span className="text-[8px] text-muted-foreground">{label.slice(-2)}</span>
            </div>
        </div>
    );
}

export default function AnalyticsPage() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [requiresSub, setRequiresSub] = useState(false);

    const load = useCallback(async () => {
        if (!currentOrg || !authAddress) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/v1/memory/pro/analytics?orgId=${currentOrg.id}`, {
                headers: { "x-wallet-address": authAddress },
            });
            if (res.status === 403) {
                setRequiresSub(true);
                setLoading(false);
                return;
            }
            if (!res.ok) throw new Error("Failed to load analytics");
            setData(await res.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [currentOrg, authAddress]);

    useEffect(() => { load(); }, [load]);

    if (!authAddress) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <BarChart3 className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to view analytics</p>
            </div>
        );
    }

    if (requiresSub) {
        return (
            <div className="max-w-[800px] mx-auto px-4 py-16 text-center">
                <Lock className="h-12 w-12 mx-auto text-purple-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Memory Pro Required</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Subscribe to Memory Pro to access retrieval analytics.
                </p>
                <Link href="/market" className="text-sm text-purple-400 hover:underline">
                    Go to Marketplace
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                        <BarChart3 className="h-6 w-6 text-purple-500" />
                    </div>
                    Memory Analytics
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                    Retrieval performance, usage trends, and memory health
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                </div>
            ) : error ? (
                <Card className="p-8 bg-card/80 border-border text-center">
                    <AlertTriangle className="h-8 w-8 mx-auto text-amber-400 mb-3" />
                    <p className="text-sm text-muted-foreground">{error}</p>
                </Card>
            ) : data ? (
                <div className="space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard
                            icon={Search}
                            label="Total Queries"
                            value={String(data.period.totalQueries)}
                            sub="last 30 days"
                            color="bg-purple-500/10 text-purple-400"
                        />
                        <StatCard
                            icon={Zap}
                            label="Avg Confidence"
                            value={`${(data.period.avgConfidence * 100).toFixed(0)}%`}
                            color="bg-emerald-500/10 text-emerald-400"
                        />
                        <StatCard
                            icon={Clock}
                            label="Avg Retrieval"
                            value={`${data.period.avgRetrievalTimeMs}ms`}
                            color="bg-blue-500/10 text-blue-400"
                        />
                        <StatCard
                            icon={TrendingUp}
                            label="Growth"
                            value={`${data.growth.growthPercent > 0 ? "+" : ""}${data.growth.growthPercent}%`}
                            sub={`${data.growth.entriesThisWeek} this week`}
                            color="bg-amber-500/10 text-amber-400"
                        />
                    </div>

                    {/* Daily Query Volume Chart */}
                    {data.daily.length > 0 && (
                        <Card className="p-5 bg-card/80 border-border">
                            <h3 className="text-sm font-medium mb-3">Daily Query Volume</h3>
                            <div className="flex items-end gap-[2px] h-24">
                                {(() => {
                                    const maxQueries = Math.max(...data.daily.map((d) => d.totalQueries), 1);
                                    return data.daily.slice(0, 30).reverse().map((d) => (
                                        <DailyBar
                                            key={d.date}
                                            value={d.totalQueries}
                                            max={maxQueries}
                                            label={d.date}
                                        />
                                    ));
                                })()}
                            </div>
                        </Card>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top Agents */}
                        <Card className="p-5 bg-card/80 border-border">
                            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <Bot className="h-4 w-4 text-purple-400" /> Top Agents
                            </h3>
                            {data.topAgents.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No agent queries yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.topAgents.map((a, i) => (
                                        <div key={a.agentId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                                                <span className="text-sm truncate max-w-[180px]">
                                                    {a.agentName || a.agentId}
                                                </span>
                                            </div>
                                            <Badge variant="outline" className="text-[9px]">
                                                {a.queryCount} queries
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* Space Breakdown */}
                        <Card className="p-5 bg-card/80 border-border">
                            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                Spaces
                            </h3>
                            {data.spaces.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No spaces yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.spaces.map((s) => (
                                        <div key={s.spaceId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20">
                                            <span className="text-sm truncate max-w-[180px]">{s.name}</span>
                                            <Badge variant="outline" className="text-[9px]">
                                                {s.entryCount} entries
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Stale Warning */}
                    {data.staleCount > 0 && (
                        <Card className="p-4 bg-card/80 border-border">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                                <span className="text-xs text-amber-400">
                                    {data.staleCount} stale memory entries detected (not accessed in 30+ days).
                                    Consider archiving or refreshing these entries.
                                </span>
                            </div>
                        </Card>
                    )}

                    {/* Writes Summary */}
                    <Card className="p-4 bg-card/80 border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-medium">Writes (30d)</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Total memory entries written in the last 30 days
                                </p>
                            </div>
                            <div className="text-2xl font-bold text-purple-400">
                                {data.period.totalWrites}
                            </div>
                        </div>
                    </Card>
                </div>
            ) : null}

            {/* Back to Dashboard */}
            <div className="mt-6">
                <Link href="/memory/pro" className="text-sm text-muted-foreground hover:text-purple-400 flex items-center gap-1">
                    <Brain className="h-3.5 w-3.5" /> Back to Memory Pro
                </Link>
            </div>
        </div>
    );
}
