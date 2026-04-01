"use client";

/**
 * Flow DeFi Mod Dashboard
 *
 * Consumer DeFi on Flow L1 — FCL wallet, FLOW payments, bounties, staking,
 * agent wallets, contract deploy (Cadence + EVM), spending policy, audit log.
 *
 * Hackathon: PL Genesis — Flow Consumer DeFi ($10,000 bounty)
 */

import { useState, useEffect, useCallback } from "react";
import {
    Wallet, Send, RefreshCw, Shield, FileText, LayoutDashboard,
    ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Ban, ExternalLink,
    Plus, Pause, Play, Copy, Check, Trophy, History, BarChart3,
    KeyRound, TrendingUp, Fingerprint, Loader2,
    Rocket, Coins as CoinsIcon,
    type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOrg } from "@/contexts/OrgContext";
import { useSession } from "@/contexts/SessionContext";
import {
    miniFlowToFlow, flowToMiniFlow,
    type FlowPolicy, type FlowPayment, type FlowSubscription, type FlowAuditEntry,
    type FlowPaymentStatus,
} from "@/lib/flow-policy";
import type { FlowBounty, FlowFeeConfig } from "@/lib/flow-bounty";
import type { FlowAgentWallet } from "@/lib/flow-agent-wallet";
import {
    FLOW_DEPLOY_TYPE_LABELS, FLOW_DEPLOY_STATUS_META, FLOW_EXPLORERS,
    type FlowDeployment, type FlowDeployType,
} from "@/lib/flow-deploy";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

type Tab = "overview" | "payments" | "bounties" | "staking" | "swap" | "bridge" | "reputation" | "achievements" | "cid-verify" | "history" | "analytics" | "agent-wallets" | "deploy" | "policy" | "audit";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "overview",      label: "Overview",        icon: LayoutDashboard },
    { id: "payments",      label: "Payments",         icon: Send },
    { id: "bounties",      label: "Bounties",         icon: Trophy },
    { id: "staking",       label: "Staking",          icon: TrendingUp },
    { id: "swap",          label: "Swap",             icon: RefreshCw },
    { id: "bridge",        label: "EVM Bridge",       icon: ExternalLink },
    { id: "reputation",    label: "Reputation",       icon: ShieldCheck },
    { id: "achievements",  label: "Achievements",     icon: Fingerprint },
    { id: "cid-verify",    label: "CID Verify",       icon: CheckCircle2 },
    { id: "history",       label: "History",           icon: History },
    { id: "analytics",     label: "Analytics",         icon: BarChart3 },
    { id: "agent-wallets", label: "Agent Wallets",     icon: KeyRound },
    { id: "deploy",        label: "Deploy",            icon: Rocket },
    { id: "policy",        label: "Policy",            icon: Shield },
    { id: "audit",         label: "Audit",             icon: FileText },
];

const PAYMENT_STATUS: Record<FlowPaymentStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    pending_approval: { label: "Pending Approval", color: "text-yellow-400", icon: Clock },
    ready:            { label: "Ready",             color: "text-blue-400",   icon: CheckCircle2 },
    executing:        { label: "Executing",         color: "text-purple-400", icon: RefreshCw },
    executed:         { label: "Executed",          color: "text-green-400",  icon: CheckCircle2 },
    rejected:         { label: "Rejected",          color: "text-red-400",    icon: XCircle },
    blocked:          { label: "Blocked",           color: "text-red-500",    icon: Ban },
};

const BOUNTY_STATUS_COLOR: Record<string, string> = {
    open: "text-blue-400", claimed: "text-yellow-400", submitted: "text-purple-400",
    approved: "text-green-400", released: "text-green-500", rejected: "text-red-400", cancelled: "text-muted-foreground",
};

// ═══════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════

function shortAddr(addr: string | null | undefined): string {
    if (!addr || addr.length < 10) return addr || "—";
    return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

function fmtDate(d: Date | null | string | undefined): string {
    if (!d) return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function CopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="ml-1 text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

function EmptyState({ label }: { label: string }) {
    return <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{label}</div>;
}

// ═══════════════════════════════════════════════════════════════
// Dialog: Send Payment
// ═══════════════════════════════════════════════════════════════

function SendPaymentDialog({ open, onClose, wallets, onSend }: {
    open: boolean; onClose: () => void;
    wallets: FlowAgentWallet[];
    onSend: (d: { fromAddress: string; toAddress: string; amountFlow: string; memo: string }) => Promise<{ error?: string }>;
}) {
    const [from, setFrom] = useState(wallets[0]?.address || "");
    const [to, setTo] = useState(""); const [amount, setAmount] = useState(""); const [memo, setMemo] = useState("");
    const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [sim, setSim] = useState<{ allowed: boolean; requiresApproval: boolean; reason: string } | null>(null);

    const simulate = useCallback(async () => {
        if (!to || !amount || isNaN(parseFloat(amount))) { setSim(null); return; }
        try {
            const res = await fetch("/api/v1/flow/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: "", toAddress: to, amount: flowToMiniFlow(amount) }) });
            if (res.ok) setSim(await res.json());
        } catch { /* silent */ }
    }, [to, amount]);

    useEffect(() => { if (open) simulate(); }, [open, simulate]);

    if (!open) return null;
    const handleSend = async () => {
        setError("");
        if (!from || !to || !amount) { setError("All fields required"); return; }
        setLoading(true);
        const r = await onSend({ fromAddress: from, toAddress: to, amountFlow: amount, memo });
        setLoading(false);
        if (r.error) setError(r.error); else onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><Send className="h-5 w-5 text-emerald-400" /><h2 className="text-lg font-semibold">Send FLOW</h2></div>
                <div className="space-y-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">From</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)}>
                            {wallets.map((w) => <option key={w.address} value={w.address}>{w.label} ({shortAddr(w.address)})</option>)}
                        </select></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">To (Flow address)</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono" placeholder="0x1234abcd5678ef90" value={to} onChange={(e) => setTo(e.target.value)} onBlur={simulate} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Amount (FLOW)</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={simulate} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Memo</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Task bounty #42" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
                    {sim && (
                        <div className={cn("text-xs rounded-md px-3 py-2", sim.allowed ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                            {sim.allowed ? (sim.requiresApproval ? "Requires admin approval" : "Within policy — executes immediately") : `Blocked: ${sim.reason}`}
                        </div>
                    )}
                    {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" onClick={handleSend} disabled={loading}>
                        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}Send
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Dialog: Post Bounty
// ═══════════════════════════════════════════════════════════════

function PostBountyDialog({ open, onClose, wallets, onPost }: {
    open: boolean; onClose: () => void;
    wallets: FlowAgentWallet[];
    onPost: (d: { title: string; description: string; amountFlow: string; funderAddress: string; tags: string }) => Promise<{ error?: string }>;
}) {
    const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [funder, setFunder] = useState(wallets[0]?.address || ""); const [tags, setTags] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
    if (!open) return null;
    const handle = async () => {
        setError(""); if (!title || !amount) { setError("Title and amount required"); return; }
        setLoading(true);
        const r = await onPost({ title, description: desc, amountFlow: amount, funderAddress: funder, tags });
        setLoading(false);
        if (r.error) setError(r.error); else onClose();
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-yellow-400" /><h2 className="text-lg font-semibold">Post Bounty</h2></div>
                <div className="space-y-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">Task Title</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Analyze Q4 market data" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Description</label><textarea className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm h-20 resize-none" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Amount (FLOW)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Tags (comma-sep)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="defi,analysis" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
                    </div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Funder Wallet</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={funder} onChange={(e) => setFunder(e.target.value)}>
                            {wallets.map((w) => <option key={w.address} value={w.address}>{w.label} ({shortAddr(w.address)})</option>)}
                        </select></div>
                    {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" onClick={handle} disabled={loading}>{loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}Post Bounty</Button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Dialog: Generate Agent Wallet
// ═══════════════════════════════════════════════════════════════

function GenerateWalletDialog({ open, onClose, onCreate }: {
    open: boolean; onClose: () => void;
    onCreate: (d: { label: string; network: string }) => Promise<{ privateKeyHex?: string; address?: string; error?: string }>;
}) {
    const [label, setLabel] = useState(""); const [network, setNetwork] = useState("testnet"); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<{ address: string; privateKeyHex: string } | null>(null);
    if (!open) return null;
    const handle = async () => {
        setError(""); if (!label) { setError("Label required"); return; }
        setLoading(true);
        const r = await onCreate({ label, network });
        setLoading(false);
        if (r.error) setError(r.error);
        else if (r.privateKeyHex && r.address) setResult({ address: r.address, privateKeyHex: r.privateKeyHex });
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-purple-400" /><h2 className="text-lg font-semibold">Generate Flow Agent Wallet</h2></div>
                {result ? (
                    <div className="space-y-3">
                        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-400">
                            Wallet generated. <strong>Save the private key below — it will not be shown again.</strong>
                        </div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Flow Address</label><p className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-all">{result.address}</p></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Private Key (hex) — save now!</label><p className="font-mono text-xs bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 break-all">{result.privateKeyHex}</p></div>
                        <Button size="sm" className="w-full" onClick={onClose}>Done</Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Label</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="DeFi Agent #1" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Network</label>
                            <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={network} onChange={(e) => setNetwork(e.target.value)}>
                                <option value="testnet">Testnet</option><option value="mainnet">Mainnet</option>
                            </select></div>
                        {error && <p className="text-xs text-red-400">{error}</p>}
                        <div className="flex gap-2 justify-end pt-2">
                            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                            <Button size="sm" onClick={handle} disabled={loading}>{loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Fingerprint className="h-3.5 w-3.5 mr-1.5" />}Generate</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function FlowModPage() {
    const { currentOrg } = useOrg();
    const { address } = useSession();
    const orgId = currentOrg?.id || "";
    const userId = address || "";

    const [activeTab, setActiveTab] = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);

    // Data state
    const [wallets, setWallets] = useState<FlowAgentWallet[]>([]);
    const [payments, setPayments] = useState<FlowPayment[]>([]);
    const [bounties, setBounties] = useState<FlowBounty[]>([]);
    const [subscriptions, setSubscriptions] = useState<FlowSubscription[]>([]);
    const [auditEntries, setAuditEntries] = useState<FlowAuditEntry[]>([]);
    const [policy, setPolicy] = useState<(FlowPolicy & { configured?: boolean }) | null>(null);
    const [deployments, setDeployments] = useState<FlowDeployment[]>([]);
    const [balance, setBalance] = useState<{ balanceFlow: string } | null>(null);
    const [reputation, setReputation] = useState<{ creditScore: number; trustScore: number; tier: string } | null>(null);
    const [badges, setBadges] = useState<Array<{ name: string; rarity: string; description: string; awardedAt: unknown }>>([]);

    // Dialog state
    const [showSend, setShowSend] = useState(false);
    const [showBounty, setShowBounty] = useState(false);
    const [showGenWallet, setShowGenWallet] = useState(false);

    // Fetch data
    const fetchData = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [walletsRes, paymentsRes, bountiesRes, policyRes, auditRes, deployRes] = await Promise.all([
                fetch(`/api/v1/flow/agent-wallets?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ wallets: [] })),
                fetch(`/api/v1/flow/payments?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ payments: [] })),
                fetch(`/api/v1/flow/bounties?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ bounties: [] })),
                fetch(`/api/v1/flow/policies?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ policy: null })),
                fetch(`/api/v1/flow/audit?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ entries: [] })),
                fetch(`/api/v1/flow/deploy?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ deployments: [] })),
            ]);
            setWallets(walletsRes.wallets || []);
            setPayments(paymentsRes.payments || []);
            setBounties(bountiesRes.bounties || []);
            setPolicy(policyRes.policy || null);
            setAuditEntries(auditRes.entries || []);
            setDeployments(deployRes.deployments || []);

            // Fetch balance for first wallet (use wallet's actual network)
            if (walletsRes.wallets?.length > 0) {
                const w = walletsRes.wallets[0];
                const net = w.network || "testnet";
                const balRes = await fetch(`/api/v1/flow/balance?address=${w.address}&network=${net}`).then((r) => r.json()).catch(() => null);
                if (balRes) setBalance({ balanceFlow: balRes.balanceFlow || "0" });
            }

            // Fetch reputation (needs ASN — use orgId as fallback)
            const repRes = await fetch(`/api/v1/flow/reputation?orgId=${orgId}&asn=${orgId}`).then((r) => r.json()).catch(() => null);
            if (repRes?.events?.length > 0) {
                const latest = repRes.events[0];
                setReputation({
                    creditScore: latest.newCreditScore ?? 680,
                    trustScore: latest.newTrustScore ?? 50,
                    tier: latest.tier || "Bronze",
                });
            } else {
                setReputation({ creditScore: 680, trustScore: 50, tier: "Bronze" });
            }

            // Fetch achievements
            const badgeRes = await fetch(`/api/v1/flow/achievements?orgId=${orgId}`).then((r) => r.json()).catch(() => null);
            if (badgeRes?.badges) setBadges(badgeRes.badges);
        } catch (err) {
            console.error("Failed to fetch Flow data:", err);
        }
        setLoading(false);
    }, [orgId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Action handlers
    const handleSend = async (d: { fromAddress: string; toAddress: string; amountFlow: string; memo: string }) => {
        const res = await fetch("/api/v1/flow/payments", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, fromAddress: d.fromAddress, toAddress: d.toAddress, amount: flowToMiniFlow(d.amountFlow), memo: d.memo, createdBy: userId }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed" };
        await fetchData();
        return {};
    };

    const handlePostBounty = async (d: { title: string; description: string; amountFlow: string; funderAddress: string; tags: string }) => {
        const res = await fetch("/api/v1/flow/bounties", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, title: d.title, description: d.description, amount: flowToMiniFlow(d.amountFlow), funderAddress: d.funderAddress, tags: d.tags ? d.tags.split(",").map((t) => t.trim()) : [], postedBy: userId }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed" };
        await fetchData();
        return {};
    };

    const handleGenWallet = async (d: { label: string; network: string }) => {
        const res = await fetch("/api/v1/flow/agent-wallets", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, label: d.label, network: d.network, createdBy: userId }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed" };
        await fetchData();
        return { privateKeyHex: data.privateKeyHex, address: data.wallet?.address };
    };

    // Stats
    const pending = payments.filter((p) => p.status === "pending_approval").length;
    const executed = payments.filter((p) => p.status === "executed");
    const totalSent = executed.reduce((s, p) => s + parseFloat(miniFlowToFlow(p.amount) || "0"), 0);
    const openBounties = bounties.filter((b) => b.status === "open").length;
    const primary = wallets[0];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <CoinsIcon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Flow DeFi</h1>
                        <p className="text-xs text-muted-foreground">Consumer DeFi on Flow L1 — Cadence + EVM</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={fetchData}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
                    </Button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap",
                                activeTab === tab.id ? "bg-card border border-b-0 border-border text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />{tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
                <div className="space-y-4">
                    {primary ? (
                        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-blue-500/5 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                        <CoinsIcon className="h-5 w-5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-sm font-mono">{shortAddr(primary.address)}</p><CopyBtn text={primary.address} />
                                        </div>
                                        <p className="text-2xl font-bold mt-0.5">{balance ? `${balance.balanceFlow} FLOW` : "—"}</p>
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => setShowSend(true)}><Send className="h-3.5 w-3.5 mr-1.5" />Send</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
                            <Wallet className="h-10 w-10 text-muted-foreground mx-auto" />
                            <p className="text-sm text-muted-foreground">No Flow wallet configured</p>
                            <Button size="sm" onClick={() => setShowGenWallet(true)}><KeyRound className="h-3.5 w-3.5 mr-1.5" />Generate Agent Wallet</Button>
                        </div>
                    )}

                    <div className="grid grid-cols-4 gap-3">
                        {[
                            { label: "Payments", value: payments.length, color: "text-blue-400" },
                            { label: "Pending Approval", value: pending, color: pending > 0 ? "text-yellow-400" : "text-muted-foreground" },
                            { label: "Open Bounties", value: openBounties, color: "text-yellow-400" },
                            { label: "Total Sent", value: `${totalSent.toFixed(2)} FLOW`, color: "text-emerald-400" },
                        ].map((s) => (
                            <div key={s.label} className="rounded-lg border border-border p-3 bg-card">
                                <p className="text-xs text-muted-foreground">{s.label}</p>
                                <p className={cn("text-lg font-bold mt-0.5", s.color)}>{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Flow blockchain info */}
                    <div className="rounded-lg border border-border p-4 bg-card space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" />Flow Blockchain</h3>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                            <div><span className="text-muted-foreground">Finality:</span> <span className="font-medium">2-5 seconds</span></div>
                            <div><span className="text-muted-foreground">Smart Contracts:</span> <span className="font-medium">Cadence + EVM</span></div>
                            <div><span className="text-muted-foreground">EVM Chain ID:</span> <span className="font-medium">747 (mainnet) / 545 (testnet)</span></div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "payments" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Payments ({payments.length})</h3>
                        <Button size="sm" onClick={() => setShowSend(true)} disabled={wallets.length === 0}><Plus className="h-3.5 w-3.5 mr-1.5" />New Payment</Button>
                    </div>
                    {payments.length === 0 ? <EmptyState label="No payments yet" /> : (
                        <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                                <thead><tr className="bg-muted/50 text-muted-foreground"><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">From</th><th className="text-left px-3 py-2">To</th><th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">Date</th></tr></thead>
                                <tbody>
                                    {payments.map((p) => {
                                        const st = PAYMENT_STATUS[p.status];
                                        const StIcon = st?.icon || CheckCircle2;
                                        return (
                                            <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                                                <td className="px-3 py-2"><span className={cn("flex items-center gap-1", st?.color)}><StIcon className="h-3 w-3" />{st?.label}</span></td>
                                                <td className="px-3 py-2 font-mono">{shortAddr(p.fromAddress)}</td>
                                                <td className="px-3 py-2 font-mono">{shortAddr(p.toAddress)}</td>
                                                <td className="px-3 py-2 text-right font-medium">{miniFlowToFlow(p.amount)} FLOW</td>
                                                <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(p.createdAt)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "bounties" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Bounties ({bounties.length})</h3>
                        <Button size="sm" onClick={() => setShowBounty(true)} disabled={wallets.length === 0}><Plus className="h-3.5 w-3.5 mr-1.5" />Post Bounty</Button>
                    </div>
                    {bounties.length === 0 ? <EmptyState label="No bounties posted" /> : (
                        <div className="space-y-2">
                            {bounties.map((b) => (
                                <div key={b.id} className="rounded-lg border border-border p-3 bg-card flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{b.title}</p>
                                            <span className={cn("text-xs font-medium", BOUNTY_STATUS_COLOR[b.status] || "text-muted-foreground")}>{b.status}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">{b.description || "No description"}</p>
                                        {b.tags.length > 0 && <div className="flex gap-1 mt-1">{b.tags.map((t) => <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</div>}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-emerald-400">{miniFlowToFlow(b.amount)} FLOW</p>
                                        <p className="text-[10px] text-muted-foreground">{fmtDate(b.createdAt)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "staking" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" />FLOW Staking</h3>
                    </div>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <p className="text-xs text-muted-foreground">Delegate FLOW to validators and earn staking rewards. Flow uses delegated proof of stake with ~5% APY.</p>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Est. APY</span><p className="text-lg font-bold text-emerald-400">~5.0%</p></div>
                            <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Min Stake</span><p className="text-lg font-bold">50 FLOW</p></div>
                            <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Lock Period</span><p className="text-lg font-bold">7 days</p></div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">ASN-linked staking — your agent&apos;s ASN tracks all staking activity for reputation scoring</p>
                    </div>
                </div>
            )}

            {activeTab === "swap" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="h-4 w-4 text-blue-400" />Token Swap (IncrementFi)</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <p className="text-xs text-muted-foreground">Swap tokens on Flow&apos;s leading DEX. Supports FLOW, USDC, FUSD, and custom FTs.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs text-muted-foreground mb-1 block">From Token</label>
                                <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                                    <option>FLOW</option><option>USDC</option><option>FUSD</option>
                                </select></div>
                            <div><label className="text-xs text-muted-foreground mb-1 block">To Token</label>
                                <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                                    <option>USDC</option><option>FLOW</option><option>FUSD</option>
                                </select></div>
                        </div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Amount</label>
                            <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" placeholder="0.0" /></div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Slippage: 0.5%</span><span>Price Impact: ~0.01%</span>
                        </div>
                        <Button size="sm" className="w-full" disabled={wallets.length === 0}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Swap</Button>
                    </div>
                </div>
            )}

            {activeTab === "bridge" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><ExternalLink className="h-4 w-4 text-purple-400" />Flow EVM Bridge</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <p className="text-xs text-muted-foreground">Bridge assets between native Cadence and Flow EVM (Chain ID 747/545). Move FLOW, FTs, and NFTs seamlessly.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-emerald-500/20 p-3 text-center">
                                <p className="text-xs text-muted-foreground">Cadence (Native)</p>
                                <p className="text-sm font-bold text-emerald-400">Flow VM</p>
                                <p className="text-[10px] text-muted-foreground">Cadence contracts, FlowToken</p>
                            </div>
                            <div className="rounded-lg border border-purple-500/20 p-3 text-center">
                                <p className="text-xs text-muted-foreground">EVM</p>
                                <p className="text-sm font-bold text-purple-400">Chain {wallets[0]?.network === "mainnet" ? "747" : "545"}</p>
                                <p className="text-[10px] text-muted-foreground">Solidity contracts, WFLOW</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">All bridge transactions are ASN-tracked and contribute to your agent&apos;s cross-chain reputation</p>
                    </div>
                </div>
            )}

            {activeTab === "reputation" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-yellow-400" />Agent Reputation (ASN-linked)</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Credit Score</p><p className="text-2xl font-bold text-yellow-400">{reputation?.creditScore ?? "—"}</p><p className="text-[10px] text-muted-foreground">300-900 range</p></div>
                            <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Trust Score</p><p className="text-2xl font-bold text-blue-400">{reputation?.trustScore ?? "—"}</p><p className="text-[10px] text-muted-foreground">0-100 range</p></div>
                            <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Tier</p><p className={`text-2xl font-bold ${reputation?.tier === "Diamond" ? "text-cyan-400" : reputation?.tier === "Platinum" ? "text-purple-400" : reputation?.tier === "Gold" ? "text-yellow-400" : reputation?.tier === "Silver" ? "text-gray-300" : "text-amber-700"}`}>{reputation?.tier ?? "—"}</p><p className="text-[10px] text-muted-foreground">650+ for Gold</p></div>
                        </div>
                        <div className="text-xs space-y-1">
                            <p className="font-medium">Score Events</p>
                            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                                <span>Bounty completed: +15 credit, +5 trust</span>
                                <span>Payment executed: +5 credit, +2 trust</span>
                                <span>Staking started: +10 credit, +3 trust</span>
                                <span>CID verified: +8 credit, +4 trust</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Reputation is synced across Hedera (HCS) and Flow. ASN is the universal agent identity.</p>
                    </div>
                </div>
            )}

            {activeTab === "achievements" && (() => {
                const ALL_BADGES = [
                    { name: "First Transfer", rarity: "common", desc: "Sent first FLOW payment", color: "border-gray-500/20" },
                    { name: "Bounty Hunter", rarity: "common", desc: "Completed first bounty", color: "border-gray-500/20" },
                    { name: "Validator Ally", rarity: "common", desc: "Delegated FLOW to validator", color: "border-gray-500/20" },
                    { name: "DeFi Explorer", rarity: "common", desc: "First token swap", color: "border-gray-500/20" },
                    { name: "Contract Creator", rarity: "rare", desc: "Deployed first contract", color: "border-blue-500/20" },
                    { name: "Data Guardian", rarity: "rare", desc: "Verified 10 CIDs", color: "border-blue-500/20" },
                    { name: "Bridge Builder", rarity: "rare", desc: "Used Flow EVM bridge", color: "border-blue-500/20" },
                    { name: "Gold Agent", rarity: "rare", desc: "Credit score 650+", color: "border-yellow-500/20" },
                    { name: "Platinum Agent", rarity: "epic", desc: "Credit score 750+", color: "border-purple-500/20" },
                    { name: "Payment Machine", rarity: "epic", desc: "100 payments", color: "border-purple-500/20" },
                    { name: "Genesis Pioneer", rarity: "legendary", desc: "PL Genesis hackathon", color: "border-orange-500/20" },
                    { name: "Diamond Agent", rarity: "legendary", desc: "Credit score 800+", color: "border-cyan-500/20" },
                ];
                const earnedNames = new Set(badges.map(b => b.name));
                return (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Fingerprint className="h-4 w-4 text-purple-400" />Achievement Badges {badges.length > 0 && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full">{badges.length} earned</span>}</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {ALL_BADGES.map((b) => {
                            const earned = earnedNames.has(b.name);
                            return (
                            <div key={b.name} className={`rounded-lg border ${earned ? b.color : "border-border"} p-3 bg-card ${!earned ? "opacity-40" : ""}`}>
                                <p className="text-xs font-medium">{b.name} {earned && <CheckCircle2 className="inline h-3 w-3 text-green-400 ml-1" />}</p>
                                <p className="text-[10px] text-muted-foreground">{b.desc}</p>
                                <span className={`text-[10px] font-medium ${b.rarity === "legendary" ? "text-orange-400" : b.rarity === "epic" ? "text-purple-400" : b.rarity === "rare" ? "text-blue-400" : "text-gray-400"}`}>{b.rarity}</span>
                            </div>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Badges are minted as NFTs on Flow and linked to your agent&apos;s ASN</p>
                </div>
                );
            })()}

            {activeTab === "cid-verify" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" />Cross-Chain CID Verification</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <p className="text-xs text-muted-foreground">Verify agent output CIDs across three networks simultaneously: Storacha (IPFS/Filecoin), Flow, and Filecoin mainnet.</p>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border border-emerald-500/20 p-3 text-center">
                                <p className="text-xs font-medium text-emerald-400">Storacha</p>
                                <p className="text-[10px] text-muted-foreground">IPFS + Filecoin hot storage</p>
                                <p className="text-[10px]">CID pinning + UCAN auth</p>
                            </div>
                            <div className="rounded-lg border border-blue-500/20 p-3 text-center">
                                <p className="text-xs font-medium text-blue-400">Flow</p>
                                <p className="text-[10px] text-muted-foreground">On-chain CID reference</p>
                                <p className="text-[10px]">Cadence tx verification</p>
                            </div>
                            <div className="rounded-lg border border-purple-500/20 p-3 text-center">
                                <p className="text-xs font-medium text-purple-400">Filecoin</p>
                                <p className="text-[10px] text-muted-foreground">Cold storage deal</p>
                                <p className="text-[10px]">Proof of Replication</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Each verification earns +8 credit, +4 trust for the agent&apos;s ASN reputation</p>
                    </div>
                </div>
            )}

            {activeTab === "history" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Transaction History</h3>
                    {payments.filter((p) => p.status === "executed").length === 0 ? <EmptyState label="No executed transactions" /> : (
                        <div className="space-y-2">
                            {payments.filter((p) => p.status === "executed").map((p) => (
                                <div key={p.id} className="rounded-lg border border-border p-3 bg-card flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                                        <div>
                                            <p className="text-xs font-mono">{shortAddr(p.fromAddress)} → {shortAddr(p.toAddress)}</p>
                                            <p className="text-[10px] text-muted-foreground">{p.memo || "No memo"}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold">{miniFlowToFlow(p.amount)} FLOW</p>
                                        <p className="text-[10px] text-muted-foreground">{fmtDate(p.executedAt || p.createdAt)}</p>
                                        {p.txHash && (
                                            <a href={`${FLOW_EXPLORERS[wallets[0]?.network === "mainnet" ? "mainnet" : "testnet"]}${p.txHash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5 justify-end">
                                                View <ExternalLink className="h-2.5 w-2.5" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "analytics" && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Analytics</h3>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Total Payments</p>
                            <p className="text-2xl font-bold text-blue-400">{payments.length}</p>
                        </div>
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Total Volume</p>
                            <p className="text-2xl font-bold text-emerald-400">{totalSent.toFixed(2)} FLOW</p>
                        </div>
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Agent Wallets</p>
                            <p className="text-2xl font-bold text-purple-400">{wallets.length}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Bounties Released</p>
                            <p className="text-2xl font-bold text-yellow-400">{bounties.filter((b) => b.status === "released").length}</p>
                        </div>
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Contracts Deployed</p>
                            <p className="text-2xl font-bold text-purple-400">{deployments.filter((d) => d.status === "deployed").length}</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "agent-wallets" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Agent Wallets ({wallets.length})</h3>
                        <Button size="sm" onClick={() => setShowGenWallet(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Generate Wallet</Button>
                    </div>
                    {wallets.length === 0 ? <EmptyState label="No agent wallets generated yet" /> : (
                        <div className="space-y-2">
                            {wallets.map((w) => (
                                <div key={w.id} className="rounded-lg border border-border p-3 bg-card flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{w.label}</p>
                                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", w.status === "active" ? "bg-green-500/10 text-green-400" : w.status === "frozen" ? "bg-yellow-500/10 text-yellow-400" : "bg-muted text-muted-foreground")}>{w.status}</span>
                                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{w.network}</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <p className="text-xs font-mono text-muted-foreground">{w.address}</p><CopyBtn text={w.address} />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{fmtDate(w.createdAt)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "deploy" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Contract Deployments ({deployments.length})</h3>
                    {deployments.length === 0 ? <EmptyState label="No deployments yet — deploy Cadence contracts, FTs, NFTs, or Solidity on Flow EVM" /> : (
                        <div className="space-y-2">
                            {deployments.map((d) => {
                                const meta = FLOW_DEPLOY_STATUS_META[d.status];
                                return (
                                    <div key={d.id} className="rounded-lg border border-border p-3 bg-card flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium">{d.name}</p>
                                                <span className={cn("text-[10px] font-medium", meta?.color)}>{meta?.label}</span>
                                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{FLOW_DEPLOY_TYPE_LABELS[d.type]}</span>
                                            </div>
                                            {d.contractAddress && <p className="text-xs font-mono text-muted-foreground mt-0.5">{d.contractAddress}</p>}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">{d.network}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "policy" && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-blue-400" />Spending Policy</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div><span className="text-muted-foreground">Per-TX Cap:</span> <span className="font-medium">{policy ? miniFlowToFlow(policy.perTxCap) : "5.0"} FLOW</span></div>
                            <div><span className="text-muted-foreground">Daily Cap:</span> <span className="font-medium">{policy ? miniFlowToFlow(policy.dailyCap) : "20.0"} FLOW</span></div>
                            <div><span className="text-muted-foreground">Monthly Cap:</span> <span className="font-medium">{policy ? miniFlowToFlow(policy.monthlyCap) : "100.0"} FLOW</span></div>
                            <div><span className="text-muted-foreground">Approval Threshold:</span> <span className="font-medium">{policy ? miniFlowToFlow(policy.approvalThreshold) : "2.0"} FLOW</span></div>
                        </div>
                        <div className="flex items-center gap-3 pt-2 border-t border-border">
                            <div className="flex items-center gap-1.5">
                                {policy?.paused ? <Ban className="h-3.5 w-3.5 text-red-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
                                <span className="text-xs">{policy?.paused ? "Treasury PAUSED" : "Treasury Active"}</span>
                            </div>
                            {policy?.requireApprovalForAll && (
                                <span className="text-xs text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />All payments require approval</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "audit" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Audit Log ({auditEntries.length})</h3>
                    {auditEntries.length === 0 ? <EmptyState label="No audit entries yet" /> : (
                        <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                                <thead><tr className="bg-muted/50 text-muted-foreground"><th className="text-left px-3 py-2">Event</th><th className="text-left px-3 py-2">Details</th><th className="text-right px-3 py-2">Date</th></tr></thead>
                                <tbody>
                                    {auditEntries.slice(0, 50).map((e) => (
                                        <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                                            <td className="px-3 py-2 font-medium">{e.event.replace(/_/g, " ")}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{e.note || "—"}</td>
                                            <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(e.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Dialogs */}
            <SendPaymentDialog open={showSend} onClose={() => setShowSend(false)} wallets={wallets} onSend={handleSend} />
            <PostBountyDialog open={showBounty} onClose={() => setShowBounty(false)} wallets={wallets} onPost={handlePostBounty} />
            <GenerateWalletDialog open={showGenWallet} onClose={() => { setShowGenWallet(false); fetchData(); }} onCreate={handleGenWallet} />
        </div>
    );
}
