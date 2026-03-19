/** Chainlink CRE Workspace — Full vendor mod developer toolkit with live oracle data. */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useActiveAccount, useActiveWalletChain } from "thirdweb/react";
import { ethers } from "ethers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import BlurText from "@/components/reactbits/BlurText";
import { useOrg } from "@/contexts/OrgContext";
import {
    Link, GitBranch, BarChart3, RefreshCw, ShieldCheck,
    Play, Pause, Rocket, Code, Wrench, FlaskConical, Plus, Trash2,
    TrendingUp, Bot, CheckCircle, Workflow,
    FileCode, GraduationCap, Copy, ChevronDown, ChevronRight,
    ArrowRight, Terminal, Clock, Activity, Cpu, Handshake,
    Zap, Shield, Layers, Fingerprint, Scale, AlertTriangle,
    Search, Eye, Ban, Wallet, ExternalLink, AlertCircle, Fuel,
} from "lucide-react";
import {
    CHAINLINK_TOOLS,
    CHAINLINK_WORKFLOWS,
    CHAINLINK_EXAMPLES,
    CHAINLINK_AGENT_SKILLS,
    CHAINLINK_DOCS,
    PLAYGROUND_MOCK_RESPONSES,
    MOCK_ASN_PROFILES,
    MOCK_FRAUD_ALERTS,
    ASN_SCORE_BANDS,
    generateASN,
    getScoreBand,
    getDefaultPolicy,
    type ASNProfile,
    type ScoreBand,
    type PolicyState,
    executePlaygroundTool,
    TOOL_EXECUTION_META,
    type PlaygroundExecutionResult,
} from "@/lib/chainlink";
import { shortAddress } from "@/lib/chains";
import { getAgentsByOrg, type Agent } from "@/lib/firestore";
import {
    fetchAllPrices, fetchLivePrices,
    getWorkflows, createWorkflow, deleteWorkflow, toggleWorkflowStatus,
    type PriceFeedResult, type ChainlinkWorkflow, type WorkflowType,
} from "@/lib/chainlink-service";

// ═══════════════════════════════════════════════════════════════
// Icon resolver — maps string icon names from data to components
// ═══════════════════════════════════════════════════════════════

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
    GitBranch, BarChart3, RefreshCw, ShieldCheck,
    TrendingUp, Handshake, Bot, CheckCircle, Workflow,
    Rocket, FileCode, GraduationCap, Fingerprint,
};

function resolveIcon(name: string) {
    return ICON_MAP[name] || Wrench;
}

// Tool ID → playground key mapping
const TOOL_TO_PLAYGROUND: Record<string, string> = {
    "cre-workflow": "execute_cre",
    "data-feeds": "fetch_price",
    "automation": "start_automation",
    "offchain-verify": "verify_data",
    "collect-multichain": "collect_multichain",
    "compute-score": "compute_score",
    "publish-attestation": "publish_attestation",
    "ccip-propagate": "ccip_propagate",
    "trigger-risk-policy": "trigger_risk_policy",
    "generate-asn": "generate_asn",
    "register-identity": "register_identity",
    "lookup-asn": "lookup_asn",
    "freeze-identity": "freeze_identity",
    "identity-graph": "generate_asn",
};

const WORKFLOW_TYPE_META: Record<WorkflowType, { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string }> = {
    Functions: { icon: Zap, color: "text-blue-400" },
    Automation: { icon: RefreshCw, color: "text-amber-400" },
    VRF: { icon: Shield, color: "text-purple-400" },
    CCIP: { icon: Layers, color: "text-emerald-400" },
};

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════

export default function ChainlinkPage() {
    const { currentOrg } = useOrg();
    const account = useActiveAccount();
    const chain = useActiveWalletChain();
    const [activeTab, setActiveTab] = useState("overview");
    const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
    const [expandedExample, setExpandedExample] = useState<string | null>(null);
    const [playgroundTool, setPlaygroundTool] = useState("fetch_price");
    const [playgroundRunning, setPlaygroundRunning] = useState(false);
    const [playgroundResult, setPlaygroundResult] = useState<string | null>(null);
    const [playgroundLatency, setPlaygroundLatency] = useState<string | null>(null);
    const [activeDoc, setActiveDoc] = useState("asn-overview");
    const [copied, setCopied] = useState(false);

    // ─── Playground wallet state ───
    const [walletBalance, setWalletBalance] = useState<string | null>(null);
    const [playgroundTxHash, setPlaygroundTxHash] = useState<string | null>(null);
    const [playgroundExplorerUrl, setPlaygroundExplorerUrl] = useState<string | null>(null);
    const [playgroundGasUsed, setPlaygroundGasUsed] = useState<string | null>(null);
    const [playgroundBlockNumber, setPlaygroundBlockNumber] = useState<number | null>(null);
    const [playgroundIsLive, setPlaygroundIsLive] = useState(false);
    const [playgroundError, setPlaygroundError] = useState<string | null>(null);

    // ─── ASN state ───
    const [asnProfiles, setAsnProfiles] = useState<ASNProfile[]>(MOCK_ASN_PROFILES);
    const [asnSearch, setAsnSearch] = useState("");
    const [asnBandFilter, setAsnBandFilter] = useState<ScoreBand | "all">("all");
    const [selectedAsn, setSelectedAsn] = useState<ASNProfile | null>(null);
    const [showRegister, setShowRegister] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [orgAgents, setOrgAgents] = useState<Agent[]>([]);
    const [orgAgentsLoading, setOrgAgentsLoading] = useState(false);
    const [selectedAgentId, setSelectedAgentId] = useState<string>("");
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [policyAgent, setPolicyAgent] = useState<ASNProfile | null>(null);

    // ─── Org agents for registration dropdown ───
    const availableAgents = useMemo(() =>
        orgAgents.filter(a => !a.linkOnChainRegistered && !a.asnOnChainRegistered),
        [orgAgents]
    );
    const selectedAgent = useMemo(() =>
        orgAgents.find(a => a.id === selectedAgentId) || null,
        [selectedAgentId, orgAgents]
    );

    useEffect(() => {
        if (!showRegister || !currentOrg) return;
        setOrgAgentsLoading(true);
        setRegisterError(null);
        getAgentsByOrg(currentOrg.id)
            .then(setOrgAgents)
            .catch(() => setRegisterError("Failed to load agents"))
            .finally(() => setOrgAgentsLoading(false));
    }, [showRegister, currentOrg]);

    // ─── Wallet balance for playground ───
    useEffect(() => {
        if (!account?.address) { setWalletBalance(null); return; }
        const fetchBal = async () => {
            try {
                const provider = new ethers.JsonRpcProvider("https://testnet.hashio.io/api");
                const raw = await provider.getBalance(account.address);
                setWalletBalance((Number(raw) / 1e8).toFixed(4));
            } catch { setWalletBalance("—"); }
        };
        fetchBal();
        const iv = setInterval(fetchBal, 30_000);
        return () => clearInterval(iv);
    }, [account?.address]);

    /** Dynamic request JSON — injects connected wallet address */
    const getPlaygroundRequest = useMemo(() => {
        const mock = PLAYGROUND_MOCK_RESPONSES[playgroundTool];
        if (!mock) return "{}";
        if (account?.address) {
            return mock.request
                .replace(/"0x1234\.\.\.abcd"/g, `"${account.address}"`)
                .replace(/"agent-0x1234\.\.\.abcd"/g, `"agent-${account.address}"`);
        }
        return mock.request;
    }, [playgroundTool, account?.address]);

    // ─── Live price feeds ───
    const [livePrices, setLivePrices] = useState<PriceFeedResult[]>([]);
    const [pricesLoading, setPricesLoading] = useState(true);

    // ─── Workflows from Firestore ───
    const [workflows, setWorkflows] = useState<ChainlinkWorkflow[]>([]);
    const [workflowsLoading, setWorkflowsLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newWfName, setNewWfName] = useState("");
    const [newWfDesc, setNewWfDesc] = useState("");
    const [newWfType, setNewWfType] = useState<WorkflowType>("Functions");
    const [newWfTrigger, setNewWfTrigger] = useState("");
    const [creating, setCreating] = useState(false);

    // ─── Load live prices ───
    const loadPrices = useCallback(async () => {
        try {
            const prices = await fetchAllPrices();
            setLivePrices(prices.filter((p) => p.status === "success"));
        } catch {
            // keep existing prices on error
        } finally {
            setPricesLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPrices();
        const interval = setInterval(loadPrices, 30_000);
        return () => clearInterval(interval);
    }, [loadPrices]);

    // ─── Load workflows ───
    const loadWorkflows = useCallback(async () => {
        if (!currentOrg) { setWorkflows([]); setWorkflowsLoading(false); return; }
        try {
            const wfs = await getWorkflows(currentOrg.id);
            setWorkflows(wfs);
        } catch {
            // keep existing on error
        } finally {
            setWorkflowsLoading(false);
        }
    }, [currentOrg]);

    useEffect(() => { loadWorkflows(); }, [loadWorkflows]);

    // ─── Playground run ───
    const handleRun = async () => {
        setPlaygroundRunning(true);
        setPlaygroundResult(null);
        setPlaygroundLatency(null);
        setPlaygroundTxHash(null);
        setPlaygroundBlockNumber(null);
        setPlaygroundGasUsed(null);
        setPlaygroundExplorerUrl(null);
        setPlaygroundIsLive(false);
        setPlaygroundError(null);

        if (playgroundTool === "fetch_price") {
            const start = performance.now();
            try {
                const results = await fetchLivePrices(["ETH/USD"], "ethereum");
                const elapsed = Math.round(performance.now() - start);
                if (results.length > 0 && results[0].status === "success") {
                    setPlaygroundResult(JSON.stringify(results[0], null, 2));
                    setPlaygroundLatency(`${elapsed}ms`);
                    setPlaygroundIsLive(true);
                } else {
                    const all = await fetchAllPrices();
                    const eth = all.find((p) => p.pair === "ETH/USD" && p.status === "success");
                    const finalElapsed = Math.round(performance.now() - start);
                    setPlaygroundResult(JSON.stringify(eth || { error: "No ETH/USD feed available", results: all }, null, 2));
                    setPlaygroundLatency(`${finalElapsed}ms`);
                    if (eth) setPlaygroundIsLive(true);
                }
            } catch (err) {
                const elapsed = Math.round(performance.now() - start);
                setPlaygroundResult(JSON.stringify({ error: String(err) }, null, 2));
                setPlaygroundLatency(`${elapsed}ms`);
                setPlaygroundError(String(err));
            }
        } else {
            try {
                const result: PlaygroundExecutionResult = await executePlaygroundTool(playgroundTool);
                setPlaygroundResult(result.response);
                setPlaygroundLatency(result.latency);
                setPlaygroundTxHash(result.txHash ?? null);
                setPlaygroundBlockNumber(result.blockNumber ?? null);
                setPlaygroundGasUsed(result.gasUsed ?? null);
                setPlaygroundExplorerUrl(result.explorerUrl ?? null);
                setPlaygroundIsLive(result.isLive);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setPlaygroundResult(JSON.stringify({ error: msg }, null, 2));
                setPlaygroundLatency("0ms");
                setPlaygroundError(msg);
            }
        }
        setPlaygroundRunning(false);
    };

    // ─── Workflow CRUD handlers ───
    const handleCreateWorkflow = async () => {
        if (!currentOrg || !newWfName.trim()) return;
        setCreating(true);
        try {
            await createWorkflow(currentOrg.id, {
                name: newWfName.trim(),
                description: newWfDesc.trim(),
                type: newWfType,
                trigger: newWfTrigger.trim() || "Manual",
            }, currentOrg.ownerAddress || "unknown");
            setNewWfName(""); setNewWfDesc(""); setNewWfTrigger("");
            setShowCreate(false);
            await loadWorkflows();
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteWorkflow = async (id: string) => {
        await deleteWorkflow(id);
        await loadWorkflows();
    };

    const handleToggleWorkflow = async (id: string, current: string) => {
        await toggleWorkflowStatus(id, current === "active" ? "paused" : "active");
        await loadWorkflows();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // ─── ASN handlers ───
    const handleRegisterASN = async () => {
        if (!selectedAgentId || !currentOrg) return;
        setRegistering(true);
        setRegisterError(null);
        try {
            const res = await fetch("/api/v1/agents/link-register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId: selectedAgentId, orgId: currentOrg.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Registration failed");

            const newProfile: ASNProfile = {
                asn: data.asn,
                agentName: data.agentName,
                agentType: data.agentType,
                creatorOrgId: currentOrg.id,
                creatorWallet: "platform",
                linkedWallets: [],
                deploymentEnvironment: "mainnet",
                modelProvider: "anthropic",
                skillModules: [],
                creationTimestamp: new Date().toISOString(),
                verificationLevel: "basic",
                status: "active",
                jurisdictionTag: "US",
                riskFlags: [],
                trustScore: data.trustScore ?? 50,
                fraudRiskScore: 25,
                creditScore: data.creditScore ?? 680,
                activitySummary: { totalTasks: 0, completedTasks: 0, totalTransactions: 0, totalVolumeUsd: 0, activeChains: ["sepolia"], firstSeen: new Date().toISOString(), lastActive: new Date().toISOString() },
                connectionGraphHash: "0x" + Math.random().toString(16).substring(2, 14),
                attestationRefs: data.onChain.agentTxHash ? [data.onChain.agentTxHash] : [],
            };
            setAsnProfiles((prev) => [newProfile, ...prev]);
            setOrgAgents((prev) => prev.map(a => a.id === selectedAgentId ? { ...a, linkOnChainRegistered: true, asnOnChainRegistered: true } : a));
            setSelectedAgentId("");
            setShowRegister(false);
        } catch (err) {
            setRegisterError(err instanceof Error ? err.message : "Registration failed");
        } finally {
            setRegistering(false);
        }
    };

    const filteredProfiles = asnProfiles.filter((p) => {
        const matchSearch = !asnSearch || p.asn.toLowerCase().includes(asnSearch.toLowerCase()) || p.agentName.toLowerCase().includes(asnSearch.toLowerCase());
        const matchBand = asnBandFilter === "all" || getScoreBand(p.creditScore).band === asnBandFilter;
        return matchSearch && matchBand;
    });

    const asnStats = {
        total: asnProfiles.length,
        active: asnProfiles.filter((p) => p.status === "active").length,
        suspended: asnProfiles.filter((p) => p.status === "suspended").length,
        avgCredit: Math.round(asnProfiles.reduce((s, p) => s + p.creditScore, 0) / (asnProfiles.length || 1)),
    };

    // ─── Stats for overview ───
    const stats = [
        { label: "ASN Identities", value: asnProfiles.length, icon: Fingerprint, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
        { label: "Dev Tools", value: CHAINLINK_TOOLS.length, icon: Wrench, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
        { label: "Workflows", value: workflows.length + CHAINLINK_WORKFLOWS.length, icon: GitBranch, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
        { label: "Live Feeds", value: livePrices.length, icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <Link className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                        <BlurText text="Chainlink" className="text-2xl font-bold" delay={80} animateBy="words" />
                        <p className="text-sm text-muted-foreground">CRE Developer Toolkit</p>
                    </div>
                </div>
                <Badge variant="outline" className="text-xs">v2.0.0</Badge>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="asn-registry">ASN Registry</TabsTrigger>
                    <TabsTrigger value="credit-bureau">Credit Bureau</TabsTrigger>
                    <TabsTrigger value="policy-engine">Policy Engine</TabsTrigger>
                    <TabsTrigger value="tools">Tools</TabsTrigger>
                    <TabsTrigger value="workflows">Workflows</TabsTrigger>
                    <TabsTrigger value="examples">Examples</TabsTrigger>
                    <TabsTrigger value="playground">Playground</TabsTrigger>
                    <TabsTrigger value="docs">Docs</TabsTrigger>
                </TabsList>

                {/* ═══════════════════════════════════════════════════ */}
                {/* OVERVIEW TAB                                       */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="overview">
                    <div className="space-y-6">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {stats.map((s) => (
                                <SpotlightCard key={s.label} className="p-0" spotlightColor="rgba(59, 130, 246, 0.08)">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs text-muted-foreground">{s.label}</p>
                                                <p className="text-2xl font-bold">{s.value}</p>
                                            </div>
                                            <div className={`p-2.5 rounded-xl border ${s.bg}`}>
                                                <s.icon className={`h-5 w-5 ${s.color}`} />
                                            </div>
                                        </div>
                                    </CardContent>
                                </SpotlightCard>
                            ))}
                        </div>

                        {/* Quick Actions */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {[
                                    { label: "ASN Registry", desc: "Agent identity management", icon: Fingerprint, tab: "asn-registry", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
                                    { label: "Credit Bureau", desc: "Scores, bands & risk", icon: Scale, tab: "credit-bureau", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                                    { label: "Explore Tools", desc: "Browse CRE tools and APIs", icon: Wrench, tab: "tools", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
                                    { label: "Open Playground", desc: "Live oracle queries", icon: FlaskConical, tab: "playground", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                                ].map((a) => (
                                    <button
                                        key={a.label}
                                        onClick={() => setActiveTab(a.tab)}
                                        className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${a.bg}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <a.icon className={`h-5 w-5 ${a.color}`} />
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="font-medium text-sm mt-3">{a.label}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">{a.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ASN Summary */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                <Fingerprint className="h-4 w-4 text-purple-400" />
                                Agent Social Numbers
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: "Registered", value: asnStats.total, color: "text-purple-400" },
                                    { label: "Active", value: asnStats.active, color: "text-emerald-400" },
                                    { label: "Suspended", value: asnStats.suspended, color: "text-red-400" },
                                    { label: "Avg Credit", value: asnStats.avgCredit, color: getScoreBand(asnStats.avgCredit).color },
                                ].map((s) => (
                                    <Card key={s.label} className="border-border">
                                        <CardContent className="p-3">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                                            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                            <div className="flex gap-1.5 mt-3">
                                {ASN_SCORE_BANDS.map((band) => {
                                    const count = asnProfiles.filter((p) => getScoreBand(p.creditScore).band === band.band).length;
                                    return (
                                        <div key={band.band} className={`flex-1 rounded-lg border p-2 text-center ${band.bgColor} ${band.borderColor}`}>
                                            <p className={`text-lg font-bold ${band.color}`}>{count}</p>
                                            <p className="text-[10px] text-muted-foreground">{band.label}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Getting Started */}
                        <Card className="border-border">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Rocket className="h-4 w-4 text-blue-400" />
                                    Getting Started
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {[
                                        { step: 1, title: "Install the Mod", desc: "Get the Chainlink mod from the Marketplace to add CRE tools to your organization." },
                                        { step: 2, title: "Spawn an Agent", desc: "Register an agent with Chainlink skills — it can fetch prices, run CRE workflows, and verify data." },
                                        { step: 3, title: "Run a Workflow", desc: "Use the Playground to query live oracle data, or create a workflow from the Workflows tab." },
                                    ].map((s) => (
                                        <div key={s.step} className="flex items-start gap-3">
                                            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-bold border border-blue-500/20">
                                                {s.step}
                                            </span>
                                            <div>
                                                <p className="text-sm font-medium">{s.title}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Agent Skills Preview */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3">Agent Skills</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {CHAINLINK_AGENT_SKILLS.map((skill) => (
                                    <Card key={skill.id} className="border-border">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Cpu className="h-4 w-4 text-purple-400" />
                                                <code className="text-xs font-mono text-purple-400">{skill.id}</code>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{skill.description}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* ASN REGISTRY TAB                                    */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="asn-registry">
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                    <Fingerprint className="h-6 w-6 text-purple-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Agent Social Numbers</h2>
                                    <p className="text-xs text-muted-foreground">Persistent identity for AI agents — TransUnion for autonomous software</p>
                                </div>
                            </div>
                            <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5" onClick={() => setShowRegister(true)}>
                                <Plus className="h-3.5 w-3.5" /> Register Agent
                            </Button>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: "Total Registered", value: asnStats.total, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
                                { label: "Active", value: asnStats.active, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                                { label: "Suspended", value: asnStats.suspended, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                                { label: "Avg Credit Score", value: asnStats.avgCredit, color: getScoreBand(asnStats.avgCredit).color, bg: `${getScoreBand(asnStats.avgCredit).bgColor} ${getScoreBand(asnStats.avgCredit).borderColor}` },
                            ].map((s) => (
                                <Card key={s.label} className={`border ${s.bg}`}>
                                    <CardContent className="p-4">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Search + Filter */}
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search by ASN or agent name..." value={asnSearch} onChange={(e) => setAsnSearch(e.target.value)} className="pl-9" />
                            </div>
                            <Select value={asnBandFilter} onValueChange={(v) => setAsnBandFilter(v as ScoreBand | "all")}>
                                <SelectTrigger className="w-40"><SelectValue placeholder="All Bands" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Bands</SelectItem>
                                    {ASN_SCORE_BANDS.map((b) => (
                                        <SelectItem key={b.band} value={b.band}>{b.label} ({b.range})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Agent Cards */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {filteredProfiles.map((profile) => {
                                const band = getScoreBand(profile.creditScore);
                                return (
                                    <SpotlightCard key={profile.asn} className="p-0 cursor-pointer" spotlightColor="rgba(168, 85, 247, 0.06)" onClick={() => setSelectedAsn(profile)}>
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <code className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{profile.asn}</code>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <span className="font-semibold text-sm">{profile.agentName}</span>
                                                        <Badge variant="outline" className="text-[10px]">{profile.agentType}</Badge>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Badge variant="outline" className={`text-[10px] ${
                                                        profile.verificationLevel === "certified" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                        : profile.verificationLevel === "verified" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                        : profile.verificationLevel === "basic" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                        : "bg-muted text-muted-foreground"
                                                    }`}>
                                                        {profile.verificationLevel}
                                                    </Badge>
                                                    <div className={`w-2 h-2 rounded-full ${profile.status === "active" ? "bg-emerald-400" : profile.status === "suspended" ? "bg-red-400" : "bg-muted-foreground"}`} />
                                                </div>
                                            </div>

                                            {/* Three-Layer Scores */}
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                <div className="rounded-lg bg-muted/50 p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">Trust</p>
                                                    <p className="text-sm font-bold text-emerald-400">{profile.trustScore}</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/50 p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">Fraud Risk</p>
                                                    <p className={`text-sm font-bold ${profile.fraudRiskScore > 50 ? "text-red-400" : profile.fraudRiskScore > 25 ? "text-amber-400" : "text-emerald-400"}`}>{profile.fraudRiskScore}</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/50 p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">Credit</p>
                                                    <p className={`text-sm font-bold ${band.color}`}>{profile.creditScore}</p>
                                                </div>
                                            </div>

                                            {/* Band + Activity */}
                                            <div className="flex items-center justify-between text-xs">
                                                <Badge className={`text-[10px] ${band.bgColor} ${band.color} ${band.borderColor}`}>{band.label} ({band.range})</Badge>
                                                <span className="text-muted-foreground">{profile.activitySummary.completedTasks}/{profile.activitySummary.totalTasks} tasks</span>
                                            </div>

                                            {/* Risk Flags */}
                                            {profile.riskFlags.length > 0 && (
                                                <div className="flex gap-1 mt-2 flex-wrap">
                                                    {profile.riskFlags.map((flag) => (
                                                        <Badge key={flag} variant="outline" className="text-[9px] text-red-400 border-red-500/20 bg-red-500/5">
                                                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{flag.replace(/_/g, " ")}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </SpotlightCard>
                                );
                            })}
                        </div>

                        {filteredProfiles.length === 0 && (
                            <Card className="border-border">
                                <div className="py-10 text-center">
                                    <Fingerprint className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">No agents match your search</p>
                                </div>
                            </Card>
                        )}
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* CREDIT BUREAU TAB                                  */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="credit-bureau">
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <Scale className="h-6 w-6 text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">Credit Bureau</h2>
                                <p className="text-xs text-muted-foreground">Three-layer scoring system for agent trustworthiness and risk</p>
                            </div>
                        </div>

                        {/* Score Bands Reference */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3">Credit Score Bands</h3>
                            <div className="space-y-2">
                                {ASN_SCORE_BANDS.map((band) => {
                                    const count = asnProfiles.filter((p) => getScoreBand(p.creditScore).band === band.band).length;
                                    const policy = getDefaultPolicy(band.min);
                                    return (
                                        <Card key={band.band} className={`border ${band.borderColor}`}>
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-3 h-8 rounded-full ${band.bgColor}`} style={{ background: `var(--${band.color.replace("text-", "")})` }} />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`font-semibold ${band.color}`}>{band.label}</span>
                                                                <Badge variant="outline" className="text-[10px]">{band.range}</Badge>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                ${policy.spendingCapUsd.toLocaleString()} cap | {Math.round(policy.escrowRatio * 100)}% escrow | {policy.maxConcurrentTasks} tasks
                                                                {policy.requiresManualReview && " | manual review"}
                                                                {policy.sensitiveWorkflowAccess && " | sensitive access"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-lg font-bold ${band.color}`}>{count}</p>
                                                        <p className="text-[10px] text-muted-foreground">agents</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Three-Layer Scoring */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                {
                                    title: "Trust Score",
                                    range: "0–100",
                                    icon: ShieldCheck,
                                    color: "text-emerald-400",
                                    bg: "bg-emerald-500/10 border-emerald-500/20",
                                    desc: "Measures operational reliability and consistency.",
                                    inputs: ["Task completion rate", "On-time settlement", "Uptime & availability", "Protocol diversity", "Endorsements from peers"],
                                },
                                {
                                    title: "Fraud Risk Score",
                                    range: "0–100 (lower = safer)",
                                    icon: AlertTriangle,
                                    color: "text-red-400",
                                    bg: "bg-red-500/10 border-red-500/20",
                                    desc: "Measures likelihood of malicious behavior.",
                                    inputs: ["Bridge-hopping frequency", "Circular fund flows", "Wash trading patterns", "Wallet clustering / sybil", "Sanctions proximity"],
                                },
                                {
                                    title: "Credit Score",
                                    range: "300–900",
                                    icon: Scale,
                                    color: "text-amber-400",
                                    bg: "bg-amber-500/10 border-amber-500/20",
                                    desc: "Composite score determining financial permissions.",
                                    inputs: ["Trust score (positive)", "Fraud risk (negative)", "Settlement history", "Identity age & volume", "Policy violation history"],
                                },
                            ].map((layer) => (
                                <SpotlightCard key={layer.title} className="p-0" spotlightColor="rgba(59, 130, 246, 0.06)">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg border ${layer.bg}`}>
                                                <layer.icon className={`h-4 w-4 ${layer.color}`} />
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm">{layer.title}</CardTitle>
                                                <p className="text-[10px] text-muted-foreground">{layer.range}</p>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-xs text-muted-foreground mb-3">{layer.desc}</p>
                                        <ul className="space-y-1">
                                            {layer.inputs.map((input) => (
                                                <li key={input} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                    <span className={`w-1 h-1 rounded-full ${layer.color.replace("text-", "bg-")}`} />
                                                    {input}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </SpotlightCard>
                            ))}
                        </div>

                        {/* Agent Credit Lookup */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3">Agent Credit Lookup</h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {asnProfiles.filter((p) => p.status === "active").map((profile) => {
                                    const band = getScoreBand(profile.creditScore);
                                    return (
                                        <Card key={profile.asn} className="border-border">
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div>
                                                        <span className="font-semibold text-sm">{profile.agentName}</span>
                                                        <code className="text-[10px] font-mono text-muted-foreground ml-2">{profile.asn}</code>
                                                    </div>
                                                    <Badge className={`text-[10px] ${band.bgColor} ${band.color} ${band.borderColor}`}>{band.label}</Badge>
                                                </div>
                                                {/* Score bars */}
                                                <div className="space-y-2">
                                                    <div>
                                                        <div className="flex justify-between text-[10px] mb-0.5">
                                                            <span className="text-muted-foreground">Trust</span>
                                                            <span className="text-emerald-400 font-medium">{profile.trustScore}/100</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${profile.trustScore}%` }} />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[10px] mb-0.5">
                                                            <span className="text-muted-foreground">Fraud Risk</span>
                                                            <span className={`font-medium ${profile.fraudRiskScore > 50 ? "text-red-400" : "text-emerald-400"}`}>{profile.fraudRiskScore}/100</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all ${profile.fraudRiskScore > 50 ? "bg-red-500" : profile.fraudRiskScore > 25 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${profile.fraudRiskScore}%` }} />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[10px] mb-0.5">
                                                            <span className="text-muted-foreground">Credit</span>
                                                            <span className={`font-medium ${band.color}`}>{profile.creditScore}/900</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all`} style={{ width: `${((profile.creditScore - 300) / 600) * 100}%`, background: band.color.includes("emerald") ? "#34d399" : band.color.includes("blue") ? "#60a5fa" : band.color.includes("amber") ? "#fbbf24" : band.color.includes("orange") ? "#fb923c" : "#f87171" }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* POLICY ENGINE TAB                                  */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="policy-engine">
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                <Shield className="h-6 w-6 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">Policy Engine</h2>
                                <p className="text-xs text-muted-foreground">Automated risk policies mapped to credit score bands</p>
                            </div>
                        </div>

                        {/* Policy Rules Table */}
                        <SpotlightCard className="p-0 overflow-hidden" spotlightColor="rgba(59, 130, 246, 0.06)">
                            <CardHeader className="pb-0">
                                <CardTitle className="text-sm">Policy Rules by Score Band</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 mt-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-left">
                                                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Band</th>
                                                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Spending Cap</th>
                                                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Escrow</th>
                                                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Max Tasks</th>
                                                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Review</th>
                                                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Sensitive Access</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ASN_SCORE_BANDS.map((band) => {
                                                const policy = getDefaultPolicy(band.min);
                                                return (
                                                    <tr key={band.band} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <Badge className={`text-[10px] ${band.bgColor} ${band.color} ${band.borderColor}`}>{band.label}</Badge>
                                                                <span className="text-[10px] text-muted-foreground">{band.range}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-xs">${policy.spendingCapUsd.toLocaleString()}</td>
                                                        <td className="px-4 py-3 font-mono text-xs">{Math.round(policy.escrowRatio * 100)}%</td>
                                                        <td className="px-4 py-3 font-mono text-xs">{policy.maxConcurrentTasks}</td>
                                                        <td className="px-4 py-3">
                                                            {policy.requiresManualReview
                                                                ? <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/20 bg-amber-500/5">Required</Badge>
                                                                : <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/20 bg-emerald-500/5">Auto</Badge>
                                                            }
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {policy.sensitiveWorkflowAccess
                                                                ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                                                                : <Ban className="h-4 w-4 text-red-400/50" />
                                                            }
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </SpotlightCard>

                        {/* Agent Policy Viewer */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3">Agent Policy Viewer</h3>
                            <div className="flex gap-2 flex-wrap mb-4">
                                {asnProfiles.map((p) => (
                                    <button
                                        key={p.asn}
                                        onClick={() => setPolicyAgent(p)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            policyAgent?.asn === p.asn
                                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                                        }`}
                                    >
                                        {p.agentName}
                                    </button>
                                ))}
                            </div>
                            {policyAgent && (() => {
                                const band = getScoreBand(policyAgent.creditScore);
                                const policy = getDefaultPolicy(policyAgent.creditScore);
                                return (
                                    <Card className={`border ${band.borderColor}`}>
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <span className="font-semibold">{policyAgent.agentName}</span>
                                                    <code className="text-[10px] font-mono text-muted-foreground ml-2">{policyAgent.asn}</code>
                                                </div>
                                                <Badge className={`${band.bgColor} ${band.color} ${band.borderColor}`}>{band.label} — {policyAgent.creditScore}</Badge>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                <div className="rounded-lg bg-muted/50 p-3">
                                                    <p className="text-[10px] text-muted-foreground">Spending Cap</p>
                                                    <p className="text-sm font-bold">${policy.spendingCapUsd.toLocaleString()}</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/50 p-3">
                                                    <p className="text-[10px] text-muted-foreground">Escrow Ratio</p>
                                                    <p className="text-sm font-bold">{Math.round(policy.escrowRatio * 100)}%</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/50 p-3">
                                                    <p className="text-[10px] text-muted-foreground">Max Tasks</p>
                                                    <p className="text-sm font-bold">{policy.maxConcurrentTasks}</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/50 p-3">
                                                    <p className="text-[10px] text-muted-foreground">Manual Review</p>
                                                    <p className={`text-sm font-bold ${policy.requiresManualReview ? "text-amber-400" : "text-emerald-400"}`}>{policy.requiresManualReview ? "Required" : "Auto"}</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/50 p-3">
                                                    <p className="text-[10px] text-muted-foreground">Sensitive Access</p>
                                                    <p className={`text-sm font-bold ${policy.sensitiveWorkflowAccess ? "text-emerald-400" : "text-red-400"}`}>{policy.sensitiveWorkflowAccess ? "Granted" : "Denied"}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })()}
                        </div>

                        {/* Fraud Alerts */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-400" />
                                Active Alerts
                            </h3>
                            <div className="space-y-2">
                                {MOCK_FRAUD_ALERTS.map((alert) => (
                                    <Card key={alert.id} className={`border ${
                                        alert.severity === "critical" ? "border-red-500/20" : alert.severity === "warning" ? "border-amber-500/20" : "border-border"
                                    }`}>
                                        <CardContent className="p-3 flex items-start gap-3">
                                            <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${
                                                alert.severity === "critical" ? "text-red-400" : alert.severity === "warning" ? "text-amber-400" : "text-blue-400"
                                            }`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-sm font-medium">{alert.type}</span>
                                                    <Badge variant="outline" className={`text-[9px] ${
                                                        alert.severity === "critical" ? "text-red-400 border-red-500/20 bg-red-500/5"
                                                        : alert.severity === "warning" ? "text-amber-400 border-amber-500/20 bg-amber-500/5"
                                                        : "text-blue-400 border-blue-500/20 bg-blue-500/5"
                                                    }`}>{alert.severity}</Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground">{alert.message}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <code className="text-[10px] font-mono text-purple-400">{alert.asn}</code>
                                                    <span className="text-[10px] text-muted-foreground">{alert.agentName}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(alert.timestamp).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* TOOLS TAB                                          */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="tools">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {CHAINLINK_TOOLS.map((tool) => {
                            const IconComp = resolveIcon(tool.icon);
                            return (
                                <SpotlightCard key={tool.id} className="p-0" spotlightColor="rgba(59, 130, 246, 0.08)">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                                <IconComp className="h-5 w-5 text-blue-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <CardTitle className="text-base">{tool.name}</CardTitle>
                                                <Badge variant="outline" className="text-[10px] mt-1">{tool.category}</Badge>
                                            </div>
                                            <Badge className={`text-[10px] ${tool.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                                                {tool.status === "active" ? "Active" : "Coming Soon"}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground mb-4">{tool.description}</p>
                                        {tool.usageExample && (
                                            <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto mb-4 font-mono">
                                                <code>{tool.usageExample}</code>
                                            </pre>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                                            onClick={() => {
                                                setPlaygroundTool(TOOL_TO_PLAYGROUND[tool.id] || "fetch_price");
                                                setPlaygroundResult(null);
                                                setActiveTab("playground");
                                            }}
                                        >
                                            <Play className="h-3 w-3" /> Run in Playground
                                        </Button>
                                    </CardContent>
                                </SpotlightCard>
                            );
                        })}
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* WORKFLOWS TAB                                      */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="workflows">
                    <div className="space-y-6">
                        {/* Your Workflows (Firestore) */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold">Your Workflows</h3>
                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5" onClick={() => setShowCreate(true)}>
                                    <Plus className="h-3.5 w-3.5" /> Create Workflow
                                </Button>
                            </div>

                            {workflowsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                                </div>
                            ) : workflows.length === 0 ? (
                                <Card className="border-border">
                                    <div className="py-10 text-center">
                                        <GitBranch className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">No workflows yet</p>
                                        <p className="text-xs text-muted-foreground/60 mt-1">Create your first CRE workflow or use a template below</p>
                                    </div>
                                </Card>
                            ) : (
                                <div className="space-y-2">
                                    {workflows.map((wf) => {
                                        const meta = WORKFLOW_TYPE_META[wf.type] || WORKFLOW_TYPE_META.Functions;
                                        const MetaIcon = meta.icon;
                                        return (
                                            <Card key={wf.id} className="border-border">
                                                <div className="flex items-center gap-3 p-3">
                                                    <MetaIcon className={`h-4 w-4 ${meta.color} shrink-0`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium truncate">{wf.name}</div>
                                                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                                            <span>{wf.type}</span>
                                                            <span className="text-muted-foreground/30">|</span>
                                                            <span>{wf.trigger}</span>
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className={`text-[10px] ${
                                                        wf.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                            : wf.status === "paused" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                                : "bg-muted text-muted-foreground"
                                                    }`}>
                                                        {wf.status}
                                                    </Badge>
                                                    <div className="flex items-center gap-1">
                                                        {wf.status !== "draft" && (
                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleToggleWorkflow(wf.id, wf.status)}>
                                                                {wf.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                                            </Button>
                                                        )}
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => handleDeleteWorkflow(wf.id)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Workflow Templates */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3">Workflow Templates</h3>
                            <div className="space-y-3">
                                {CHAINLINK_WORKFLOWS.map((wf) => {
                                    const IconComp = resolveIcon(wf.icon);
                                    const isExpanded = expandedWorkflow === wf.id;
                                    return (
                                        <Card key={wf.id} className="border-border transition-all hover:border-blue-500/20">
                                            <button
                                                onClick={() => setExpandedWorkflow(isExpanded ? null : wf.id)}
                                                className="w-full text-left p-4"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                        <IconComp className="h-5 w-5 text-amber-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-sm">{wf.name}</h3>
                                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{wf.description}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {wf.estimatedTime && (
                                                            <Badge variant="outline" className="text-[10px] hidden sm:flex gap-0.5">
                                                                <Clock className="h-2.5 w-2.5" />{wf.estimatedTime}
                                                            </Badge>
                                                        )}
                                                        <Badge variant="outline" className="text-[10px]">Template</Badge>
                                                        {isExpanded
                                                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                        }
                                                    </div>
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="px-4 pb-4 border-t border-border">
                                                    <div className="flex gap-1.5 mb-3 pt-3 flex-wrap">
                                                        {wf.tags.map((tag) => (
                                                            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                                                        ))}
                                                    </div>
                                                    <ol className="space-y-2 mb-4">
                                                        {wf.steps.map((step, i) => (
                                                            <li key={i} className="flex items-start gap-2 text-sm">
                                                                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-medium border border-blue-500/20">
                                                                    {i + 1}
                                                                </span>
                                                                <span className="text-muted-foreground">{step}</span>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-black gap-1.5">
                                                        <Rocket className="h-3 w-3" /> Use Template
                                                    </Button>
                                                </div>
                                            )}
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* EXAMPLES TAB                                       */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="examples">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {CHAINLINK_EXAMPLES.map((ex) => {
                            const IconComp = resolveIcon(ex.icon);
                            const isExpanded = expandedExample === ex.id;
                            return (
                                <SpotlightCard key={ex.id} className="p-0" spotlightColor="rgba(255, 191, 0, 0.06)">
                                    <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                <IconComp className="h-5 w-5 text-emerald-400" />
                                            </div>
                                            <div className="flex-1">
                                                <CardTitle className="text-base">{ex.name}</CardTitle>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground mb-3">{ex.description}</p>
                                        <div className="flex gap-1.5 mb-3 flex-wrap">
                                            {ex.tags.map((t) => (
                                                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                                            ))}
                                        </div>
                                        {ex.codeSnippet && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setExpandedExample(isExpanded ? null : ex.id)}
                                                    className="gap-1.5"
                                                >
                                                    <Code className="h-3 w-3" /> {isExpanded ? "Hide Code" : "View Code"}
                                                </Button>
                                                {isExpanded && (
                                                    <div className="mt-3 relative">
                                                        <button
                                                            className="absolute top-2 right-2 p-1.5 rounded bg-muted hover:bg-muted-foreground/10 transition-colors"
                                                            onClick={() => copyToClipboard(ex.codeSnippet!)}
                                                        >
                                                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                                        </button>
                                                        <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-x-auto font-mono">
                                                            <code>{ex.codeSnippet}</code>
                                                        </pre>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </CardContent>
                                </SpotlightCard>
                            );
                        })}
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* PLAYGROUND TAB                                     */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="playground">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main area */}
                        <div className="lg:col-span-2 space-y-4">

                            {/* ─── Wallet Status Bar ─── */}
                            <Card className={`border ${account?.address ? "border-emerald-500/20" : "border-amber-500/20"}`}>
                                <CardContent className="py-3 px-4">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        {account?.address ? (
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5">
                                                    <Wallet className="h-4 w-4 text-emerald-400" />
                                                    <span className="text-xs font-mono text-emerald-400">{shortAddress(account.address)}</span>
                                                </div>
                                                {walletBalance && (
                                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                                        <Fuel className="h-3 w-3 mr-1" />{walletBalance} HBAR
                                                    </Badge>
                                                )}
                                                <Badge className={`text-[10px] ${chain?.id === 296 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                                                    {chain?.id === 296 ? "Hedera Testnet" : chain?.id === 295 ? "Hedera Mainnet" : `Chain ${chain?.id ?? "?"}`}
                                                </Badge>
                                                {chain?.id && chain.id !== 296 && (
                                                    <span className="text-[10px] text-amber-400 flex items-center gap-1">
                                                        <AlertCircle className="h-3 w-3" /> Switch to Hedera Testnet (296) for tx
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Wallet className="h-4 w-4 text-amber-400" />
                                                <span className="text-xs text-amber-400">Wallet not connected — connect to run on-chain tools</span>
                                            </div>
                                        )}
                                        <a
                                            href="https://portal.hedera.com/faucet"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                        >
                                            Testnet Faucet <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* ─── Tool selector with tier badges ─── */}
                            <div className="flex gap-2 flex-wrap">
                                {Object.keys(PLAYGROUND_MOCK_RESPONSES).map((key) => {
                                    const meta = TOOL_EXECUTION_META[key];
                                    const tierBadge = (() => {
                                        if (key === "fetch_price") return { label: "LIVE", cls: "bg-emerald-500/20 text-emerald-400" };
                                        if (!meta) return null;
                                        switch (meta.tier) {
                                            case "pure": return { label: "PURE", cls: "bg-emerald-500/20 text-emerald-400" };
                                            case "read": return { label: "READ", cls: "bg-blue-500/20 text-blue-400" };
                                            case "write": return { label: "TX", cls: "bg-amber-500/20 text-amber-400" };
                                            case "enhanced-sim": return { label: "SIM+", cls: "bg-purple-500/20 text-purple-400" };
                                            default: return null;
                                        }
                                    })();
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => { setPlaygroundTool(key); setPlaygroundResult(null); setPlaygroundLatency(null); setPlaygroundTxHash(null); setPlaygroundBlockNumber(null); setPlaygroundGasUsed(null); setPlaygroundExplorerUrl(null); setPlaygroundIsLive(false); setPlaygroundError(null); }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                playgroundTool === key
                                                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                                    : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                                            }`}
                                        >
                                            {PLAYGROUND_MOCK_RESPONSES[key].tool}
                                            {tierBadge && (
                                                <span className={`ml-1.5 px-1 py-0.5 rounded text-[9px] ${tierBadge.cls}`}>{tierBadge.label}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ─── Request panel ─── */}
                            <Card className="border-border">
                                <CardHeader className="py-3 px-4 border-b border-border">
                                    <div className="flex items-center gap-2">
                                        <Terminal className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">Request</span>
                                        {(() => {
                                            if (playgroundTool === "fetch_price") return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Live Oracle</Badge>;
                                            const meta = TOOL_EXECUTION_META[playgroundTool];
                                            if (!meta) return <Badge variant="outline" className="text-[10px]">Simulated</Badge>;
                                            switch (meta.tier) {
                                                case "write": return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Real Transaction</Badge>;
                                                case "read": return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">Live Read</Badge>;
                                                case "pure": return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Live Compute</Badge>;
                                                case "enhanced-sim": return <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">Enhanced Simulation</Badge>;
                                                default: return <Badge variant="outline" className="text-[10px]">Simulated</Badge>;
                                            }
                                        })()}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <pre className="text-xs p-4 font-mono overflow-x-auto">
                                        <code>{getPlaygroundRequest}</code>
                                    </pre>
                                </CardContent>
                            </Card>

                            {/* ─── Run button ─── */}
                            {(() => {
                                const meta = TOOL_EXECUTION_META[playgroundTool];
                                const isWrite = meta?.tier === "write";
                                const needsWallet = meta?.requiresWallet && !account?.address;
                                return (
                                    <div className="flex items-center gap-3">
                                        <Button
                                            onClick={handleRun}
                                            disabled={playgroundRunning || (isWrite && !account?.address)}
                                            className={`gap-1.5 text-white ${isWrite ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
                                        >
                                            {playgroundRunning
                                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                : isWrite ? <Wallet className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />
                                            }
                                            {playgroundRunning ? "Running..." : isWrite ? "Sign & Send Transaction" : "Run"}
                                        </Button>
                                        {needsWallet && (
                                            <span className="text-[11px] text-amber-400 flex items-center gap-1">
                                                <AlertCircle className="h-3.5 w-3.5" /> Connect wallet to run this tool
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ─── Error card ─── */}
                            {playgroundError && (
                                <Card className="border-red-500/20">
                                    <CardContent className="py-3 px-4 flex items-start gap-2">
                                        <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                                        <span className="text-xs text-red-400">{playgroundError}</span>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ─── Transaction details card ─── */}
                            {playgroundTxHash && (
                                <Card className="border-amber-500/20">
                                    <CardHeader className="py-3 px-4 border-b border-border">
                                        <div className="flex items-center gap-2">
                                            <Fuel className="h-4 w-4 text-amber-400" />
                                            <span className="text-sm font-medium">Transaction Details</span>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="py-3 px-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">Tx Hash</span>
                                            <span className="text-xs font-mono text-amber-400">{shortAddress(playgroundTxHash)}</span>
                                        </div>
                                        {playgroundBlockNumber && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">Block</span>
                                                <span className="text-xs font-mono">{playgroundBlockNumber}</span>
                                            </div>
                                        )}
                                        {playgroundGasUsed && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">Gas Used</span>
                                                <span className="text-xs font-mono">{playgroundGasUsed}</span>
                                            </div>
                                        )}
                                        {playgroundExplorerUrl && (
                                            <a
                                                href={playgroundExplorerUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mt-1"
                                            >
                                                View on HashScan <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* ─── Response panel ─── */}
                            {playgroundResult && (
                                <Card className={`border ${playgroundIsLive ? "border-emerald-500/20" : "border-purple-500/20"}`}>
                                    <CardHeader className="py-3 px-4 border-b border-border">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className={`h-4 w-4 ${playgroundIsLive ? "text-emerald-400" : "text-purple-400"}`} />
                                                <span className="text-sm font-medium">Response</span>
                                                {playgroundIsLive ? (
                                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Live</Badge>
                                                ) : (
                                                    <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">Enhanced Sim</Badge>
                                                )}
                                            </div>
                                            {playgroundLatency && (
                                                <Badge className="bg-muted/50 text-muted-foreground border-border text-[10px]">
                                                    {playgroundLatency}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <pre className={`text-xs p-4 font-mono overflow-x-auto ${playgroundIsLive ? "text-emerald-400/80" : "text-purple-400/80"}`}>
                                            <code>{playgroundResult}</code>
                                        </pre>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* Sidebar: Live Price Feeds */}
                        <div>
                            <Card className="border-border">
                                <CardHeader className="py-3 px-4 border-b border-border">
                                    <div className="flex items-center gap-2">
                                        <Activity className="h-4 w-4 text-amber-400" />
                                        <span className="text-sm font-medium">Live Price Feeds</span>
                                        {pricesLoading ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border border-amber-400 border-t-transparent" />
                                        ) : (
                                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Live</Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                <div className="divide-y divide-border">
                                    {pricesLoading ? (
                                        <div className="py-8 text-center">
                                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mx-auto mb-2" />
                                            <p className="text-xs text-muted-foreground">Fetching oracle data...</p>
                                        </div>
                                    ) : livePrices.length === 0 ? (
                                        <div className="py-8 text-center">
                                            <p className="text-xs text-muted-foreground">No feeds available</p>
                                        </div>
                                    ) : (
                                        livePrices.map((feed) => (
                                            <div key={`${feed.network}-${feed.pair}`} className="px-4 py-2.5 flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-medium">{feed.pair}</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {feed.network} &middot; {new Date(feed.updatedAt).toLocaleTimeString()}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-mono">
                                                        ${feed.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════ */}
                {/* DOCS TAB                                           */}
                {/* ═══════════════════════════════════════════════════ */}
                <TabsContent value="docs">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {/* Nav */}
                        <div className="space-y-1">
                            {CHAINLINK_DOCS.map((section) => {
                                const IconComp = resolveIcon(section.icon);
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveDoc(section.id)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                                            activeDoc === section.id
                                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                                        }`}
                                    >
                                        <IconComp className="h-4 w-4" />
                                        {section.title}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Content */}
                        <div className="md:col-span-3">
                            <Card className="border-border">
                                <CardContent className="p-6">
                                    {(() => {
                                        const docItem = CHAINLINK_DOCS.find((d) => d.id === activeDoc);
                                        if (!docItem) return null;
                                        const DocIcon = resolveIcon(docItem.icon);
                                        return (
                                            <>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <DocIcon className="h-5 w-5 text-blue-400" />
                                                    <h2 className="text-xl font-semibold">{docItem.title}</h2>
                                                </div>
                                                <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                                                    {docItem.content}
                                                </div>
                                            </>
                                        );
                                    })()}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Create Workflow Dialog */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create CRE Workflow</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Name</label>
                            <Input placeholder="e.g. Price Alert Monitor" value={newWfName} onChange={(e) => setNewWfName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Description</label>
                            <Textarea placeholder="What does this workflow do?" value={newWfDesc} onChange={(e) => setNewWfDesc(e.target.value)} rows={2} />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Type</label>
                            <Select value={newWfType} onValueChange={(v) => setNewWfType(v as WorkflowType)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Functions">Functions — Serverless compute</SelectItem>
                                    <SelectItem value="Automation">Automation — Time/event triggers</SelectItem>
                                    <SelectItem value="VRF">VRF — Verifiable randomness</SelectItem>
                                    <SelectItem value="CCIP">CCIP — Cross-chain messaging</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Trigger</label>
                            <Input placeholder="e.g. Every 5 minutes, On price deviation > 2%" value={newWfTrigger} onChange={(e) => setNewWfTrigger(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button onClick={handleCreateWorkflow} disabled={creating || !newWfName.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {creating ? "Creating..." : "Create"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Register ASN Dialog */}
            <Dialog open={showRegister} onOpenChange={(open) => {
                setShowRegister(open);
                if (!open) { setSelectedAgentId(""); setRegisterError(null); }
            }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Fingerprint className="h-5 w-5 text-purple-400" />
                            Register Agent On-Chain
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-xs text-muted-foreground -mt-2">Select a connected agent to register on Ethereum Sepolia with a unique ASN.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Select Agent</label>
                            {orgAgentsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading agents...
                                </div>
                            ) : availableAgents.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">No unregistered agents found in this org.</p>
                            ) : (
                                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                                    <SelectTrigger><SelectValue placeholder="Choose an agent..." /></SelectTrigger>
                                    <SelectContent>
                                        {availableAgents.map((agent) => (
                                            <SelectItem key={agent.id} value={agent.id}>
                                                {agent.name} ({agent.type})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {selectedAgent && (
                            <Card className="border-border bg-muted/30">
                                <CardContent className="p-3 space-y-2">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase">Name</p>
                                            <p className="font-medium">{selectedAgent.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase">Type</p>
                                            <p className="font-medium">{selectedAgent.type}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase">ASN</p>
                                            <p className="font-mono text-xs text-purple-400">{selectedAgent.asn || "Will be generated"}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                                            <Badge variant="outline" className={`text-[10px] ${selectedAgent.status === "online" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                                                {selectedAgent.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <Card className="border-border bg-muted/30">
                            <CardContent className="p-3">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Initial Scores</p>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Trust</p>
                                        <p className="text-sm font-bold text-amber-400">50</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Fraud Risk</p>
                                        <p className="text-sm font-bold text-amber-400">25</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Credit</p>
                                        <p className="text-sm font-bold text-amber-400">680</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {registerError && (
                            <div className="flex items-center gap-2 text-red-400 text-sm">
                                <AlertCircle className="h-4 w-4" /> {registerError}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
                        <Button onClick={handleRegisterASN} disabled={registering || !selectedAgentId} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
                            {registering ? (
                                <>
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    Registering on-chain...
                                </>
                            ) : (
                                <>
                                    <Fingerprint className="h-3.5 w-3.5" />
                                    Register
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ASN Profile Detail Dialog */}
            <Dialog open={!!selectedAsn} onOpenChange={(open) => !open && setSelectedAsn(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    {selectedAsn && (() => {
                        const band = getScoreBand(selectedAsn.creditScore);
                        const policy = getDefaultPolicy(selectedAsn.creditScore);
                        return (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <Fingerprint className="h-5 w-5 text-purple-400" />
                                        {selectedAsn.agentName}
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    {/* ASN + Status */}
                                    <div className="flex items-center justify-between">
                                        <code className="text-sm font-mono text-purple-400 bg-purple-500/10 px-3 py-1 rounded-lg">{selectedAsn.asn}</code>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`text-[10px] ${
                                                selectedAsn.verificationLevel === "certified" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                : selectedAsn.verificationLevel === "verified" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                : selectedAsn.verificationLevel === "basic" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                : "bg-muted text-muted-foreground"
                                            }`}>{selectedAsn.verificationLevel}</Badge>
                                            <Badge className={`text-[10px] ${selectedAsn.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                                                {selectedAsn.status}
                                            </Badge>
                                        </div>
                                    </div>

                                    {/* Three-Layer Scores */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trust Score</p>
                                            <p className="text-2xl font-bold text-emerald-400">{selectedAsn.trustScore}</p>
                                            <p className="text-[10px] text-muted-foreground">/ 100</p>
                                        </div>
                                        <div className={`rounded-xl border p-3 text-center ${selectedAsn.fraudRiskScore > 50 ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fraud Risk</p>
                                            <p className={`text-2xl font-bold ${selectedAsn.fraudRiskScore > 50 ? "text-red-400" : selectedAsn.fraudRiskScore > 25 ? "text-amber-400" : "text-emerald-400"}`}>{selectedAsn.fraudRiskScore}</p>
                                            <p className="text-[10px] text-muted-foreground">/ 100</p>
                                        </div>
                                        <div className={`rounded-xl border p-3 text-center ${band.bgColor} ${band.borderColor}`}>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Credit Score</p>
                                            <p className={`text-2xl font-bold ${band.color}`}>{selectedAsn.creditScore}</p>
                                            <p className={`text-[10px] ${band.color}`}>{band.label}</p>
                                        </div>
                                    </div>

                                    {/* Identity Details */}
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Agent Type</p>
                                            <p className="font-medium">{selectedAsn.agentType}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Model Provider</p>
                                            <p className="font-medium">{selectedAsn.modelProvider}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Environment</p>
                                            <p className="font-medium">{selectedAsn.deploymentEnvironment}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Jurisdiction</p>
                                            <p className="font-medium">{selectedAsn.jurisdictionTag}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Creator Wallet</p>
                                            <code className="text-xs font-mono text-muted-foreground">{selectedAsn.creatorWallet}</code>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Linked Wallets</p>
                                            <p className="font-medium">{selectedAsn.linkedWallets.length}</p>
                                        </div>
                                    </div>

                                    {/* Activity Summary */}
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Activity Summary</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            <div className="rounded-lg bg-muted/50 p-2 text-center">
                                                <p className="text-sm font-bold">{selectedAsn.activitySummary.completedTasks}/{selectedAsn.activitySummary.totalTasks}</p>
                                                <p className="text-[10px] text-muted-foreground">Tasks</p>
                                            </div>
                                            <div className="rounded-lg bg-muted/50 p-2 text-center">
                                                <p className="text-sm font-bold">{selectedAsn.activitySummary.totalTransactions.toLocaleString()}</p>
                                                <p className="text-[10px] text-muted-foreground">Txns</p>
                                            </div>
                                            <div className="rounded-lg bg-muted/50 p-2 text-center">
                                                <p className="text-sm font-bold">${(selectedAsn.activitySummary.totalVolumeUsd / 1000).toFixed(0)}k</p>
                                                <p className="text-[10px] text-muted-foreground">Volume</p>
                                            </div>
                                            <div className="rounded-lg bg-muted/50 p-2 text-center">
                                                <p className="text-sm font-bold">{selectedAsn.activitySummary.activeChains.length}</p>
                                                <p className="text-[10px] text-muted-foreground">Chains</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Policy State */}
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Derived Policy</p>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                            <div className="rounded-lg bg-muted/50 p-2">
                                                <p className="text-[10px] text-muted-foreground">Spending Cap</p>
                                                <p className="text-xs font-bold">${policy.spendingCapUsd.toLocaleString()}</p>
                                            </div>
                                            <div className="rounded-lg bg-muted/50 p-2">
                                                <p className="text-[10px] text-muted-foreground">Escrow</p>
                                                <p className="text-xs font-bold">{Math.round(policy.escrowRatio * 100)}%</p>
                                            </div>
                                            <div className="rounded-lg bg-muted/50 p-2">
                                                <p className="text-[10px] text-muted-foreground">Max Tasks</p>
                                                <p className="text-xs font-bold">{policy.maxConcurrentTasks}</p>
                                            </div>
                                            <div className="rounded-lg bg-muted/50 p-2">
                                                <p className="text-[10px] text-muted-foreground">Review</p>
                                                <p className={`text-xs font-bold ${policy.requiresManualReview ? "text-amber-400" : "text-emerald-400"}`}>{policy.requiresManualReview ? "Manual" : "Auto"}</p>
                                            </div>
                                            <div className="rounded-lg bg-muted/50 p-2">
                                                <p className="text-[10px] text-muted-foreground">Sensitive</p>
                                                <p className={`text-xs font-bold ${policy.sensitiveWorkflowAccess ? "text-emerald-400" : "text-red-400"}`}>{policy.sensitiveWorkflowAccess ? "Yes" : "No"}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Skills */}
                                    {selectedAsn.skillModules.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Skill Modules</p>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {selectedAsn.skillModules.map((skill) => (
                                                    <Badge key={skill} variant="outline" className="text-[10px] font-mono">{skill}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Risk Flags */}
                                    {selectedAsn.riskFlags.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Risk Flags</p>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {selectedAsn.riskFlags.map((flag) => (
                                                    <Badge key={flag} variant="outline" className="text-[10px] text-red-400 border-red-500/20 bg-red-500/5">
                                                        <AlertTriangle className="h-2.5 w-2.5 mr-1" />{flag.replace(/_/g, " ")}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Attestations */}
                                    {selectedAsn.attestationRefs.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Attestation Refs</p>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {selectedAsn.attestationRefs.map((ref) => (
                                                    <Badge key={ref} variant="outline" className="text-[10px] font-mono">{ref}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Copied toast */}
            {copied && (
                <div className="fixed bottom-6 right-6 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
                    Copied to clipboard
                </div>
            )}
        </div>
    );
}
