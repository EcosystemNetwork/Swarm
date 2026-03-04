/** Skills — Marketplace for agent skill packages and capability extensions. */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Search, Package, Download, Trash2, Check, Loader2,
    Puzzle, Star, Shield, X, ChevronRight, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/contexts/OrgContext";
import { useActiveAccount } from "thirdweb/react";
import {
    type Skill, type InstalledSkill,
    SKILL_REGISTRY, SKILL_BUNDLES, SKILL_CATEGORIES,
    installSkill, uninstallSkill, toggleSkill, getInstalledSkills, installBundle,
} from "@/lib/skills";

// ═══════════════════════════════════════════════════════════════
// Skill Card
// ═══════════════════════════════════════════════════════════════

function SkillCard({
    skill, installed, onInstall, onUninstall, onToggle, busy,
}: {
    skill: Skill;
    installed?: InstalledSkill;
    onInstall: () => void;
    onUninstall: () => void;
    onToggle: () => void;
    busy: boolean;
}) {
    return (
        <Card className={`p-4 bg-card border-border transition-all hover:border-amber-500/20 group ${installed && !installed.enabled ? "opacity-60" : ""
            }`}>
            <div className="flex items-start gap-3">
                <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted/50">
                    {skill.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-sm truncate">{skill.name}</h3>
                        <span className="text-[10px] text-muted-foreground">v{skill.version}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{skill.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{skill.category}</Badge>
                        {skill.requiredKeys?.map((k) => (
                            <Badge key={k} variant="outline" className="text-[10px] border-amber-500/20 text-amber-500">
                                <Shield className="h-2.5 w-2.5 mr-0.5" />{k}
                            </Badge>
                        ))}
                    </div>
                </div>
                <div className="shrink-0">
                    {installed ? (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={onToggle}
                                disabled={busy}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${installed.enabled
                                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    }`}
                            >
                                {installed.enabled ? "On" : "Off"}
                            </button>
                            <button
                                onClick={onUninstall}
                                disabled={busy}
                                className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Uninstall"
                            >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onInstall}
                            disabled={busy}
                            className="h-7 text-xs gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                        >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                            Install
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );
}

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function SkillsPage() {
    const { currentOrg } = useOrg();
    const account = useActiveAccount();
    const [installed, setInstalled] = useState<InstalledSkill[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [tab, setTab] = useState<"marketplace" | "installed" | "bundles">("marketplace");

    const loadInstalled = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const data = await getInstalledSkills(currentOrg.id);
            setInstalled(data);
        } catch (err) {
            console.error("Failed to load installed skills:", err);
        } finally {
            setLoading(false);
        }
    }, [currentOrg]);

    useEffect(() => { loadInstalled(); }, [loadInstalled]);

    const installedMap = new Map(installed.map((i) => [i.skillId, i]));

    const handleInstall = async (skillId: string) => {
        if (!currentOrg || !account) return;
        setBusyId(skillId);
        try {
            await installSkill(currentOrg.id, skillId, account.address);
            await loadInstalled();
        } finally { setBusyId(null); }
    };

    const handleUninstall = async (inst: InstalledSkill) => {
        setBusyId(inst.skillId);
        try {
            await uninstallSkill(inst.id);
            await loadInstalled();
        } finally { setBusyId(null); }
    };

    const handleToggle = async (inst: InstalledSkill) => {
        setBusyId(inst.skillId);
        try {
            await toggleSkill(inst.id, !inst.enabled);
            setInstalled((prev) => prev.map((i) => i.id === inst.id ? { ...i, enabled: !i.enabled } : i));
        } finally { setBusyId(null); }
    };

    const handleInstallBundle = async (bundleId: string) => {
        if (!currentOrg || !account) return;
        setBusyId(bundleId);
        try {
            await installBundle(
                currentOrg.id,
                bundleId,
                account.address,
                installed.map((i) => i.skillId),
            );
            await loadInstalled();
        } finally { setBusyId(null); }
    };

    // Filtered skills
    const filteredSkills = SKILL_REGISTRY.filter((s) => {
        const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.description.toLowerCase().includes(search.toLowerCase()) ||
            s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
        const matchesCategory = category === "All" || s.category === category;
        return matchesSearch && matchesCategory;
    });

    const installedSkills = SKILL_REGISTRY.filter((s) => installedMap.has(s.id));

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Puzzle className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to manage skills</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <Puzzle className="h-6 w-6 text-amber-500" />
                        </div>
                        Skill Marketplace
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Browse, install, and manage agent skills — extend what your agents can do
                    </p>
                </div>
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-sm">
                    {installed.length} installed
                </Badge>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border pb-px">
                {([
                    { key: "marketplace", label: "Marketplace", icon: Package },
                    { key: "installed", label: `Installed (${installed.length})`, icon: Check },
                    { key: "bundles", label: "Bundles", icon: Layers },
                ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${tab === key
                                ? "border-amber-500 text-amber-500"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Marketplace Tab */}
            {tab === "marketplace" && (
                <>
                    {/* Search + Filters */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search skills..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            {SKILL_CATEGORIES.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${category === cat
                                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Skills Grid */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filteredSkills.map((skill) => (
                                <SkillCard
                                    key={skill.id}
                                    skill={skill}
                                    installed={installedMap.get(skill.id)}
                                    onInstall={() => handleInstall(skill.id)}
                                    onUninstall={() => { const inst = installedMap.get(skill.id); if (inst) handleUninstall(inst); }}
                                    onToggle={() => { const inst = installedMap.get(skill.id); if (inst) handleToggle(inst); }}
                                    busy={busyId === skill.id}
                                />
                            ))}
                        </div>
                    )}

                    {filteredSkills.length === 0 && !loading && (
                        <div className="text-center py-12 text-muted-foreground">
                            <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p>No skills match your search</p>
                        </div>
                    )}
                </>
            )}

            {/* Installed Tab */}
            {tab === "installed" && (
                installedSkills.length === 0 ? (
                    <Card className="p-12 text-center bg-card border-border border-dashed">
                        <Puzzle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No skills installed</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            Browse the marketplace to install skills for your agents.
                        </p>
                        <Button onClick={() => setTab("marketplace")} className="bg-amber-500 hover:bg-amber-600 text-black gap-2">
                            <Package className="h-4 w-4" /> Browse Marketplace
                        </Button>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {installedSkills.map((skill) => (
                            <SkillCard
                                key={skill.id}
                                skill={skill}
                                installed={installedMap.get(skill.id)}
                                onInstall={() => handleInstall(skill.id)}
                                onUninstall={() => { const inst = installedMap.get(skill.id); if (inst) handleUninstall(inst); }}
                                onToggle={() => { const inst = installedMap.get(skill.id); if (inst) handleToggle(inst); }}
                                busy={busyId === skill.id}
                            />
                        ))}
                    </div>
                )
            )}

            {/* Bundles Tab */}
            {tab === "bundles" && (
                <div className="space-y-4">
                    {SKILL_BUNDLES.map((bundle) => {
                        const bundleSkills = SKILL_REGISTRY.filter((s) => bundle.skillIds.includes(s.id));
                        const allInstalled = bundle.skillIds.every((id) => installedMap.has(id));
                        return (
                            <Card key={bundle.id} className="p-5 bg-card border-border">
                                <div className="flex items-start gap-4">
                                    <div className="text-3xl shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                                        {bundle.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-base">{bundle.name}</h3>
                                            <Badge variant="outline" className="text-[10px]">{bundle.skillIds.length} skills</Badge>
                                            {allInstalled && (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                                    <Check className="h-2.5 w-2.5 mr-0.5" /> Installed
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-3">{bundle.description}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {bundleSkills.map((s) => (
                                                <span
                                                    key={s.id}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${installedMap.has(s.id)
                                                            ? "bg-emerald-500/10 text-emerald-400"
                                                            : "bg-muted/50 text-muted-foreground"
                                                        }`}
                                                >
                                                    {s.icon} {s.name}
                                                    {installedMap.has(s.id) && <Check className="h-3 w-3" />}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        {allInstalled ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                <Check className="h-3 w-3 mr-1" /> All Installed
                                            </Badge>
                                        ) : (
                                            <Button
                                                size="sm"
                                                onClick={() => handleInstallBundle(bundle.id)}
                                                disabled={busyId === bundle.id}
                                                className="bg-amber-500 hover:bg-amber-600 text-black gap-1"
                                            >
                                                {busyId === bundle.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Download className="h-3 w-3" />
                                                )}
                                                Install Bundle
                                            </Button>
                                        )}
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
