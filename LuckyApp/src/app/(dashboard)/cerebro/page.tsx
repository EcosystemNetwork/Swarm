/** Cerebro — Automatic conversation topic organization with status and privacy controls. */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, MessageCircle, Eye, EyeOff, Loader2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import {
    type CerebroTopic,
    type TopicStatus,
    STATUS_CONFIG,
    getTopics,
    updateTopicStatus,
    togglePrivacy,
} from "@/lib/cerebro";

function timeAgo(d: Date | null): string {
    if (!d) return "—";
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

export default function CerebroPage() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [topics, setTopics] = useState<CerebroTopic[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<TopicStatus | "all">("all");
    const [showPrivate, setShowPrivate] = useState(true);

    const loadTopics = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const data = await getTopics(currentOrg.id, filter === "all" ? undefined : filter);
            setTopics(data);
        } catch (err) {
            console.error("Failed to load topics:", err);
        } finally {
            setLoading(false);
        }
    }, [currentOrg, filter]);

    useEffect(() => { loadTopics(); }, [loadTopics]);

    const handleStatus = async (topicId: string, status: TopicStatus) => {
        try {
            await updateTopicStatus(topicId, status);
            setTopics(prev => prev.map(t => t.id === topicId ? { ...t, status } : t));
        } catch (err) {
            console.error("Failed to update:", err);
        }
    };

    const handlePrivacy = async (topicId: string, isPrivate: boolean) => {
        try {
            await togglePrivacy(topicId, isPrivate);
            setTopics(prev => prev.map(t => t.id === topicId ? { ...t, isPrivate } : t));
        } catch (err) {
            console.error("Failed to toggle privacy:", err);
        }
    };

    const visibleTopics = showPrivate ? topics : topics.filter(t => !t.isPrivate);
    const counts = {
        all: topics.length,
        active: topics.filter(t => t.status === "active").length,
        resolved: topics.filter(t => t.status === "resolved").length,
        parked: topics.filter(t => t.status === "parked").length,
    };

    if (!authAddress) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Brain className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to view topics</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
                            <Brain className="h-6 w-6 text-violet-500" />
                        </div>
                        Cerebro
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Auto-organized conversation topics across agents and channels
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowPrivate(!showPrivate)}
                        className="p-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                        title={showPrivate ? "Hide private" : "Show private"}
                    >
                        {showPrivate ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-1 mb-4 bg-muted/30 rounded-lg p-0.5 w-fit">
                {(["all", "active", "resolved", "parked"] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${filter === f ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
            ) : visibleTopics.length === 0 ? (
                <Card className="p-12 bg-card/80 border-border text-center">
                    <Brain className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-sm font-semibold mb-1">No topics yet</h3>
                    <p className="text-xs text-muted-foreground">
                        Topics are auto-created from conversation threads across your agents
                    </p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {visibleTopics.map(topic => {
                        const cfg = STATUS_CONFIG[topic.status];
                        return (
                            <Card key={topic.id} className="p-4 bg-card/80 border-border hover:border-violet-500/20 transition-colors">
                                <div className="flex items-start gap-3">
                                    <div className={`p-1.5 rounded-lg ${cfg.bg} mt-0.5`}>
                                        <MessageCircle className={`h-4 w-4 ${cfg.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="text-sm font-medium truncate">
                                                {topic.isPrivate && "🔒 "}{topic.title}
                                            </h4>
                                            <Badge variant="outline" className={`text-[9px] ${cfg.color}`}>
                                                {cfg.emoji} {cfg.label}
                                            </Badge>
                                            {topic.channel && (
                                                <Badge variant="outline" className="text-[9px]">#{topic.channel}</Badge>
                                            )}
                                        </div>
                                        {topic.summary && (
                                            <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{topic.summary}</p>
                                        )}
                                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                            <span>{topic.threadCount} thread{topic.threadCount !== 1 ? "s" : ""}</span>
                                            <span>{topic.participants.length} participant{topic.participants.length !== 1 ? "s" : ""}</span>
                                            <span>{timeAgo(topic.lastActivity)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {topic.status === "active" && (
                                            <>
                                                <button onClick={() => handleStatus(topic.id, "resolved")} className="text-[9px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">Resolve</button>
                                                <button onClick={() => handleStatus(topic.id, "parked")} className="text-[9px] px-2 py-1 rounded bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20">Park</button>
                                            </>
                                        )}
                                        {topic.status === "resolved" && (
                                            <button onClick={() => handleStatus(topic.id, "active")} className="text-[9px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">Reopen</button>
                                        )}
                                        {topic.status === "parked" && (
                                            <button onClick={() => handleStatus(topic.id, "active")} className="text-[9px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">Reopen</button>
                                        )}
                                        <button
                                            onClick={() => handlePrivacy(topic.id, !topic.isPrivate)}
                                            className="p-1 text-muted-foreground hover:text-foreground"
                                            title={topic.isPrivate ? "Make public" : "Make private"}
                                        >
                                            {topic.isPrivate ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
