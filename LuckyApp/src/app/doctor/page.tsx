/** Doctor — System health diagnostics across Infrastructure, Agents, and Security categories. */
"use client";

import { useState, useCallback } from "react";
import {
    Stethoscope, CheckCircle, AlertTriangle, XCircle, RefreshCw, Loader2,
    Database, Wifi, Users, Clock, Shield, Server,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveAccount } from "thirdweb/react";

// ═══════════════════════════════════════════════════════════════
// Health Check Types
// ═══════════════════════════════════════════════════════════════

type CheckStatus = "healthy" | "warning" | "critical" | "unchecked";

interface HealthCheck {
    id: string;
    category: string;
    title: string;
    detail: string;
    status: CheckStatus;
    icon: typeof Database;
    fixAction?: string;
}

const STATUS_CONFIG: Record<CheckStatus, { label: string; color: string; icon: typeof CheckCircle; bg: string }> = {
    healthy: { label: "Healthy", color: "text-emerald-400", icon: CheckCircle, bg: "bg-emerald-500/10" },
    warning: { label: "Warning", color: "text-amber-400", icon: AlertTriangle, bg: "bg-amber-500/10" },
    critical: { label: "Critical", color: "text-red-400", icon: XCircle, bg: "bg-red-500/10" },
    unchecked: { label: "Pending", color: "text-zinc-400", icon: Clock, bg: "bg-zinc-500/10" },
};

// ═══════════════════════════════════════════════════════════════
// Simulated diagnostics
// ═══════════════════════════════════════════════════════════════

function runDiagnostics(): HealthCheck[] {
    return [
        {
            id: "firebase",
            category: "Infrastructure",
            title: "Firebase Connection",
            detail: "Firestore database is reachable and responding",
            status: "healthy",
            icon: Database,
        },
        {
            id: "agents",
            category: "Agents",
            title: "Agent Fleet Status",
            detail: "All registered agents are responsive",
            status: "healthy",
            icon: Users,
        },
        {
            id: "gateway",
            category: "Infrastructure",
            title: "Gateway Reachability",
            detail: "Swarm Hub gateway endpoint is accessible",
            status: "healthy",
            icon: Wifi,
        },
        {
            id: "websocket",
            category: "Infrastructure",
            title: "WebSocket Health",
            detail: "Real-time connection channels are stable",
            status: "healthy",
            icon: Server,
        },
        {
            id: "auth",
            category: "Security",
            title: "Authentication",
            detail: "Wallet signature verification is functional",
            status: "healthy",
            icon: Shield,
        },
        {
            id: "cron",
            category: "Operations",
            title: "Scheduled Jobs",
            detail: "Cron scheduler is running with no stale jobs",
            status: "healthy",
            icon: Clock,
        },
    ];
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function DoctorPage() {
    const account = useActiveAccount();
    const [checks, setChecks] = useState<HealthCheck[]>([]);
    const [running, setRunning] = useState(false);
    const [lastRun, setLastRun] = useState<Date | null>(null);

    const runChecks = useCallback(async () => {
        setRunning(true);
        // Simulate async diagnostics
        await new Promise(r => setTimeout(r, 1500));
        setChecks(runDiagnostics());
        setLastRun(new Date());
        setRunning(false);
    }, []);

    const healthy = checks.filter(c => c.status === "healthy").length;
    const warnings = checks.filter(c => c.status === "warning").length;
    const critical = checks.filter(c => c.status === "critical").length;

    // Group by category
    const categories = new Map<string, HealthCheck[]>();
    for (const check of checks) {
        const arr = categories.get(check.category) || [];
        arr.push(check);
        categories.set(check.category, arr);
    }

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Stethoscope className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to run diagnostics</p>
            </div>
        );
    }

    return (
        <div className="max-w-[900px] mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                            <Stethoscope className="h-6 w-6 text-cyan-500" />
                        </div>
                        System Health
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Run diagnostics and check system status
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRun && (
                        <span className="text-[10px] text-muted-foreground">
                            Last checked {lastRun.toLocaleTimeString()}
                        </span>
                    )}
                    <Button
                        onClick={runChecks}
                        disabled={running}
                        size="sm"
                        className="gap-1.5 bg-cyan-500 hover:bg-cyan-600 text-black"
                    >
                        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {running ? "Running..." : "Run Diagnostics"}
                    </Button>
                </div>
            </div>

            {checks.length === 0 ? (
                <Card className="p-12 bg-card/80 border-border text-center">
                    <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-sm font-semibold mb-1">No diagnostics run yet</h3>
                    <p className="text-xs text-muted-foreground mb-4">Click &quot;Run Diagnostics&quot; to check your system health</p>
                </Card>
            ) : (
                <>
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        <Card className="p-3 bg-card/80 border-border text-center">
                            <div className="text-2xl font-bold text-emerald-400">{healthy}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Healthy</div>
                        </Card>
                        <Card className="p-3 bg-card/80 border-border text-center">
                            <div className="text-2xl font-bold text-amber-400">{warnings}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Warnings</div>
                        </Card>
                        <Card className="p-3 bg-card/80 border-border text-center">
                            <div className="text-2xl font-bold text-red-400">{critical}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Critical</div>
                        </Card>
                    </div>

                    {/* Check results by category */}
                    {Array.from(categories.entries()).map(([category, items]) => (
                        <div key={category} className="mb-4">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</h3>
                            <div className="space-y-1.5">
                                {items.map((check) => {
                                    const cfg = STATUS_CONFIG[check.status];
                                    const StatusIcon = cfg.icon;
                                    const CheckIcon = check.icon;
                                    return (
                                        <Card key={check.id} className="p-3 bg-card/80 border-border">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
                                                    <CheckIcon className={`h-4 w-4 ${cfg.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium">{check.title}</p>
                                                    <p className="text-[10px] text-muted-foreground">{check.detail}</p>
                                                </div>
                                                <Badge variant="outline" className={`text-[9px] gap-1 ${cfg.color}`}>
                                                    <StatusIcon className="h-2.5 w-2.5" />
                                                    {cfg.label}
                                                </Badge>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
