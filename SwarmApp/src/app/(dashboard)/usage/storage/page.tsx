/** Storage Usage — Storacha decentralized storage analytics and quota tracking. */
"use client";

import { useState, useEffect, useCallback } from "react";
import { HardDrive, Database, Image, FileText, FileCode, FileBarChart, Lock, Loader2, AlertTriangle, Sparkles, Brain } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import Link from "next/link";

interface UsageData {
    usage: {
        orgId: string;
        totalMemoryEntries: number;
        totalArtifacts: number;
        totalCidLinks: number;
        totalSizeBytes: number;
        memoryBreakdown: Record<string, { count: number; sizeBytes: number }>;
        artifactBreakdown: Record<string, { count: number; sizeBytes: number }>;
        encryptedCount: number;
    };
    quota: {
        maxStorageBytes: number;
        maxArtifactSizeBytes: number;
        maxMemoryEntries: number;
        maxArtifactRecords: number;
    };
    usagePercent: number;
    withinQuota: boolean;
}

function fmtSize(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
    icon: typeof HardDrive; label: string; value: string; sub?: string; color: string;
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

function UsageBar({ used, max, label, color }: { used: number; max: number; label: string; color: string }) {
    const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
    const isWarning = pct > 80;
    const isCritical = pct > 95;

    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={isCritical ? "text-red-400" : isWarning ? "text-amber-400" : "text-muted-foreground"}>
                    {pct.toFixed(1)}%
                </span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : color}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{typeof used === "number" && used > 1000 ? fmtSize(used) : used.toLocaleString()}</span>
                <span>{typeof max === "number" && max > 1000 ? fmtSize(max) : max.toLocaleString()}</span>
            </div>
        </div>
    );
}

const MEMORY_ICONS: Record<string, { icon: typeof Database; label: string; color: string }> = {
    journal: { icon: FileText, label: "Journal", color: "text-blue-400" },
    long_term: { icon: Database, label: "Long-term", color: "text-purple-400" },
    workspace: { icon: FileCode, label: "Workspace", color: "text-amber-400" },
    vector: { icon: Database, label: "Vector", color: "text-emerald-400" },
};

const ARTIFACT_ICONS: Record<string, { icon: typeof Image; label: string; color: string }> = {
    screenshot: { icon: Image, label: "Screenshots", color: "text-blue-400" },
    output: { icon: FileCode, label: "Outputs", color: "text-emerald-400" },
    log: { icon: FileText, label: "Logs", color: "text-amber-400" },
    report: { icon: FileBarChart, label: "Reports", color: "text-purple-400" },
};

export default function StorageUsagePage() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [data, setData] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!currentOrg || !authAddress) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/v1/storacha/usage?orgId=${currentOrg.id}`, {
                headers: { "x-wallet-address": authAddress },
            });
            if (!res.ok) throw new Error("Failed to load storage usage");
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
                <HardDrive className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to view storage usage</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                        <HardDrive className="h-6 w-6 text-purple-500" />
                    </div>
                    Storacha Storage
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                    Decentralized storage powered by Protocol Labs — IPFS, encrypted artifacts, and agent memory
                </p>

                {/* Feature Tabs */}
                <div className="flex gap-2 mt-4">
                    <div className="px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-sm font-medium">
                        Overview
                    </div>
                    <Link
                        href="/memory"
                        className="px-4 py-2 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-purple-500/30 text-sm font-medium transition-all flex items-center gap-2"
                    >
                        <Database className="h-3.5 w-3.5" />
                        Memory Browser
                    </Link>
                    <Link
                        href="/memory/pro"
                        className="px-4 py-2 rounded-lg bg-card/50 border border-border hover:bg-card hover:border-amber-500/30 text-sm font-medium transition-all flex items-center gap-2"
                    >
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                        Premium Features
                        <Badge className="ml-1 bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0">Free for Hackathon</Badge>
                    </Link>
                </div>
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
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard
                            icon={HardDrive}
                            label="Total Storage"
                            value={fmtSize(data.usage.totalSizeBytes)}
                            sub={`${data.usagePercent}% of quota`}
                            color="bg-purple-500/10 text-purple-400"
                        />
                        <StatCard
                            icon={Database}
                            label="Memory Entries"
                            value={data.usage.totalMemoryEntries.toLocaleString()}
                            sub={`of ${data.quota.maxMemoryEntries.toLocaleString()}`}
                            color="bg-blue-500/10 text-blue-400"
                        />
                        <StatCard
                            icon={Image}
                            label="Artifacts"
                            value={data.usage.totalArtifacts.toLocaleString()}
                            sub={`of ${data.quota.maxArtifactRecords.toLocaleString()}`}
                            color="bg-emerald-500/10 text-emerald-400"
                        />
                        <StatCard
                            icon={Lock}
                            label="Encrypted"
                            value={data.usage.encryptedCount.toLocaleString()}
                            sub="artifacts"
                            color="bg-amber-500/10 text-amber-400"
                        />
                    </div>

                    {/* Quota Bars */}
                    <Card className="p-5 bg-card/80 border-border space-y-4">
                        <h3 className="text-sm font-medium">Quota Usage</h3>
                        <UsageBar
                            used={data.usage.totalSizeBytes}
                            max={data.quota.maxStorageBytes}
                            label="Storage"
                            color="bg-purple-500"
                        />
                        <UsageBar
                            used={data.usage.totalMemoryEntries}
                            max={data.quota.maxMemoryEntries}
                            label="Memory Entries"
                            color="bg-blue-500"
                        />
                        <UsageBar
                            used={data.usage.totalArtifacts}
                            max={data.quota.maxArtifactRecords}
                            label="Artifacts"
                            color="bg-emerald-500"
                        />
                        {!data.withinQuota && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                                <span className="text-xs text-red-400">
                                    Storage quota exceeded. New uploads will be rejected until space is freed.
                                </span>
                            </div>
                        )}
                    </Card>

                    {/* Breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Memory Breakdown */}
                        <Card className="p-5 bg-card/80 border-border">
                            <h3 className="text-sm font-medium mb-3">Memory by Type</h3>
                            <div className="space-y-2">
                                {Object.entries(data.usage.memoryBreakdown).map(([type, stats]) => {
                                    const cfg = MEMORY_ICONS[type];
                                    if (!cfg) return null;
                                    const Icon = cfg.icon;
                                    return (
                                        <div key={type} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20">
                                            <div className="flex items-center gap-2">
                                                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                                                <span className="text-sm">{cfg.label}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                <span>{stats.count} entries</span>
                                                <Badge variant="outline" className="text-[9px]">{fmtSize(stats.sizeBytes)}</Badge>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        {/* Artifact Breakdown */}
                        <Card className="p-5 bg-card/80 border-border">
                            <h3 className="text-sm font-medium mb-3">Artifacts by Type</h3>
                            <div className="space-y-2">
                                {Object.entries(data.usage.artifactBreakdown).map(([type, stats]) => {
                                    const cfg = ARTIFACT_ICONS[type];
                                    if (!cfg) return null;
                                    const Icon = cfg.icon;
                                    return (
                                        <div key={type} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20">
                                            <div className="flex items-center gap-2">
                                                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                                                <span className="text-sm">{cfg.label}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                <span>{stats.count} files</span>
                                                <Badge variant="outline" className="text-[9px]">{fmtSize(stats.sizeBytes)}</Badge>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>

                    {/* Unique CIDs */}
                    <Card className="p-5 bg-card/80 border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-medium">Content-Addressed Objects</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Unique CIDs stored on IPFS via Storacha</p>
                            </div>
                            <div className="text-2xl font-bold text-purple-400">
                                {data.usage.totalCidLinks}
                            </div>
                        </div>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
