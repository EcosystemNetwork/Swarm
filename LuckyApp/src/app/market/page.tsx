/** Market — Marketplace for agent mods, plugins, and skills. */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Search, Download, Trash2, Check, Loader2,
    Puzzle, Star, Shield, ShieldCheck, Wrench, Plug, Store,
    Layers, Users, Plus, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/contexts/OrgContext";
import { useActiveAccount } from "thirdweb/react";
import {
    type Skill, type InstalledSkill, type MarketItemType, type CommunityMarketItem,
    SKILL_REGISTRY, SKILL_BUNDLES,
    MOD_CATEGORIES, PLUGIN_CATEGORIES, SKILL_ONLY_CATEGORIES,
    installSkill, uninstallSkill, toggleSkill, getInstalledSkills, installBundle,
    getCommunityItems, getUserSubmissions, deleteCommunityItem,
} from "@/lib/skills";
import { SubmitMarketItemDialog } from "@/components/market/submit-dialog";

// ═══════════════════════════════════════════════════════════════
// Tab Config
// ═══════════════════════════════════════════════════════════════

type Tab = "mods" | "plugins" | "skills" | "bundles" | "installed" | "submit";

const TABS: { key: Tab; label: string; icon: typeof Wrench; type?: MarketItemType }[] = [
    { key: "mods", label: "Mods", icon: Wrench, type: "mod" },
    { key: "plugins", label: "Plugins", icon: Plug, type: "plugin" },
    { key: "skills", label: "Skills", icon: Puzzle, type: "skill" },
    { key: "bundles", label: "Bundles", icon: Layers },
    { key: "installed", label: "Installed", icon: Check },
    { key: "submit", label: "Submit", icon: Plus },
];

const CATEGORIES_BY_TYPE: Record<MarketItemType, string[]> = {
    mod: MOD_CATEGORIES,
    plugin: PLUGIN_CATEGORIES,
    skill: SKILL_ONLY_CATEGORIES,
};

// ═══════════════════════════════════════════════════════════════
// Market Item Card
// ═══════════════════════════════════════════════════════════════

function MarketItemCard({
    item, installed, onInstall, onUninstall, onToggle, busy,
}: {
    item: Skill;
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
                    {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                        <span className="text-[10px] text-muted-foreground">v{item.version}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                        {item.source === "verified" ? (
                            <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-500">
                                <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Verified
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-400">
                                <Users className="h-2.5 w-2.5 mr-0.5" />Community
                            </Badge>
                        )}
                        {item.requiredKeys?.map((k) => (
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

export default function MarketPage() {
    const { currentOrg } = useOrg();
    const account = useActiveAccount();
    const [installed, setInstalled] = useState<InstalledSkill[]>([]);
    const [communityItems, setCommunityItems] = useState<CommunityMarketItem[]>([]);
    const [userSubmissions, setUserSubmissions] = useState<CommunityMarketItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [sourceFilter, setSourceFilter] = useState<"all" | "verified" | "community">("all");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("mods");
    const [submitOpen, setSubmitOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadInstalled = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const data = await getInstalledSkills(currentOrg.id);
            setInstalled(data);
        } catch (err) {
            console.error("Failed to load installed items:", err);
        } finally {
            setLoading(false);
        }
    }, [currentOrg]);

    const loadCommunityItems = useCallback(async () => {
        try {
            const items = await getCommunityItems();
            setCommunityItems(items);
        } catch (err) {
            console.error("Failed to load community items:", err);
        }
    }, []);

    const loadUserSubmissions = useCallback(async () => {
        if (!account) return;
        try {
            const subs = await getUserSubmissions(account.address);
            setUserSubmissions(subs);
        } catch (err) {
            console.error("Failed to load submissions:", err);
        }
    }, [account]);

    useEffect(() => { loadInstalled(); }, [loadInstalled]);
    useEffect(() => { loadCommunityItems(); }, [loadCommunityItems]);
    useEffect(() => { loadUserSubmissions(); }, [loadUserSubmissions]);

    // Merge community items with registry
    const allItems: Skill[] = useMemo(() => {
        const communitySkills: Skill[] = communityItems.map((c) => ({
            id: `community-${c.id}`,
            name: c.name,
            description: c.description,
            type: c.type,
            source: "community" as const,
            category: c.category,
            icon: c.icon,
            version: c.version,
            author: c.submittedByName || c.submittedBy.slice(0, 8) + "...",
            requiredKeys: c.requiredKeys,
            tags: c.tags,
        }));
        return [...SKILL_REGISTRY, ...communitySkills];
    }, [communityItems]);

    const handleDeleteSubmission = async (docId: string) => {
        setDeletingId(docId);
        try {
            await deleteCommunityItem(docId);
            await loadUserSubmissions();
            await loadCommunityItems();
        } finally {
            setDeletingId(null);
        }
    };

    // Reset category when switching tabs
    useEffect(() => { setCategory("All"); setSearch(""); }, [tab]);

    const installedMap = useMemo(() => new Map(installed.map((i) => [i.skillId, i])), [installed]);

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

    // Current tab's type
    const activeTabConfig = TABS.find((t) => t.key === tab);
    const activeType = activeTabConfig?.type;

    // Filter items for the active tab
    const filteredItems = useMemo(() => {
        let items = allItems;

        // Filter by type for type-specific tabs
        if (activeType) {
            items = items.filter((s) => s.type === activeType);
        }

        // For installed tab, only show installed items
        if (tab === "installed") {
            items = items.filter((s) => installedMap.has(s.id));
        }

        // Search
        if (search) {
            const q = search.toLowerCase();
            items = items.filter((s) =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                s.tags.some((t) => t.toLowerCase().includes(q))
            );
        }

        // Category
        if (category !== "All") {
            items = items.filter((s) => s.category === category);
        }

        // Source
        if (sourceFilter !== "all") {
            items = items.filter((s) => s.source === sourceFilter);
        }

        return items;
    }, [allItems, activeType, tab, search, category, sourceFilter, installedMap]);

    // Categories for active tab (include community categories dynamically)
    const categories = useMemo(() => {
        if (!activeType) return ["All"];
        const staticCats = CATEGORIES_BY_TYPE[activeType];
        const communityCats = allItems
            .filter((s) => s.type === activeType && s.source === "community")
            .map((s) => s.category);
        const merged = new Set([...staticCats, ...communityCats]);
        return ["All", ...Array.from(merged).filter((c) => c !== "All").sort()];
    }, [activeType, allItems]);

    // Counts per tab
    const modCount = allItems.filter((s) => s.type === "mod").length;
    const pluginCount = allItems.filter((s) => s.type === "plugin").length;
    const skillCount = allItems.filter((s) => s.type === "skill").length;
    const installedCount = installed.length;
    const bundleCount = SKILL_BUNDLES.length;
    const submitCount = userSubmissions.length;
    const tabCounts: Record<Tab, number> = { mods: modCount, plugins: pluginCount, skills: skillCount, bundles: bundleCount, installed: installedCount, submit: submitCount };

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Store className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to browse the market</p>
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
                            <Store className="h-6 w-6 text-amber-500" />
                        </div>
                        Market
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Browse, install, and manage mods, plugins, and skills for your agents
                    </p>
                </div>
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-sm">
                    {installedCount} installed
                </Badge>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border pb-px">
                {TABS.map(({ key, label, icon: Icon }) => (
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
                        <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full bg-muted">
                            {tabCounts[key]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Search + Filters (hidden on bundles & submit tabs) */}
            {tab !== "bundles" && tab !== "submit" && (
                <>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={`Search ${activeTabConfig?.label.toLowerCase() || "items"}...`}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {(["all", "verified", "community"] as const).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setSourceFilter(s)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${sourceFilter === s
                                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                                        }`}
                                >
                                    {s === "all" ? "All" : s === "verified" ? "Verified" : "Community"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Category Chips */}
                    {tab !== "installed" && categories.length > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto mb-6">
                            {categories.map((cat) => (
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
                    )}

                    {/* Items Grid */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                        </div>
                    ) : filteredItems.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filteredItems.map((item) => (
                                <MarketItemCard
                                    key={item.id}
                                    item={item}
                                    installed={installedMap.get(item.id)}
                                    onInstall={() => handleInstall(item.id)}
                                    onUninstall={() => { const inst = installedMap.get(item.id); if (inst) handleUninstall(inst); }}
                                    onToggle={() => { const inst = installedMap.get(item.id); if (inst) handleToggle(inst); }}
                                    busy={busyId === item.id}
                                />
                            ))}
                        </div>
                    ) : tab === "installed" && installed.length === 0 ? (
                        <Card className="p-12 text-center bg-card border-border border-dashed">
                            <Store className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Nothing installed yet</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                Browse the marketplace to install mods, plugins, and skills for your agents.
                            </p>
                            <Button onClick={() => setTab("skills")} className="bg-amber-500 hover:bg-amber-600 text-black gap-2">
                                <Puzzle className="h-4 w-4" /> Browse Skills
                            </Button>
                        </Card>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p>No items match your search</p>
                        </div>
                    )}
                </>
            )}

            {/* Submit Tab */}
            {tab === "submit" && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Your Submissions</h2>
                            <p className="text-sm text-muted-foreground">
                                Submit mods, plugins, and skills for the community marketplace
                            </p>
                        </div>
                        <Button
                            onClick={() => setSubmitOpen(true)}
                            className="bg-amber-600 hover:bg-amber-700 text-black gap-1.5"
                        >
                            <Plus className="h-4 w-4" />
                            Submit to Market
                        </Button>
                    </div>

                    {userSubmissions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {userSubmissions.map((sub) => (
                                <Card key={sub.id} className="p-4 bg-card border-border">
                                    <div className="flex items-start gap-3">
                                        <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted/50">
                                            {sub.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <h3 className="font-semibold text-sm truncate">{sub.name}</h3>
                                                <span className="text-[10px] text-muted-foreground">v{sub.version}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{sub.description}</p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge variant="outline" className="text-[10px]">{sub.category}</Badge>
                                                <Badge variant="outline" className="text-[10px] capitalize">{sub.type}</Badge>
                                                {sub.status === "pending" && (
                                                    <Badge variant="outline" className="text-[10px] border-yellow-500/20 text-yellow-500">
                                                        <Clock className="h-2.5 w-2.5 mr-0.5" />Pending
                                                    </Badge>
                                                )}
                                                {sub.status === "approved" && (
                                                    <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400">
                                                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Approved
                                                    </Badge>
                                                )}
                                                {sub.status === "rejected" && (
                                                    <Badge variant="outline" className="text-[10px] border-red-500/20 text-red-400">
                                                        <XCircle className="h-2.5 w-2.5 mr-0.5" />Rejected
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteSubmission(sub.id)}
                                            disabled={deletingId === sub.id}
                                            className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                                            title="Delete submission"
                                        >
                                            {deletingId === sub.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card className="p-12 text-center bg-card border-border border-dashed">
                            <Plus className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="text-lg font-semibold mb-2">No submissions yet</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                Share your custom mods, plugins, and skills with the community.
                            </p>
                            <Button
                                onClick={() => setSubmitOpen(true)}
                                className="bg-amber-600 hover:bg-amber-700 text-black gap-2"
                            >
                                <Plus className="h-4 w-4" /> Submit Your First Item
                            </Button>
                        </Card>
                    )}

                    <SubmitMarketItemDialog
                        open={submitOpen}
                        onOpenChange={setSubmitOpen}
                        submitterAddress={account?.address ?? ""}
                        onSubmitted={() => {
                            loadUserSubmissions();
                            loadCommunityItems();
                        }}
                    />
                </div>
            )}

            {/* Bundles Tab */}
            {tab === "bundles" && (
                <div className="space-y-4">
                    {SKILL_BUNDLES.map((bundle) => {
                        const bundleSkills = allItems.filter((s) => bundle.skillIds.includes(s.id));
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
                                            <Badge variant="outline" className="text-[10px]">{bundle.skillIds.length} items</Badge>
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
