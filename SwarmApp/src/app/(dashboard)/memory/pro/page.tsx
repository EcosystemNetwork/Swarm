/** Memory Pro Dashboard — Premium memory management with smart retrieval. */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Brain, Search, Database, AlertTriangle, Loader2,
    Zap, BarChart3, Layers, ArrowRight, Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import Link from "next/link";

interface DashboardData {
    ok: boolean;
    spacesCount: number;
    spaces: { id: string; name: string; visibility: string; entryCount: number }[];
    recentQueries: {
        id: string;
        query: string;
        resultCount: number;
        topConfidence?: number;
        retrievalTimeMs: number;
        createdAt: string | null;
    }[];
    analytics: {
        totalQueries: number;
        totalWrites: number;
        avgConfidence: number;
        avgRetrievalTimeMs: number;
    };
    topAgents: { agentId: string; queryCount: number }[];
    staleCount: number;
    growth: {
        entriesThisWeek: number;
        entriesLastWeek: number;
        growthPercent: number;
    };
    storage: {
        totalSizeBytes: number;
        totalMemoryEntries: number;
        totalArtifacts: number;
    };
}

interface RetrievalResult {
    ok: boolean;
    query: string;
    results: {
        id: string;
        title: string;
        agentName?: string;
        type: string;
        confidence: number;
        scoreBreakdown: { textMatch: number; recency: number; agentMatch: number; tagBoost: number };
        tags?: string[];
        gatewayUrl: string;
        createdAt: string | null;
    }[];
    totalCandidates: number;
    deduplicated: number;
    retrievalTimeMs: number;
}

function fmtSize(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
    icon: typeof Brain; label: string; value: string; sub?: string; color: string;
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

export default function MemoryProDashboard() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [requiresSub, setRequiresSub] = useState(false);

    // Retrieval
    const [queryText, setQueryText] = useState("");
    const [searchResults, setSearchResults] = useState<RetrievalResult | null>(null);
    const [searching, setSearching] = useState(false);

    const load = useCallback(async () => {
        if (!currentOrg || !authAddress) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/v1/memory/pro/dashboard?orgId=${currentOrg.id}`, {
                headers: { "x-wallet-address": authAddress },
            });
            if (res.status === 403) {
                const body = await res.json();
                if (body.requiresSubscription) {
                    setRequiresSub(true);
                    setLoading(false);
                    return;
                }
            }
            if (!res.ok) throw new Error("Failed to load dashboard");
            setData(await res.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [currentOrg, authAddress]);

    useEffect(() => { load(); }, [load]);

    const handleSearch = async () => {
        if (!queryText.trim() || !currentOrg || !authAddress) return;
        setSearching(true);
        try {
            const res = await fetch("/api/v1/memory/pro/retrieve", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": authAddress,
                },
                body: JSON.stringify({
                    orgId: currentOrg.id,
                    query: queryText,
                    limit: 10,
                }),
            });
            if (!res.ok) throw new Error("Retrieval failed");
            setSearchResults(await res.json());
        } catch {
            setSearchResults(null);
        } finally {
            setSearching(false);
        }
    };

    if (!authAddress) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Brain className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to access Memory Pro</p>
            </div>
        );
    }

    if (requiresSub) {
        return (
            <div className="max-w-[800px] mx-auto px-4 py-16">
                <Card className="p-8 bg-card/80 border-border text-center">
                    <Lock className="h-12 w-12 mx-auto text-purple-500 mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Memory Pro</h2>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                        Premium memory management with smart retrieval, named spaces, permissions, and analytics.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <div className="p-3 rounded-lg bg-muted/20">
                            <Search className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                            <p className="text-xs font-medium">Smart Retrieval</p>
                            <p className="text-[10px] text-muted-foreground">Confidence-scored ranking</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/20">
                            <Layers className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                            <p className="text-xs font-medium">Memory Spaces</p>
                            <p className="text-[10px] text-muted-foreground">Team & project scoped</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/20">
                            <BarChart3 className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                            <p className="text-xs font-medium">Analytics</p>
                            <p className="text-[10px] text-muted-foreground">Retrieval insights</p>
                        </div>
                    </div>
                    <Link
                        href="/market"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
                    >
                        Subscribe in Marketplace <ArrowRight className="h-4 w-4" />
                    </Link>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                        <Brain className="h-6 w-6 text-purple-500" />
                    </div>
                    Memory Pro
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                        Free for Hackathon
                    </Badge>
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                    Premium memory management — smart retrieval, spaces, and analytics powered by Storacha
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
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard
                            icon={Layers}
                            label="Spaces"
                            value={String(data.spacesCount)}
                            color="bg-purple-500/10 text-purple-400"
                        />
                        <StatCard
                            icon={Search}
                            label="Queries (30d)"
                            value={String(data.analytics.totalQueries)}
                            sub={`${data.analytics.avgRetrievalTimeMs}ms avg`}
                            color="bg-blue-500/10 text-blue-400"
                        />
                        <StatCard
                            icon={Zap}
                            label="Avg Confidence"
                            value={`${(data.analytics.avgConfidence * 100).toFixed(0)}%`}
                            color="bg-emerald-500/10 text-emerald-400"
                        />
                        <StatCard
                            icon={Database}
                            label="Memory Entries"
                            value={data.storage.totalMemoryEntries.toLocaleString()}
                            sub={fmtSize(data.storage.totalSizeBytes)}
                            color="bg-amber-500/10 text-amber-400"
                        />
                    </div>

                    {/* Smart Retrieval */}
                    <Card className="p-5 bg-card/80 border-border">
                        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                            <Search className="h-4 w-4 text-purple-400" />
                            Smart Retrieval
                        </h3>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={queryText}
                                onChange={(e) => setQueryText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                placeholder="Search memory with confidence scoring..."
                                className="flex-1 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={searching || !queryText.trim()}
                                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                            >
                                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                            </button>
                        </div>

                        {searchResults && (
                            <div className="mt-4 space-y-2">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>
                                        {searchResults.results.length} results from {searchResults.totalCandidates} candidates
                                        {searchResults.deduplicated > 0 && ` (${searchResults.deduplicated} deduped)`}
                                    </span>
                                    <span>{searchResults.retrievalTimeMs}ms</span>
                                </div>
                                {searchResults.results.map((r) => (
                                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{r.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-muted-foreground">{r.type}</span>
                                                {r.agentName && (
                                                    <span className="text-[10px] text-muted-foreground">by {r.agentName}</span>
                                                )}
                                                {r.tags?.slice(0, 3).map((t) => (
                                                    <Badge key={t} variant="outline" className="text-[9px] px-1 py-0">{t}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-right ml-3">
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] ${r.confidence >= 0.7
                                                    ? "border-emerald-500/30 text-emerald-400"
                                                    : r.confidence >= 0.4
                                                        ? "border-amber-500/30 text-amber-400"
                                                        : "border-muted text-muted-foreground"
                                                    }`}
                                            >
                                                {(r.confidence * 100).toFixed(0)}%
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                                {searchResults.results.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        No results above confidence threshold
                                    </p>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* Quick Links */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Link href="/memory/pro/spaces">
                            <Card className="p-4 bg-card/80 border-border hover:border-purple-500/30 transition-colors cursor-pointer">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Layers className="h-5 w-5 text-purple-400" />
                                        <div>
                                            <p className="text-sm font-medium">Memory Spaces</p>
                                            <p className="text-[10px] text-muted-foreground">{data.spacesCount} spaces</p>
                                        </div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </Card>
                        </Link>
                        <Link href="/memory/pro/analytics">
                            <Card className="p-4 bg-card/80 border-border hover:border-purple-500/30 transition-colors cursor-pointer">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <BarChart3 className="h-5 w-5 text-purple-400" />
                                        <div>
                                            <p className="text-sm font-medium">Analytics</p>
                                            <p className="text-[10px] text-muted-foreground">Retrieval performance</p>
                                        </div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </Card>
                        </Link>
                    </div>

                    {/* Stale Warning */}
                    {data.staleCount > 0 && (
                        <Card className="p-4 bg-card/80 border-border">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                                <span className="text-xs text-amber-400">
                                    {data.staleCount} stale memory entries detected (not accessed in 30+ days)
                                </span>
                            </div>
                        </Card>
                    )}

                    {/* Growth */}
                    {data.growth && (
                        <Card className="p-4 bg-card/80 border-border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-medium">Growth</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {data.growth.entriesThisWeek} entries this week
                                        {data.growth.entriesLastWeek > 0 && ` vs ${data.growth.entriesLastWeek} last week`}
                                    </p>
                                </div>
                                <div className={`text-lg font-bold ${data.growth.growthPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {data.growth.growthPercent > 0 ? "+" : ""}{data.growth.growthPercent}%
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            ) : null}
        </div>
    );
}
