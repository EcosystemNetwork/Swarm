/** Memory Spaces — Create, manage, and configure named memory spaces. */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Layers, Plus, Globe, Building2, Lock, Loader2,
    AlertTriangle, Users, Trash2, Pencil, Brain,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import Link from "next/link";

interface Space {
    id: string;
    name: string;
    description?: string;
    visibility: "private" | "org" | "public";
    tags?: string[];
    entryCount: number;
    createdBy: string;
    createdAt: string | null;
}

interface Member {
    id: string;
    subjectType: string;
    subjectId: string;
    subjectName?: string;
    role: string;
}

const VISIBILITY_CONFIG = {
    private: { icon: Lock, label: "Private", color: "text-red-400 border-red-500/30" },
    org: { icon: Building2, label: "Org", color: "text-blue-400 border-blue-500/30" },
    public: { icon: Globe, label: "Public", color: "text-emerald-400 border-emerald-500/30" },
};

export default function SpacesPage() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [requiresSub, setRequiresSub] = useState(false);

    // Create dialog state
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newVisibility, setNewVisibility] = useState<"private" | "org" | "public">("org");
    const [creating, setCreating] = useState(false);

    // Members view state
    const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    const load = useCallback(async () => {
        if (!currentOrg || !authAddress) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/v1/memory/pro/spaces?orgId=${currentOrg.id}`, {
                headers: { "x-wallet-address": authAddress },
            });
            if (res.status === 403) {
                setRequiresSub(true);
                setLoading(false);
                return;
            }
            if (!res.ok) throw new Error("Failed to load spaces");
            const body = await res.json();
            setSpaces(body.spaces || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [currentOrg, authAddress]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async () => {
        if (!newName.trim() || !currentOrg || !authAddress) return;
        setCreating(true);
        try {
            const res = await fetch("/api/v1/memory/pro/spaces", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": authAddress,
                },
                body: JSON.stringify({
                    orgId: currentOrg.id,
                    name: newName,
                    description: newDesc,
                    visibility: newVisibility,
                }),
            });
            if (!res.ok) throw new Error("Failed to create space");
            setShowCreate(false);
            setNewName("");
            setNewDesc("");
            setNewVisibility("org");
            load();
        } catch {
            // swallow
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (spaceId: string) => {
        if (!currentOrg || !authAddress) return;
        try {
            const res = await fetch(
                `/api/v1/memory/pro/spaces/${spaceId}?orgId=${currentOrg.id}`,
                {
                    method: "DELETE",
                    headers: { "x-wallet-address": authAddress },
                },
            );
            if (!res.ok) throw new Error("Failed to delete");
            load();
        } catch {
            // swallow
        }
    };

    const loadMembers = async (spaceId: string) => {
        if (!currentOrg || !authAddress) return;
        setSelectedSpace(spaceId);
        setLoadingMembers(true);
        try {
            const res = await fetch(
                `/api/v1/memory/pro/spaces/${spaceId}/members?orgId=${currentOrg.id}`,
                { headers: { "x-wallet-address": authAddress } },
            );
            if (!res.ok) throw new Error("Failed to load members");
            const body = await res.json();
            setMembers(body.members || []);
        } catch {
            setMembers([]);
        } finally {
            setLoadingMembers(false);
        }
    };

    if (!authAddress) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Layers className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to manage spaces</p>
            </div>
        );
    }

    if (requiresSub) {
        return (
            <div className="max-w-[800px] mx-auto px-4 py-16 text-center">
                <Lock className="h-12 w-12 mx-auto text-purple-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Memory Pro Required</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Subscribe to Memory Pro to create and manage memory spaces.
                </p>
                <Link href="/market" className="text-sm text-purple-400 hover:underline">
                    Go to Marketplace
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                            <Layers className="h-6 w-6 text-purple-500" />
                        </div>
                        Memory Spaces
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Named shared spaces with visibility and access controls
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="h-4 w-4" /> New Space
                </button>
            </div>

            {/* Create Dialog */}
            {showCreate && (
                <Card className="p-5 bg-card/80 border-border mb-6">
                    <h3 className="text-sm font-medium mb-3">Create Space</h3>
                    <div className="space-y-3">
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Space name"
                            className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <input
                            type="text"
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <div className="flex gap-2">
                            {(["private", "org", "public"] as const).map((v) => {
                                const cfg = VISIBILITY_CONFIG[v];
                                const Icon = cfg.icon;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => setNewVisibility(v)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${newVisibility === v
                                            ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                                            : "border-border text-muted-foreground hover:border-border/80"
                                            }`}
                                    >
                                        <Icon className="h-3 w-3" /> {cfg.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={creating || !newName.trim()}
                                className="px-4 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                            >
                                {creating ? "Creating..." : "Create"}
                            </button>
                        </div>
                    </div>
                </Card>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                </div>
            ) : error ? (
                <Card className="p-8 bg-card/80 border-border text-center">
                    <AlertTriangle className="h-8 w-8 mx-auto text-amber-400 mb-3" />
                    <p className="text-sm text-muted-foreground">{error}</p>
                </Card>
            ) : spaces.length === 0 ? (
                <Card className="p-8 bg-card/80 border-border text-center">
                    <Layers className="h-8 w-8 mx-auto text-muted-foreground mb-3 opacity-30" />
                    <p className="text-sm text-muted-foreground">No memory spaces yet</p>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="mt-3 text-sm text-purple-400 hover:underline"
                    >
                        Create your first space
                    </button>
                </Card>
            ) : (
                <div className="space-y-3">
                    {spaces.map((space) => {
                        const visCfg = VISIBILITY_CONFIG[space.visibility];
                        const VisIcon = visCfg.icon;
                        const isSelected = selectedSpace === space.id;
                        return (
                            <div key={space.id}>
                                <Card className={`p-4 bg-card/80 border-border ${isSelected ? "border-purple-500/30" : ""}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="p-2 rounded-lg bg-purple-500/10">
                                                <Layers className="h-4 w-4 text-purple-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{space.name}</p>
                                                {space.description && (
                                                    <p className="text-[10px] text-muted-foreground truncate">{space.description}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline" className={`text-[9px] ${visCfg.color}`}>
                                                <VisIcon className="h-2.5 w-2.5 mr-1" /> {visCfg.label}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {space.entryCount} entries
                                            </span>
                                            <button
                                                onClick={() => isSelected ? setSelectedSpace(null) : loadMembers(space.id)}
                                                className="p-1 hover:bg-muted/30 rounded"
                                                title="Members"
                                            >
                                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(space.id)}
                                                className="p-1 hover:bg-red-500/10 rounded"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                                            </button>
                                        </div>
                                    </div>
                                </Card>

                                {/* Members Panel */}
                                {isSelected && (
                                    <Card className="p-4 bg-card/60 border-border ml-6 mt-1">
                                        <h4 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                                            <Users className="h-3 w-3 text-purple-400" /> Members
                                        </h4>
                                        {loadingMembers ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                                        ) : members.length === 0 ? (
                                            <p className="text-[10px] text-muted-foreground">No members</p>
                                        ) : (
                                            <div className="space-y-1">
                                                {members.map((m) => (
                                                    <div key={m.id} className="flex items-center justify-between py-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs">{m.subjectName || m.subjectId}</span>
                                                            <Badge variant="outline" className="text-[8px]">{m.subjectType}</Badge>
                                                        </div>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[8px] ${m.role === "admin"
                                                                ? "text-purple-400 border-purple-500/30"
                                                                : m.role === "writer"
                                                                    ? "text-blue-400 border-blue-500/30"
                                                                    : "text-muted-foreground"
                                                                }`}
                                                        >
                                                            {m.role}
                                                        </Badge>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Card>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Back to Dashboard */}
            <div className="mt-6">
                <Link href="/memory/pro" className="text-sm text-muted-foreground hover:text-purple-400 flex items-center gap-1">
                    <Brain className="h-3.5 w-3.5" /> Back to Memory Pro
                </Link>
            </div>
        </div>
    );
}
