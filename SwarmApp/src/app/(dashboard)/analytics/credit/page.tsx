/**
 * Org Credit Dashboard — Overview of all agents' credit scores in the current org.
 *
 * Shows summary stats, tier distribution, agent table, and recent credit events.
 * Route: /analytics/credit
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/analytics/stat-card";
import { TierBadgeTooltip } from "@/components/credit/tier-badge-tooltip";
import { ConfidenceIndicator } from "@/components/credit/confidence-indicator";
import { useOrg } from "@/contexts/OrgContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Agent } from "@/lib/firestore";
import {
    CREDIT_TIERS,
    getTierForScore,
    getConfidenceInfo,
    CREDIT_SCORE_DEFAULT,
    TRUST_SCORE_DEFAULT,
    type TierName,
} from "@/lib/credit-tiers";

interface AgentCreditRow {
    id: string;
    name: string;
    type: string;
    status: string;
    credit: number;
    trust: number;
    tierName: TierName;
    eventCount: number;
    asn?: string;
}

type SortKey = "name" | "credit" | "trust" | "tierName";

export default function OrgCreditDashboardPage() {
    const { currentOrg } = useOrg();
    const router = useRouter();
    const [agents, setAgents] = useState<AgentCreditRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>("credit");
    const [sortAsc, setSortAsc] = useState(false);

    useEffect(() => {
        if (!currentOrg?.id) return;

        const fetchAgents = async () => {
            setLoading(true);
            try {
                const q = query(collection(db, "agents"), where("orgId", "==", currentOrg.id));
                const snapshot = await getDocs(q);
                const rows: AgentCreditRow[] = snapshot.docs.map((d) => {
                    const data = d.data() as Agent;
                    const credit = data.creditScore ?? CREDIT_SCORE_DEFAULT;
                    const tier = getTierForScore(credit);
                    return {
                        id: d.id,
                        name: data.name,
                        type: data.type,
                        status: data.status,
                        credit,
                        trust: data.trustScore ?? TRUST_SCORE_DEFAULT,
                        tierName: tier.name,
                        eventCount: (data as unknown as Record<string, unknown>).scoreEventCount as number || 0,
                        asn: data.asn,
                    };
                });
                setAgents(rows);
            } catch (err) {
                console.error("Failed to load agents:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAgents();
    }, [currentOrg]);

    // Sort agents
    const sorted = [...agents].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
            case "name":
                cmp = a.name.localeCompare(b.name);
                break;
            case "credit":
                cmp = a.credit - b.credit;
                break;
            case "trust":
                cmp = a.trust - b.trust;
                break;
            case "tierName": {
                const tierOrder: Record<TierName, number> = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3 };
                cmp = tierOrder[a.tierName] - tierOrder[b.tierName];
                break;
            }
        }
        return sortAsc ? cmp : -cmp;
    });

    // Compute summary stats
    const avgCredit = agents.length
        ? Math.round(agents.reduce((s, a) => s + a.credit, 0) / agents.length)
        : 0;
    const avgTrust = agents.length
        ? Math.round(agents.reduce((s, a) => s + a.trust, 0) / agents.length)
        : 0;

    const tierCounts: Record<TierName, number> = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
    for (const a of agents) {
        tierCounts[a.tierName]++;
    }

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(false);
        }
    };

    if (!currentOrg) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold">Credit Dashboard</h1>
                <p className="text-muted-foreground">No organization selected</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Credit Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    Organization-wide credit score overview and agent tier distribution
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center min-h-[40vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatCard
                            title="Avg Credit Score"
                            value={String(avgCredit)}
                            icon="📊"
                        />
                        <StatCard
                            title="Avg Trust Score"
                            value={String(avgTrust)}
                            icon="🛡️"
                        />
                        <StatCard
                            title="Total Agents"
                            value={String(agents.length)}
                            icon="🤖"
                        />
                        <StatCard
                            title="Gold+ Agents"
                            value={String(tierCounts.Gold + tierCounts.Platinum)}
                            icon="⭐"
                        />
                    </div>

                    {/* Tier Distribution */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Tier Distribution</CardTitle>
                            <CardDescription>Agent count per credit tier</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-4 gap-3">
                                {CREDIT_TIERS.slice().reverse().map((tier) => {
                                    const count = tierCounts[tier.name];
                                    const pct = agents.length ? Math.round((count / agents.length) * 100) : 0;
                                    return (
                                        <div key={tier.name} className="text-center">
                                            <div
                                                className="mx-auto mb-2 rounded-lg h-24 flex items-end justify-center"
                                                style={{ width: "100%" }}
                                            >
                                                <div
                                                    className="rounded-t-md w-12 transition-all duration-500"
                                                    style={{
                                                        height: `${Math.max(8, pct)}%`,
                                                        backgroundColor: tier.chartColor,
                                                        opacity: 0.8,
                                                    }}
                                                />
                                            </div>
                                            <Badge className={tier.badgeClass}>{tier.name}</Badge>
                                            <p className="text-lg font-bold mt-1">{count}</p>
                                            <p className="text-[10px] text-muted-foreground">{pct}%</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Agent Credit Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Agent Credit Scores</CardTitle>
                            <CardDescription>Click any agent to view detailed credit breakdown</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {agents.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    No agents in this organization
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th className="text-left py-2 px-2">
                                                    <button onClick={() => handleSort("name")} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                                                        Agent <ArrowUpDown className="h-3 w-3" />
                                                    </button>
                                                </th>
                                                <th className="text-left py-2 px-2">
                                                    <button onClick={() => handleSort("credit")} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                                                        Credit <ArrowUpDown className="h-3 w-3" />
                                                    </button>
                                                </th>
                                                <th className="text-left py-2 px-2">
                                                    <button onClick={() => handleSort("trust")} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                                                        Trust <ArrowUpDown className="h-3 w-3" />
                                                    </button>
                                                </th>
                                                <th className="text-left py-2 px-2">
                                                    <button onClick={() => handleSort("tierName")} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                                                        Tier <ArrowUpDown className="h-3 w-3" />
                                                    </button>
                                                </th>
                                                <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Confidence</th>
                                                <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Status</th>
                                                <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sorted.map((a) => (
                                                <tr
                                                    key={a.id}
                                                    className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                                                    onClick={() => router.push(`/agents/${a.id}/credit`)}
                                                >
                                                    <td className="py-2 px-2">
                                                        <div>
                                                            <span className="font-medium">{a.name}</span>
                                                            <span className="text-xs text-muted-foreground ml-2">{a.type}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-2 font-mono font-medium text-amber-600 dark:text-amber-400">
                                                        {a.credit}
                                                    </td>
                                                    <td className="py-2 px-2 font-mono text-blue-600 dark:text-blue-400">
                                                        {a.trust}
                                                    </td>
                                                    <td className="py-2 px-2">
                                                        <TierBadgeTooltip creditScore={a.credit} size="sm" />
                                                    </td>
                                                    <td className="py-2 px-2">
                                                        <ConfidenceIndicator confidence={getConfidenceInfo(a.eventCount)} />
                                                    </td>
                                                    <td className="py-2 px-2">
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] ${
                                                                a.status === "online"
                                                                    ? "text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800"
                                                                    : "text-muted-foreground"
                                                            }`}
                                                        >
                                                            {a.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-2 px-2 text-right">
                                                        <Button variant="ghost" size="sm" className="text-xs">
                                                            View →
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
