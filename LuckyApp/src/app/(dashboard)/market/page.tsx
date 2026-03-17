/** Market — Marketplace for agent mods, plugins, skills, and agents. */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
    Search, Download, Trash2, Check, Loader2,
    Puzzle, Star, Shield, ShieldCheck, Wrench, Plug, Store,
    Layers, Users, Plus, Clock, CheckCircle2, XCircle,
    CreditCard, Crown, Infinity, Calendar, ChevronRight, Palette,
    Bot, Fingerprint, TrendingUp, Briefcase, DollarSign, Zap,
    Activity, StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import { useActiveAccount } from "thirdweb/react";
import { useSession } from "@/contexts/SessionContext";
import {
    type Skill, type OwnedItem, type MarketItemType, type CommunityMarketItem,
    type MarketSubscription, type SubscriptionPlan, type AgentInstall, type AgentDistribution,
    SKILL_REGISTRY, SKILL_BUNDLES, MOD_REGISTRY,
    MOD_CATEGORIES, PLUGIN_CATEGORIES, SKILL_ONLY_CATEGORIES, SKIN_CATEGORIES, AGENT_ITEM_CATEGORIES,
    acquireItem, removeFromInventory, toggleInventoryItem, getOwnedItems, acquireBundle,
    getCommunityItems, getUserSubmissions,
    getOrgSubscriptions, subscribeToItem, cancelSubscription,
    getAgentInstalls, uninstallMarketplaceAgent,
    getFeaturedItems,
} from "@/lib/skills";
import { computeRankingScore } from "@/lib/submission-protocol";
import { trackMarketplaceEvent } from "@/lib/posthog";
import { type Agent, getAgentsByOrg } from "@/lib/firestore";
import { SubmitMarketItemDialog } from "@/components/market/submit-dialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { type AgentPackage, getMarketplaceAgents } from "@/lib/skills";
import { PERSONA_REGISTRY, PERSONA_CATEGORIES } from "@/lib/personas";
import { PersonaCard } from "@/components/market/persona-card";
import { PersonaDetailDialog } from "@/components/market/persona-detail-dialog";
import { ApplyPersonaDialog } from "@/components/market/apply-persona-dialog";

// ═══════════════════════════════════════════════════════════════
// Tab Config
// ═══════════════════════════════════════════════════════════════

type Tab = "agents" | "mods" | "plugins" | "skills" | "skins" | "bundles" | "inventory" | "submit";

const TABS: { key: Tab; label: string; icon: typeof Wrench; type?: MarketItemType }[] = [
    { key: "agents", label: "Agents", icon: Bot, type: "agent" },
    { key: "mods", label: "Mods", icon: Wrench, type: "mod" },
    { key: "plugins", label: "Plugins", icon: Plug, type: "plugin" },
    { key: "skills", label: "Skills", icon: Puzzle, type: "skill" },
    { key: "skins", label: "Skins", icon: Palette, type: "skin" },
    { key: "bundles", label: "Bundles", icon: Layers },
    { key: "inventory", label: "Inventory", icon: Check },
    { key: "submit", label: "Submit", icon: Plus },
];

const CATEGORIES_BY_TYPE: Record<MarketItemType, string[]> = {
    mod: MOD_CATEGORIES,
    plugin: PLUGIN_CATEGORIES,
    skill: SKILL_ONLY_CATEGORIES,
    skin: SKIN_CATEGORIES,
    agent: AGENT_ITEM_CATEGORIES,
};

// ═══════════════════════════════════════════════════════════════
// Publisher Tier Badge
// ═══════════════════════════════════════════════════════════════

const TIER_BADGE_STYLES: Record<number, { label: string; color: string }> = {
    0: { label: "New Publisher", color: "border-zinc-500/30 text-zinc-400 bg-zinc-500/5" },
    1: { label: "Approved", color: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" },
    2: { label: "Trusted", color: "border-blue-500/30 text-blue-400 bg-blue-500/5" },
    3: { label: "Strategic Partner", color: "border-amber-500/30 text-amber-400 bg-amber-500/5" },
};

function PublisherTierBadge({ walletAddress }: { walletAddress?: string }) {
    const [tier, setTier] = useState<number | null>(null);
    const [quota, setQuota] = useState<{ used: number; max: number } | null>(null);

    useEffect(() => {
        if (!walletAddress) return;
        fetch(`/api/v1/marketplace/publisher/${walletAddress}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data) {
                    setTier(data.tier ?? 0);
                    setQuota({
                        used: data.stats?.totalSubmissions ?? 0,
                        max: data.quota?.maxPerWeek ?? 2,
                    });
                }
            })
            .catch(() => {});
    }, [walletAddress]);

    if (tier === null) return null;
    const style = TIER_BADGE_STYLES[tier] || TIER_BADGE_STYLES[0];

    return (
        <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${style.color}`}>
                {tier === 3 ? <Crown className="h-2.5 w-2.5 mr-0.5" /> : <Shield className="h-2.5 w-2.5 mr-0.5" />}
                {style.label}
            </Badge>
            {quota && (
                <span className="text-[10px] text-muted-foreground">
                    {quota.max - Math.min(quota.used, quota.max)}/{quota.max} this week
                </span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Market Item Card
// ═══════════════════════════════════════════════════════════════

/** Helper: format price display */
function formatPrice(price: number): string {
    return price % 1 === 0 ? `$${price}` : `$${price.toFixed(2)}`;
}

/** Helper: get cheapest tier label */
function getCheapestLabel(item: Skill): string | null {
    if (item.pricing.model === "free") return null;
    const tiers = item.pricing.tiers;
    if (!tiers || tiers.length === 0) return null;
    const monthly = tiers.find((t) => t.plan === "monthly");
    if (monthly) return `${formatPrice(monthly.price)}/mo`;
    const yearly = tiers.find((t) => t.plan === "yearly");
    if (yearly) return `${formatPrice(yearly.price)}/yr`;
    const lifetime = tiers.find((t) => t.plan === "lifetime");
    if (lifetime) return `${formatPrice(lifetime.price)} once`;
    return null;
}

/** Credit score color helper */
function creditScoreColor(score: number): string {
    if (score >= 750) return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
    if (score >= 600) return "text-amber-400 border-amber-500/20 bg-amber-500/10";
    return "text-red-400 border-red-500/20 bg-red-500/10";
}

/** Agent card — enhanced layout with AIN, scores, and distribution actions */
function AgentMarketCard({
    agent,
    onViewAgent,
    busy,
}: {
    agent: Agent;
    onViewAgent: () => void;
    busy: boolean;
}) {
    const statusColor = agent.status === "online"
        ? "bg-emerald-500"
        : agent.status === "busy"
            ? "bg-amber-500"
            : "bg-zinc-500";

    return (
        <Card className="p-0 bg-card border-border transition-all hover:border-cyan-500/20 group overflow-hidden">
            <div className="p-4">
                {/* Top row — avatar, name, status */}
                <div className="flex items-start gap-3 mb-3">
                    <div className="relative shrink-0">
                        {agent.avatarUrl ? (
                            <img
                                src={agent.avatarUrl}
                                alt={agent.name}
                                className="w-10 h-10 rounded-lg object-cover border border-border"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-lg">
                                <Bot className="h-5 w-5 text-cyan-400" />
                            </div>
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${statusColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                            <Badge variant="outline" className="text-[10px]">{agent.type}</Badge>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                            {agent.bio || agent.description || `${agent.type} agent`}
                        </p>
                    </div>
                </div>

                {/* ASN + Score badges */}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {agent.asn && (
                        <Badge className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-mono">
                            <Fingerprint className="h-2.5 w-2.5 mr-0.5" />
                            {agent.asn.split("-").slice(0, 4).join("-")}
                        </Badge>
                    )}
                    {agent.creditScore && (
                        <Badge className={`text-[10px] ${creditScoreColor(agent.creditScore)}`}>
                            <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                            Credit: {agent.creditScore}
                        </Badge>
                    )}
                    {agent.trustScore != null && (
                        <Badge className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                            <Shield className="h-2.5 w-2.5 mr-0.5" />
                            Trust: {agent.trustScore}
                        </Badge>
                    )}
                    {agent.onChainRegistered && (
                        <Badge variant="outline" className="text-[10px] border-purple-500/20 text-purple-400">
                            <Zap className="h-2.5 w-2.5 mr-0.5" />On-Chain
                        </Badge>
                    )}
                </div>

                {/* Skills */}
                {agent.reportedSkills && agent.reportedSkills.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mb-3">
                        {agent.reportedSkills.slice(0, 4).map((s) => (
                            <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                                {s.name}
                            </span>
                        ))}
                        {agent.reportedSkills.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{agent.reportedSkills.length - 4}</span>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <Link href={`/agents`} className="flex-1">
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-7 text-xs gap-1 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                        >
                            <Bot className="h-3 w-3" />
                            View Agent
                        </Button>
                    </Link>
                    <Badge
                        className={`text-[10px] ${agent.status === "online"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : agent.status === "busy"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                            }`}
                    >
                        <Activity className="h-2.5 w-2.5 mr-0.5" />
                        {agent.status}
                    </Badge>
                </div>
            </div>
        </Card>
    );
}

function MarketItemCard({
    item, owned, subscription, avgRating, ratingCount, onGet, onRemove, onSubscribe, onCancelSub, onRate, busy,
}: {
    item: Skill;
    owned?: OwnedItem;
    subscription?: MarketSubscription;
    avgRating?: number;
    ratingCount?: number;
    onGet: () => void;
    onRemove: () => void;
    onSubscribe: () => void;
    onCancelSub: () => void;
    onRate?: () => void;
    busy: boolean;
}) {
    const isPaid = item.pricing.model === "subscription";
    const priceLabel = getCheapestLabel(item);

    return (
        <Card className="p-0 bg-card border-border transition-all hover:border-amber-500/20 group overflow-hidden">
            <div className="flex items-start gap-3 p-4">
                <Link href={`/market/${item.id}`} className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted/50">
                        {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                            <span className="text-[10px] text-muted-foreground">v{item.version}</span>
                            {isPaid && priceLabel ? (
                                <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                                    <CreditCard className="h-2.5 w-2.5 mr-0.5" />{priceLabel}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400">Free</Badge>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                            {(() => {
                                const modEntry = MOD_REGISTRY.find((m) => m.legacySkillId === item.id);
                                const capCount = modEntry?.capabilities.length ?? 0;
                                return capCount > 1 ? (
                                    <Badge variant="outline" className="text-[10px] border-cyan-500/20 text-cyan-400">
                                        {capCount} capabilities
                                    </Badge>
                                ) : null;
                            })()}
                            {item.source === "verified" ? (
                                <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-500">
                                    <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Verified
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-400">
                                    <Users className="h-2.5 w-2.5 mr-0.5" />Community
                                </Badge>
                            )}
                            {subscription && (
                                <Badge className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20">
                                    <Crown className="h-2.5 w-2.5 mr-0.5" />
                                    {subscription.plan === "lifetime" ? "Lifetime" : subscription.plan === "yearly" ? "Yearly" : "Monthly"}
                                </Badge>
                            )}
                            {item.requiredKeys?.map((k) => (
                                <Badge key={k} variant="outline" className="text-[10px] border-amber-500/20 text-amber-500">
                                    <Shield className="h-2.5 w-2.5 mr-0.5" />{k}
                                </Badge>
                            ))}
                            {avgRating != null && avgRating > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
                                    <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                                    {avgRating.toFixed(1)}
                                    <span className="text-muted-foreground/50">({ratingCount ?? 0})</span>
                                </span>
                            )}
                        </div>
                    </div>
                </Link>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {owned ? (
                        <div className="flex items-center gap-1">
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                <Check className="h-2.5 w-2.5 mr-0.5" />Owned
                            </Badge>
                            {onRate && (
                                <button
                                    onClick={onRate}
                                    className="p-1 rounded text-amber-400 hover:bg-amber-500/10 transition-colors"
                                    title="Rate this item"
                                >
                                    <Star className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <button
                                onClick={onRemove}
                                disabled={busy}
                                className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Remove from inventory"
                            >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                    ) : isPaid && !subscription ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onSubscribe}
                            disabled={busy}
                            className="h-7 text-xs gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                        >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crown className="h-3 w-3" />}
                            Subscribe
                        </Button>
                    ) : (
                        <div className="flex items-center gap-1">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={onGet}
                                disabled={busy}
                                className="h-7 text-xs gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                            >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                Get
                            </Button>
                            {isPaid && subscription && (
                                <button
                                    onClick={onCancelSub}
                                    disabled={busy}
                                    className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Cancel subscription"
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
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
    const { address: sessionAddress, authenticated } = useSession();
    const userAddress = account?.address || sessionAddress || "";
    const [inventory, setInventory] = useState<OwnedItem[]>([]);
    const [communityItems, setCommunityItems] = useState<CommunityMarketItem[]>([]);
    const [userSubmissions, setUserSubmissions] = useState<CommunityMarketItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "type" | "rating" | "installs" | "trending">("name");
    const [category, setCategory] = useState("All");
    const [sourceFilter, setSourceFilter] = useState<"all" | "verified" | "community">("all");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("agents");
    const [subscriptions, setSubscriptions] = useState<MarketSubscription[]>([]);
    const [subscribeTarget, setSubscribeTarget] = useState<Skill | null>(null);
    const [submitOpen, setSubmitOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [orgAgents, setOrgAgents] = useState<Agent[]>([]);
    const [agentInstalls, setAgentInstalls] = useState<AgentInstall[]>([]);
    const [selectedPersona, setSelectedPersona] = useState<AgentPackage | null>(null);
    const [applyPersona, setApplyPersona] = useState<AgentPackage | null>(null);
    const [marketplaceAgents, setMarketplaceAgents] = useState<AgentPackage[]>([]);
    const [featuredCommunity, setFeaturedCommunity] = useState<CommunityMarketItem[]>([]);
    const [featuredAgents, setFeaturedAgents] = useState<AgentPackage[]>([]);
    const [ratingDialogItem, setRatingDialogItem] = useState<{ id: string; type: "agent" | "community"; name: string } | null>(null);

    const loadInventory = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const data = await getOwnedItems(currentOrg.id);
            setInventory(data);
        } catch (err) {
            console.error("Failed to load inventory:", err);
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

    const loadFeatured = useCallback(async () => {
        try {
            const { communityItems: fc, agents: fa } = await getFeaturedItems();
            setFeaturedCommunity(fc);
            setFeaturedAgents(fa);
        } catch {
            // silent
        }
    }, []);

    // Map for O(1) community item lookups (by both raw ID and "community-<id>" key)
    const communityItemMap = useMemo(() => {
        const map = new Map<string, CommunityMarketItem>();
        for (const c of communityItems) {
            map.set(`community-${c.id}`, c);
            map.set(c.id, c);
        }
        return map;
    }, [communityItems]);

    const loadUserSubmissions = useCallback(async () => {
        if (!account) return;
        try {
            const subs = await getUserSubmissions(userAddress);
            setUserSubmissions(subs);
        } catch (err) {
            console.error("Failed to load submissions:", err);
        }
    }, [account]);

    const loadSubscriptions = useCallback(async () => {
        if (!currentOrg) return;
        try {
            const subs = await getOrgSubscriptions(currentOrg.id);
            setSubscriptions(subs);
        } catch (err) {
            console.error("Failed to load subscriptions:", err);
        }
    }, [currentOrg]);

    const loadOrgAgents = useCallback(async () => {
        if (!currentOrg) return;
        try {
            const agents = await getAgentsByOrg(currentOrg.id);
            setOrgAgents(agents);
        } catch (err) {
            console.error("Failed to load org agents:", err);
        }
    }, [currentOrg]);

    const loadAgentInstalls = useCallback(async () => {
        if (!currentOrg) return;
        try {
            const installs = await getAgentInstalls(currentOrg.id);
            setAgentInstalls(installs.filter(i => i.status === "active"));
        } catch (err) {
            console.error("Failed to load agent installs:", err);
        }
    }, [currentOrg]);

    const loadMarketplaceAgents = useCallback(async () => {
        try {
            const agents = await getMarketplaceAgents();
            setMarketplaceAgents(agents);
        } catch (err) {
            console.error("Failed to load marketplace agents:", err);
        }
    }, []);

    useEffect(() => { loadInventory(); }, [loadInventory]);
    useEffect(() => { loadCommunityItems(); }, [loadCommunityItems]);
    useEffect(() => { loadUserSubmissions(); }, [loadUserSubmissions]);
    useEffect(() => { loadSubscriptions(); }, [loadSubscriptions]);
    useEffect(() => { loadOrgAgents(); }, [loadOrgAgents]);
    useEffect(() => { loadAgentInstalls(); }, [loadAgentInstalls]);
    useEffect(() => { loadMarketplaceAgents(); }, [loadMarketplaceAgents]);
    useEffect(() => { loadFeatured(); }, [loadFeatured]);

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
            pricing: c.pricing,
        }));

        return [...SKILL_REGISTRY, ...communitySkills];
    }, [communityItems]);

    const handleDeleteSubmission = async (docId: string) => {
        setDeletingId(docId);
        try {
            const res = await fetch(`/api/v1/marketplace/items/${docId}`, {
                method: "DELETE",
                headers: { "x-wallet-address": userAddress },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                console.error("Delete failed:", data.error);
            }
            trackMarketplaceEvent("submission_deleted", { itemId: docId });
            await loadUserSubmissions();
            await loadCommunityItems();
        } finally {
            setDeletingId(null);
        }
    };

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            if (search) trackMarketplaceEvent("search", { query: search, tab });
        }, 300);
        return () => clearTimeout(timer);
    }, [search, tab]);

    // Reset filters when switching tabs
    useEffect(() => { setCategory("All"); setSearch(""); setSortBy("name"); }, [tab]);

    const inventoryMap = useMemo(() => new Map(inventory.map((i) => [i.skillId, i])), [inventory]);
    const subscriptionMap = useMemo(() => new Map(subscriptions.map((s) => [s.itemId, s])), [subscriptions]);

    const handleGet = async (skillId: string) => {
        if (!currentOrg || (!account && !authenticated)) return;
        setBusyId(skillId);
        try {
            // Auto-install missing dependencies first
            const skill = SKILL_REGISTRY.find((s) => s.id === skillId);
            if (skill?.requires?.length) {
                const missing = skill.requires.filter((dep) => !inventoryMap.has(dep));
                for (const dep of missing) {
                    await acquireItem(currentOrg.id, dep, userAddress);
                }
            }
            await acquireItem(currentOrg.id, skillId, userAddress);
            trackMarketplaceEvent("item_installed", { skillId, type: skill?.type });
            await loadInventory();
            window.dispatchEvent(new Event("swarm-inventory-changed"));
        } finally { setBusyId(null); }
    };

    const handleRemove = async (item: OwnedItem) => {
        // Also remove any child mods that depend on this one
        const dependents = SKILL_REGISTRY.filter(
            (s) => s.requires?.includes(item.skillId) && inventoryMap.has(s.id)
        );
        setBusyId(item.skillId);
        try {
            for (const dep of dependents) {
                const depOwned = inventoryMap.get(dep.id);
                if (depOwned) await removeFromInventory(depOwned.id);
            }
            await removeFromInventory(item.id);
            trackMarketplaceEvent("item_removed", { skillId: item.skillId });
            await loadInventory();
            window.dispatchEvent(new Event("swarm-inventory-changed"));
        } finally { setBusyId(null); }
    };

    const handleGetBundle = async (bundleId: string) => {
        if (!currentOrg || !account) return;
        setBusyId(bundleId);
        try {
            await acquireBundle(
                currentOrg.id,
                bundleId,
                userAddress,
                inventory.map((i) => i.skillId),
            );
            await loadInventory();
            window.dispatchEvent(new Event("swarm-inventory-changed"));
        } finally { setBusyId(null); }
    };

    const handleSubscribe = async (itemId: string, plan: SubscriptionPlan, paymentMethod: "stripe" | "crypto" = "stripe") => {
        if (!currentOrg || (!account && !authenticated)) return;
        trackMarketplaceEvent("checkout_started", { itemId, plan, paymentMethod });
        setBusyId(itemId);
        try {
            if (paymentMethod === "stripe") {
                // Create Stripe Checkout Session and redirect
                const res = await fetch("/api/v1/marketplace/checkout", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-wallet-address": userAddress,
                    },
                    body: JSON.stringify({ modId: itemId, plan, orgId: currentOrg.id }),
                });
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                    return;
                }
                // Fallback to direct subscription if Stripe not configured
                if (data.error?.includes("not configured")) {
                    await subscribeToItem(currentOrg.id, itemId, plan, userAddress);
                    await loadSubscriptions();
                    setSubscribeTarget(null);
                }
            } else {
                // Crypto: create payment intent (user handles tx in wallet)
                const res = await fetch("/api/v1/marketplace/crypto-checkout", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-wallet-address": userAddress,
                    },
                    body: JSON.stringify({ modId: itemId, plan, orgId: currentOrg.id, chain: "hedera" }),
                });
                const data = await res.json();
                if (data.ok) {
                    // Store payment intent ID for later verification
                    alert(`Send ${data.amount} ${data.currency} to ${data.recipientAddress}\nPayment ID: ${data.paymentId}`);
                }
            }
        } finally { setBusyId(null); }
    };

    const handleCancelSubscription = async (sub: MarketSubscription) => {
        setBusyId(sub.itemId);
        try {
            await cancelSubscription(sub.id);
            await loadSubscriptions();
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

        // For inventory tab, only show owned items
        if (tab === "inventory") {
            items = items.filter((s) => inventoryMap.has(s.id));
        }

        // Search (debounced)
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
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

        // Sort
        items = [...items].sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name);
            if (sortBy === "type") return a.type.localeCompare(b.type);
            if (sortBy === "rating") {
                const aR = communityItemMap.get(a.id)?.avgRating ?? 0;
                const bR = communityItemMap.get(b.id)?.avgRating ?? 0;
                return bR - aR;
            }
            if (sortBy === "installs") {
                const aI = communityItemMap.get(a.id)?.installCount ?? 0;
                const bI = communityItemMap.get(b.id)?.installCount ?? 0;
                return bI - aI;
            }
            if (sortBy === "trending") {
                const score = (id: string) => {
                    const c = communityItemMap.get(id);
                    if (!c) return 0;
                    return computeRankingScore({
                        installCount: c.installCount ?? 0,
                        avgRating: c.avgRating ?? 0,
                        ratingCount: c.ratingCount ?? 0,
                        publishedAt: c.submittedAt,
                        publisherTier: 0,
                    });
                };
                return score(b.id) - score(a.id);
            }
            return 0;
        });

        return items;
    }, [allItems, activeType, tab, debouncedSearch, category, sourceFilter, sortBy, inventoryMap, communityItemMap]);

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

    // Persona marketplace — merge static registry with Firestore marketplace agents
    const allPersonas = useMemo(() => {
        return [...PERSONA_REGISTRY, ...marketplaceAgents];
    }, [marketplaceAgents]);

    // Filtered personas for the agents tab
    const filteredPersonas = useMemo(() => {
        let items = allPersonas;
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            items = items.filter((p) =>
                p.name.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.tags.some((t) => t.toLowerCase().includes(q)) ||
                (p.identity.personality || []).some((t) => t.toLowerCase().includes(q))
            );
        }
        if (category !== "All") {
            items = items.filter((p) => {
                const catLabel = p.category.charAt(0).toUpperCase() + p.category.slice(1);
                return catLabel === category;
            });
        }
        if (sourceFilter !== "all") {
            items = items.filter((p) => p.source === sourceFilter);
        }
        return items;
    }, [allPersonas, debouncedSearch, category, sourceFilter]);

    // Counts per tab
    const agentCount = allPersonas.length;
    const modCount = allItems.filter((s) => s.type === "mod").length;
    const pluginCount = allItems.filter((s) => s.type === "plugin").length;
    const skillCount = allItems.filter((s) => s.type === "skill").length;
    const inventoryCount = inventory.length;
    const bundleCount = SKILL_BUNDLES.length;
    const submitCount = userSubmissions.length;
    const skinCount = allItems.filter((s) => s.type === "skin").length;
    const tabCounts: Record<Tab, number> = { agents: agentCount, mods: modCount, plugins: pluginCount, skills: skillCount, skins: skinCount, bundles: bundleCount, inventory: inventoryCount, submit: submitCount };

    if (!account && !authenticated) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Store className="h-12 w-12 opacity-30" />
                <p>Sign in to browse the market</p>
            </div>
        );
    }

    return (
        <div className="w-full px-4 sm:px-6 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <Store className="h-6 w-6 text-amber-500" />
                        </div>
                        Market
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        Browse agents, mods, plugins, and skills for your swarm
                    </p>
                </div>
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-sm">
                    {inventoryCount} owned
                </Badge>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border pb-px overflow-x-auto scrollbar-none">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => { setTab(key); trackMarketplaceEvent("tab_changed", { tab: key }); }}
                        className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px whitespace-nowrap ${tab === key
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

            {/* Featured Items Hero */}
            {tab !== "submit" && tab !== "inventory" && (featuredCommunity.length > 0 || featuredAgents.length > 0) && (
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        </div>
                        <h2 className="text-sm font-semibold">Featured</h2>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {featuredAgents.map((agent) => (
                            <Card
                                key={`feat-agent-${agent.id}`}
                                className="min-w-[260px] max-w-[300px] p-4 bg-gradient-to-br from-amber-500/5 to-purple-500/5 border-amber-500/20 cursor-pointer hover:border-amber-500/40 transition-all shrink-0"
                                onClick={() => setSelectedPersona(agent)}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl">{agent.icon}</span>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-sm truncate">{agent.name}</h3>
                                        <p className="text-[10px] text-amber-400">Agent</p>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{agent.description}</p>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span className="flex items-center gap-0.5">
                                        <Download className="h-2.5 w-2.5" /> {agent.installCount ?? 0}
                                    </span>
                                    {(agent.avgRating ?? 0) > 0 && (
                                        <span className="flex items-center gap-0.5">
                                            <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                                            {agent.avgRating.toFixed(1)} ({agent.ratingCount})
                                        </span>
                                    )}
                                </div>
                            </Card>
                        ))}
                        {featuredCommunity.map((item) => (
                            <Card
                                key={`feat-community-${item.id}`}
                                className="min-w-[260px] max-w-[300px] p-4 bg-gradient-to-br from-amber-500/5 to-cyan-500/5 border-amber-500/20 hover:border-amber-500/40 transition-all shrink-0"
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl">{item.icon}</span>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-sm truncate">{item.name}</h3>
                                        <p className="text-[10px] text-amber-400 capitalize">{item.type}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span className="flex items-center gap-0.5">
                                        <Download className="h-2.5 w-2.5" /> {item.installCount ?? 0}
                                    </span>
                                    {(item.avgRating ?? 0) > 0 && (
                                        <span className="flex items-center gap-0.5">
                                            <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                                            {item.avgRating!.toFixed(1)} ({item.ratingCount ?? 0})
                                        </span>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Search + Filters (hidden on agents, bundles & submit tabs) */}
            {tab !== "agents" && tab !== "bundles" && tab !== "submit" && (
                <>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={`Search ${activeTabConfig?.label.toLowerCase() || "items"}...`}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={sortBy} onValueChange={(v) => { setSortBy(v as typeof sortBy); trackMarketplaceEvent("sort_changed", { sort: v }); }}>
                            <SelectTrigger className="w-[150px] shrink-0">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name">Name</SelectItem>
                                <SelectItem value="type">Type</SelectItem>
                                <SelectItem value="rating">Top Rated</SelectItem>
                                <SelectItem value="installs">Most Installed</SelectItem>
                                <SelectItem value="trending">Trending</SelectItem>
                            </SelectContent>
                        </Select>
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
                    {tab !== "inventory" && categories.length > 1 && (
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {Array.from({ length: 8 }, (_, i) => (
                                <Card key={i} className="p-4 bg-card/80 border-border">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-muted/50 animate-pulse shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 w-2/3 bg-muted/50 rounded animate-pulse" />
                                            <div className="h-3 w-full bg-muted/30 rounded animate-pulse" />
                                            <div className="flex gap-2 mt-1">
                                                <div className="h-5 w-16 bg-muted/30 rounded-full animate-pulse" />
                                                <div className="h-5 w-14 bg-muted/30 rounded-full animate-pulse" />
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : filteredItems.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {filteredItems.map((item) => {
                                // For community items, subscription key is the Firestore doc ID (strip "community-" prefix)
                                const subKey = item.id.startsWith("community-") ? item.id.slice(10) : item.id;
                                const sub = subscriptionMap.get(subKey);
                                return (
                                    <MarketItemCard
                                        key={item.id}
                                        item={item}
                                        owned={inventoryMap.get(item.id)}
                                        subscription={sub}
                                        avgRating={communityItemMap.get(item.id)?.avgRating}
                                        ratingCount={communityItemMap.get(item.id)?.ratingCount}
                                        onGet={() => handleGet(item.id)}
                                        onRemove={() => { const own = inventoryMap.get(item.id); if (own) handleRemove(own); }}
                                        onSubscribe={() => setSubscribeTarget(item)}
                                        onCancelSub={() => { if (sub) handleCancelSubscription(sub); }}
                                        onRate={() => {
                                            const cId = item.id.startsWith("community-") ? item.id.slice(10) : item.id;
                                            setRatingDialogItem({ id: cId, type: "community", name: item.name });
                                        }}
                                        busy={busyId === item.id}
                                    />
                                );
                            })}
                        </div>
                    ) : tab === "inventory" && inventory.length === 0 ? (
                        <Card className="p-12 text-center bg-card border-border border-dashed">
                            <Store className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Your inventory is empty</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                Browse the market to get mods, plugins, and skills for your swarm.
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

            {/* Agents / Persona Marketplace Tab */}
            {tab === "agents" && (
                <div className="space-y-8">
                    {/* Search + Filters for personas */}
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search personas..."
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
                                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                                            }`}
                                    >
                                        {s === "all" ? "All" : s === "verified" ? "Official" : "Community"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category chips */}
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            {PERSONA_CATEGORIES.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${category === cat
                                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Persona Grid */}
                    {filteredPersonas.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            {filteredPersonas.map((persona) => (
                                <PersonaCard
                                    key={persona.id}
                                    persona={persona}
                                    onSelect={setSelectedPersona}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p>No personas match your search</p>
                        </div>
                    )}

                    {/* Your Agents section */}
                    {orgAgents.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-border">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold">Your Agents</h2>
                                <Badge variant="outline" className="text-xs">{orgAgents.length}</Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                {orgAgents.map((agent) => (
                                    <AgentMarketCard
                                        key={agent.id}
                                        agent={agent}
                                        onViewAgent={() => {}}
                                        busy={false}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
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
                        <div className="flex items-center gap-3">
                            {/* Publisher Tier Badge */}
                            <PublisherTierBadge walletAddress={account?.address} />
                            <Button
                                onClick={() => { setSubmitOpen(true); trackMarketplaceEvent("submission_started"); }}
                                className="bg-amber-600 hover:bg-amber-700 text-black gap-1.5"
                            >
                                <Plus className="h-4 w-4" />
                                Submit to Market
                            </Button>
                        </div>
                    </div>

                    {userSubmissions.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
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
                                                {sub.pricing?.model === "subscription" ? (
                                                    <Badge variant="outline" className="text-[10px] border-purple-500/20 text-purple-400">
                                                        <CreditCard className="h-2.5 w-2.5 mr-0.5" />Paid
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400">Free</Badge>
                                                )}
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
                                                {sub.status === "changes_requested" && (
                                                    <Badge variant="outline" className="text-[10px] border-orange-500/20 text-orange-400">
                                                        <Clock className="h-2.5 w-2.5 mr-0.5" />Changes Requested
                                                    </Badge>
                                                )}
                                                {sub.status === "suspended" && (
                                                    <Badge variant="outline" className="text-[10px] border-red-500/20 text-red-500">
                                                        <StopCircle className="h-2.5 w-2.5 mr-0.5" />Suspended
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
                                onClick={() => { setSubmitOpen(true); trackMarketplaceEvent("submission_started"); }}
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
                        const allOwned = bundle.skillIds.every((id) => inventoryMap.has(id));
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
                                            {allOwned && (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                                    <Check className="h-2.5 w-2.5 mr-0.5" /> Owned
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-3">{bundle.description}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {bundleSkills.map((s) => (
                                                <span
                                                    key={s.id}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${inventoryMap.has(s.id)
                                                            ? "bg-emerald-500/10 text-emerald-400"
                                                            : "bg-muted/50 text-muted-foreground"
                                                        }`}
                                                >
                                                    {s.icon} {s.name}
                                                    {inventoryMap.has(s.id) && <Check className="h-3 w-3" />}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        {allOwned ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                <Check className="h-3 w-3 mr-1" /> All Owned
                                            </Badge>
                                        ) : (
                                            <Button
                                                size="sm"
                                                onClick={() => handleGetBundle(bundle.id)}
                                                disabled={busyId === bundle.id}
                                                className="bg-amber-500 hover:bg-amber-600 text-black gap-1"
                                            >
                                                {busyId === bundle.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Download className="h-3 w-3" />
                                                )}
                                                Get Bundle
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Subscribe Plan Picker Dialog */}
            <Dialog open={!!subscribeTarget} onOpenChange={(open) => { if (!open) setSubscribeTarget(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <span className="text-xl">{subscribeTarget?.icon}</span>
                            Subscribe to {subscribeTarget?.name}
                        </DialogTitle>
                    </DialogHeader>
                    {subscribeTarget?.pricing.tiers && subscribeTarget.pricing.tiers.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Choose a plan to access this {subscribeTarget.type}. The creator controls pricing and access.
                            </p>
                            <div className="grid gap-2">
                                {subscribeTarget.pricing.tiers.map((tier) => {
                                    const subKey = subscribeTarget.id.startsWith("community-") ? subscribeTarget.id.slice(10) : subscribeTarget.id;
                                    return (
                                    <div key={tier.plan} className="rounded-lg border border-border p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {tier.plan === "monthly" && <Calendar className="h-5 w-5 text-purple-400" />}
                                                {tier.plan === "yearly" && <Crown className="h-5 w-5 text-amber-400" />}
                                                {tier.plan === "lifetime" && <Infinity className="h-5 w-5 text-emerald-400" />}
                                                <div>
                                                    <div className="font-semibold text-sm capitalize">{tier.plan}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {tier.plan === "monthly" && "Billed monthly, cancel anytime"}
                                                        {tier.plan === "yearly" && "Billed annually, best value"}
                                                        {tier.plan === "lifetime" && "One-time payment, forever access"}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-sm">{formatPrice(tier.price)}</div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    {tier.plan === "monthly" ? "/month" : tier.plan === "yearly" ? "/year" : "once"}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleSubscribe(subKey, tier.plan, "stripe")}
                                                disabled={!!busyId}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                                            >
                                                <CreditCard className="h-3.5 w-3.5" /> Pay with Card
                                            </button>
                                            <button
                                                onClick={() => handleSubscribe(subKey, tier.plan, "crypto")}
                                                disabled={!!busyId}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border border-border hover:bg-muted/50 text-xs font-medium transition-colors disabled:opacity-50"
                                            >
                                                <Zap className="h-3.5 w-3.5" /> Pay with Crypto
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                            {busyId && (
                                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No pricing tiers available for this item.</p>
                    )}
                </DialogContent>
            </Dialog>

            {/* Persona Detail Dialog */}
            <PersonaDetailDialog
                open={!!selectedPersona}
                onOpenChange={(open) => { if (!open) setSelectedPersona(null); }}
                persona={selectedPersona}
                onApply={(p) => { setSelectedPersona(null); setApplyPersona(p); }}
            />

            {/* Apply Persona to Agent Dialog */}
            <ApplyPersonaDialog
                open={!!applyPersona}
                onOpenChange={(open) => { if (!open) setApplyPersona(null); }}
                persona={applyPersona}
                orgId={currentOrg?.id || ""}
                installerAddress={userAddress}
                onApplied={() => { setApplyPersona(null); loadOrgAgents(); loadAgentInstalls(); }}
            />

            {/* Rating Dialog */}
            <Dialog open={!!ratingDialogItem} onOpenChange={(open) => { if (!open) setRatingDialogItem(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Rate {ratingDialogItem?.name}</DialogTitle>
                    </DialogHeader>
                    <RatingInput
                        onSubmit={async (rating, review) => {
                            if (!ratingDialogItem || !currentOrg) return;
                            await fetch("/api/v1/marketplace/rate", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "x-wallet-address": userAddress,
                                },
                                body: JSON.stringify({
                                    itemId: ratingDialogItem.id,
                                    itemType: ratingDialogItem.type,
                                    rating,
                                    review,
                                    orgId: currentOrg.id,
                                }),
                            });
                            trackMarketplaceEvent("rating_submitted", { itemId: ratingDialogItem.id, itemType: ratingDialogItem.type, rating });
                            setRatingDialogItem(null);
                            loadCommunityItems();
                            loadMarketplaceAgents();
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RatingInput({ onSubmit }: { onSubmit: (rating: number, review: string) => Promise<void> }) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [review, setReview] = useState("");
    const [submitting, setSubmitting] = useState(false);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-1 justify-center">
                {Array.from({ length: 5 }, (_, i) => (
                    <button
                        key={i}
                        onMouseEnter={() => setHover(i + 1)}
                        onMouseLeave={() => setHover(0)}
                        onClick={() => setRating(i + 1)}
                        className="p-1 transition-transform hover:scale-110"
                    >
                        <Star
                            className={`h-6 w-6 ${
                                (hover || rating) > i
                                    ? "text-amber-400 fill-amber-400"
                                    : "text-muted-foreground/30"
                            }`}
                        />
                    </button>
                ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
                {rating === 0 ? "Select a rating" : `${rating} star${rating > 1 ? "s" : ""}`}
            </p>
            <textarea
                placeholder="Write a review (optional, max 500 chars)"
                value={review}
                onChange={(e) => setReview(e.target.value.slice(0, 500))}
                className="w-full h-20 rounded-lg border border-border bg-muted/30 p-3 text-sm resize-none"
            />
            <Button
                onClick={async () => {
                    if (rating === 0) return;
                    setSubmitting(true);
                    await onSubmit(rating, review);
                    setSubmitting(false);
                }}
                disabled={rating === 0 || submitting}
                className="w-full bg-amber-600 hover:bg-amber-700 text-black gap-2"
            >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                Submit Rating
            </Button>
        </div>
    );
}
