"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { motion } from "motion/react";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    onAgentCommsByOrg,
    type AgentComm,
} from "@/lib/firestore";

const COMM_TYPE_STYLES: Record<string, { badge: string; icon: string; label: string }> = {
    message: { badge: "bg-blue-100 text-blue-700 border-blue-200", icon: "💬", label: "Message" },
    status: { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "📊", label: "Status" },
    handoff: { badge: "bg-purple-100 text-purple-700 border-purple-200", icon: "🤝", label: "Handoff" },
    error: { badge: "bg-red-100 text-red-700 border-red-200", icon: "❌", label: "Error" },
};

const DARK_COMM_TYPE_STYLES: Record<string, { badge: string }> = {
    message: { badge: "dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30" },
    status: { badge: "dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30" },
    handoff: { badge: "dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30" },
    error: { badge: "dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30" },
};

function formatTimestamp(ts: unknown): string {
    if (!ts) return "—";
    if (typeof ts === "object" && ts !== null && "toDate" in ts) {
        return (ts as { toDate: () => Date }).toDate().toLocaleString();
    }
    if (ts instanceof Date) return ts.toLocaleString();
    if (typeof ts === "number") return new Date(ts).toLocaleString();
    return String(ts);
}

function relativeTime(ts: unknown): string {
    if (!ts) return "";
    let date: Date;
    if (typeof ts === "object" && ts !== null && "toDate" in ts) {
        date = (ts as { toDate: () => Date }).toDate();
    } else if (typeof ts === "object" && ts !== null && "seconds" in ts) {
        date = new Date((ts as { seconds: number }).seconds * 1000);
    } else {
        date = new Date(ts as string | number);
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}

export default function AgentCommsPage() {
    const { currentOrg } = useOrg();
    const [comms, setComms] = useState<AgentComm[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (!currentOrg) {
            setComms([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        const unsubscribe = onAgentCommsByOrg(currentOrg.id, (data) => {
            setComms(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentOrg]);

    const filteredComms = comms.filter((comm) => {
        if (filterType !== "all" && comm.type !== filterType) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                comm.content?.toLowerCase().includes(q) ||
                comm.fromAgentName?.toLowerCase().includes(q) ||
                comm.toAgentName?.toLowerCase().includes(q) ||
                comm.type?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    if (!currentOrg) {
        return (
            <div className="space-y-6">
                <BlurText text="Agent Comms" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
                <p className="text-muted-foreground mt-1">No organization selected</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <BlurText text="Agent Comms" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
                <p className="text-muted-foreground mt-1">
                    Real-time inter-agent communications feed
                </p>
            </div>

            {/* Filters */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex flex-col sm:flex-row gap-3"
            >
                <Input
                    placeholder="Search communications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-xs"
                />
                <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="message">💬 Message</SelectItem>
                        <SelectItem value="status">📊 Status</SelectItem>
                        <SelectItem value="handoff">🤝 Handoff</SelectItem>
                        <SelectItem value="error">❌ Error</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setFilterType("all"); setSearchQuery(""); }}
                    className="w-fit"
                >
                    Clear Filters
                </Button>
            </motion.div>

            {/* Stats bar */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex gap-4 flex-wrap"
            >
                {Object.entries(COMM_TYPE_STYLES).map(([type, style]) => {
                    const count = comms.filter(c => c.type === type).length;
                    return (
                        <button
                            key={type}
                            onClick={() => setFilterType(filterType === type ? "all" : type)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 hover:scale-105 ${filterType === type
                                    ? "ring-2 ring-amber-500/50 border-amber-500/40"
                                    : "border-border/50"
                                }`}
                        >
                            <span>{style.icon}</span>
                            <span>{style.label}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {count}
                            </Badge>
                        </button>
                    );
                })}
            </motion.div>

            {/* Communications Feed */}
            {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
                        <span>Loading communications...</span>
                    </div>
                </div>
            ) : filteredComms.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="text-center py-16 text-muted-foreground"
                >
                    <div className="text-6xl mb-4">📡</div>
                    <p className="text-lg font-medium">No agent communications yet</p>
                    <p className="text-sm mt-2 max-w-md mx-auto">
                        Communications will appear here as your agents coordinate tasks,
                        exchange status updates, perform handoffs, and report errors.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-6 text-xs">
                        {Object.entries(COMM_TYPE_STYLES).map(([type, style]) => (
                            <div key={type} className="flex items-center gap-1.5">
                                <span>{style.icon}</span>
                                <span className="capitalize">{type}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="space-y-2"
                >
                    {filteredComms.map((comm, index) => {
                        const style = COMM_TYPE_STYLES[comm.type] || COMM_TYPE_STYLES.message;
                        const darkStyle = DARK_COMM_TYPE_STYLES[comm.type] || DARK_COMM_TYPE_STYLES.message;

                        return (
                            <motion.div
                                key={comm.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
                            >
                                <SpotlightCard className="p-0" spotlightColor="rgba(255, 191, 0, 0.05)">
                                    <div className="flex items-start gap-3 p-4">
                                        {/* Type icon */}
                                        <span className="text-lg mt-0.5 shrink-0">{style.icon}</span>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            {/* Agent direction row */}
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <Badge className={`${style.badge} ${darkStyle.badge} text-[10px]`}>
                                                    {style.label}
                                                </Badge>

                                                {/* From agent */}
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                                    🤖 {comm.fromAgentName}
                                                </span>

                                                {/* Arrow */}
                                                <span className="text-muted-foreground text-xs">→</span>

                                                {/* To agent */}
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                                                    🤖 {comm.toAgentName}
                                                </span>
                                            </div>

                                            {/* Message content */}
                                            <p className="text-sm mt-1 leading-relaxed">{comm.content}</p>

                                            {/* Metadata preview */}
                                            {comm.metadata && Object.keys(comm.metadata).length > 0 && (
                                                <div className="mt-2 px-2 py-1 rounded bg-muted/50 text-[11px] text-muted-foreground font-mono truncate">
                                                    {JSON.stringify(comm.metadata).slice(0, 120)}
                                                    {JSON.stringify(comm.metadata).length > 120 && "…"}
                                                </div>
                                            )}
                                        </div>

                                        {/* Timestamp */}
                                        <div className="text-right shrink-0">
                                            <span className="text-xs text-muted-foreground whitespace-nowrap" title={formatTimestamp(comm.createdAt)}>
                                                {relativeTime(comm.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                </SpotlightCard>
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}
        </div>
    );
}
