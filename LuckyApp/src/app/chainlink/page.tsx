/** Chainlink CRE Workspace — Full vendor mod developer toolkit with live oracle data. */
"use client";

import { useState, useEffect, useCallback } from "react";
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
    Zap, Shield, Layers,
} from "lucide-react";
import {
    CHAINLINK_TOOLS,
    CHAINLINK_WORKFLOWS,
    CHAINLINK_EXAMPLES,
    CHAINLINK_AGENT_SKILLS,
    CHAINLINK_DOCS,
    PLAYGROUND_MOCK_RESPONSES,
} from "@/lib/chainlink";
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
    Rocket, FileCode, GraduationCap,
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
    const [activeTab, setActiveTab] = useState("overview");
    const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
    const [expandedExample, setExpandedExample] = useState<string | null>(null);
    const [playgroundTool, setPlaygroundTool] = useState("fetch_price");
    const [playgroundRunning, setPlaygroundRunning] = useState(false);
    const [playgroundResult, setPlaygroundResult] = useState<string | null>(null);
    const [playgroundLatency, setPlaygroundLatency] = useState<string | null>(null);
    const [activeDoc, setActiveDoc] = useState("quickstart");
    const [copied, setCopied] = useState(false);

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

        if (playgroundTool === "fetch_price") {
            // Real API call
            const start = performance.now();
            try {
                const results = await fetchLivePrices(["ETH/USD"], "ethereum");
                const elapsed = Math.round(performance.now() - start);
                if (results.length > 0 && results[0].status === "success") {
                    setPlaygroundResult(JSON.stringify(results[0], null, 2));
                    setPlaygroundLatency(`${elapsed}ms`);
                } else {
                    // Fallback: try any available network
                    const all = await fetchAllPrices();
                    const eth = all.find((p) => p.pair === "ETH/USD" && p.status === "success");
                    const finalElapsed = Math.round(performance.now() - start);
                    if (eth) {
                        setPlaygroundResult(JSON.stringify(eth, null, 2));
                        setPlaygroundLatency(`${finalElapsed}ms`);
                    } else {
                        setPlaygroundResult(JSON.stringify({ error: "No ETH/USD feed available", results: all }, null, 2));
                        setPlaygroundLatency(`${finalElapsed}ms`);
                    }
                }
            } catch (err) {
                const elapsed = Math.round(performance.now() - start);
                setPlaygroundResult(JSON.stringify({ error: String(err) }, null, 2));
                setPlaygroundLatency(`${elapsed}ms`);
            }
        } else {
            // Simulated for other tools
            const mock = PLAYGROUND_MOCK_RESPONSES[playgroundTool];
            if (!mock) {
                setPlaygroundResult(JSON.stringify({ error: `No mock data for ${playgroundTool}` }, null, 2));
                setPlaygroundLatency("0ms");
            } else {
                const delay = parseInt(mock.latency) || 500;
                await new Promise((r) => setTimeout(r, Math.min(delay, 2000)));
                setPlaygroundResult(mock.response);
                setPlaygroundLatency(mock.latency + " (simulated)");
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

    // ─── Stats for overview ───
    const stats = [
        { label: "Dev Tools", value: CHAINLINK_TOOLS.length, icon: Wrench, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
        { label: "Workflows", value: workflows.length + CHAINLINK_WORKFLOWS.length, icon: GitBranch, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
        { label: "Agent Skills", value: CHAINLINK_AGENT_SKILLS.length, icon: Cpu, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
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
                <Badge variant="outline" className="text-xs">v1.0.0</Badge>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[
                                    { label: "Explore Tools", desc: "Browse CRE tools and APIs", icon: Wrench, tab: "tools", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
                                    { label: "Browse Workflows", desc: "Templates + your workflows", icon: GitBranch, tab: "workflows", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
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
                            {/* Tool selector */}
                            <div className="flex gap-2 flex-wrap">
                                {Object.keys(PLAYGROUND_MOCK_RESPONSES).map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => { setPlaygroundTool(key); setPlaygroundResult(null); setPlaygroundLatency(null); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            playgroundTool === key
                                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                                        }`}
                                    >
                                        {PLAYGROUND_MOCK_RESPONSES[key].tool}
                                        {key === "fetch_price" && (
                                            <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400">LIVE</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Request panel */}
                            <Card className="border-border">
                                <CardHeader className="py-3 px-4 border-b border-border">
                                    <div className="flex items-center gap-2">
                                        <Terminal className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">Request</span>
                                        {playgroundTool === "fetch_price" ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Live Oracle</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px]">Simulated</Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <pre className="text-xs p-4 font-mono overflow-x-auto">
                                        <code>{PLAYGROUND_MOCK_RESPONSES[playgroundTool].request}</code>
                                    </pre>
                                </CardContent>
                            </Card>

                            {/* Run button */}
                            <Button
                                onClick={handleRun}
                                disabled={playgroundRunning}
                                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                            >
                                {playgroundRunning
                                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    : <Play className="h-3.5 w-3.5" />
                                }
                                {playgroundRunning ? "Running..." : "Run"}
                            </Button>

                            {/* Response panel */}
                            {playgroundResult && (
                                <Card className="border-emerald-500/20">
                                    <CardHeader className="py-3 px-4 border-b border-border">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="h-4 w-4 text-emerald-400" />
                                                <span className="text-sm font-medium">Response</span>
                                            </div>
                                            {playgroundLatency && (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                                    {playgroundLatency}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <pre className="text-xs p-4 font-mono overflow-x-auto text-emerald-400/80">
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

            {/* Copied toast */}
            {copied && (
                <div className="fixed bottom-6 right-6 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
                    Copied to clipboard
                </div>
            )}
        </div>
    );
}
