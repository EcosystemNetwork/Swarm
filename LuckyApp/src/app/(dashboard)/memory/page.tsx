/** Memory Browser — Browse and search agent memory files (journal, long-term, workspace, vector). */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, Search, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import { FileManager } from "@/components/file-manager";
import {
    type MemoryEntry,
    type MemoryType,
    MEMORY_TYPE_CONFIG,
    getMemoryEntries,
    searchMemory,
    fmtFileSize,
} from "@/lib/memory";

function timeAgo(d: Date | null): string {
    if (!d) return "—";
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

export default function MemoryPage() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [entries, setEntries] = useState<MemoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"memory" | "workspace">("memory");

    const load = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const data = await getMemoryEntries(currentOrg.id, undefined, typeFilter === "all" ? undefined : typeFilter);
            setEntries(data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [currentOrg, typeFilter]);

    useEffect(() => { load(); }, [load]);

    const filtered = searchQuery ? searchMemory(entries, searchQuery) : entries;

    if (!authAddress) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Brain className="h-12 w-12 opacity-30" /><p>Connect your wallet to browse memory</p>
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
                    Memory
                </h1>
                <p className="text-sm text-muted-foreground mt-2">Browse agent memory files and run semantic search</p>
            </div>

            <div className="flex gap-2 mb-6 border-b border-border pb-2">
                <button
                    onClick={() => setActiveTab("memory")}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === "memory"
                            ? "bg-purple-500/10 text-purple-400 border-b-2 border-purple-500"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    Memory Search
                </button>
                <button
                    onClick={() => setActiveTab("workspace")}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === "workspace"
                            ? "bg-purple-500/10 text-purple-400 border-b-2 border-purple-500"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    Workspace Files
                </button>
            </div>

// Bottom of file:
            {activeTab === "memory" ? (
                <>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search memory... (⌘K)"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 text-sm"
                            />
                        </div>
                        <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
                            <button
                                onClick={() => setTypeFilter("all")}
                                className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${typeFilter === "all" ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >All</button>
                            {(Object.keys(MEMORY_TYPE_CONFIG) as MemoryType[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTypeFilter(t)}
                                    className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${typeFilter === t ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >{MEMORY_TYPE_CONFIG[t].icon} {MEMORY_TYPE_CONFIG[t].label}</button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /></div>
                    ) : filtered.length === 0 ? (
                        <Card className="p-12 bg-card/80 border-border text-center">
                            <Brain className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="text-sm font-semibold mb-1">
                                {searchQuery ? "No results found" : "No memory entries"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {searchQuery ? "Try a different search term" : "Memory entries are recorded as agents interact"}
                            </p>
                        </Card>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map(entry => {
                                const cfg = MEMORY_TYPE_CONFIG[entry.type];
                                const isExpanded = expandedId === entry.id;
                                return (
                                    <Card
                                        key={entry.id}
                                        className="bg-card/80 border-border hover:border-purple-500/20 transition-colors cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                    >
                                        <div className="p-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className="text-sm">{cfg.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium truncate">{entry.title}</p>
                                                        <Badge variant="outline" className={`text-[9px] ${cfg.color}`}>{cfg.label}</Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                        <span>{entry.agentName || entry.agentId}</span>
                                                        {entry.sizeBytes && <span>· {fmtFileSize(entry.sizeBytes)}</span>}
                                                        <span>· {timeAgo(entry.updatedAt)}</span>
                                                    </div>
                                                </div>
                                                {entry.tags && entry.tags.length > 0 && (
                                                    <div className="flex gap-1 shrink-0">
                                                        {entry.tags.slice(0, 3).map(tag => (
                                                            <Badge key={tag} variant="outline" className="text-[8px]">{tag}</Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {isExpanded && (
                                                <div className="mt-3 pt-3 border-t border-border">
                                                    {entry.filePath && (
                                                        <p className="text-[10px] font-mono text-muted-foreground mb-2 flex items-center gap-1">
                                                            <FileText className="h-2.5 w-2.5" /> {entry.filePath}
                                                        </p>
                                                    )}
                                                    <pre className="text-xs text-foreground bg-muted/20 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                                                        {entry.content}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                <div className="h-[600px]">
                    <FileManager />
                </div>
            )}
        </div>
    );
}
