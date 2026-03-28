"use client";

/**
 * TON Treasury Mod Dashboard
 *
 * Tabs: Overview | Payments | Bounties | Subscriptions | History | Analytics | Agent Wallets | Policy | Audit | Prank
 */

import { useState, useEffect, useCallback } from "react";
import {
    Diamond, Wallet, Send, RefreshCw, Shield, FileText, LayoutDashboard,
    ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Ban, ExternalLink,
    Plus, Pause, Play, Trash2, Copy, Check, Trophy, History, BarChart3,
    KeyRound, Percent, Globe, FlaskConical, TrendingUp, ArrowDownLeft,
    ArrowUpRight, Fingerprint, Ghost, Image, Mic, MessageSquare, Sparkles, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOrg } from "@/contexts/OrgContext";
import { useSession } from "@/contexts/SessionContext";
import {
    nanoToTon, tonToNano,
    type TonPolicy, type TonPayment, type TonSubscription, type TonAuditEntry,
    type TonPaymentStatus,
} from "@/lib/ton-policy";
import type { TonBounty, TonFeeConfig } from "@/lib/ton-bounty";
import type { TonAgentWallet } from "@/lib/ton-agent-wallet";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

type Tab = "overview" | "payments" | "bounties" | "subscriptions" | "history" | "analytics" | "agent-wallets" | "policy" | "audit" | "prank";

const TABS: { id: Tab; label: string; icon: typeof Diamond }[] = [
    { id: "overview",      label: "Overview",      icon: LayoutDashboard },
    { id: "payments",      label: "Payments",       icon: Send },
    { id: "bounties",      label: "Bounties",       icon: Trophy },
    { id: "subscriptions", label: "Subscriptions",  icon: RefreshCw },
    { id: "history",       label: "History",        icon: History },
    { id: "analytics",     label: "Analytics",      icon: BarChart3 },
    { id: "agent-wallets", label: "Agent Wallets",  icon: KeyRound },
    { id: "policy",        label: "Policy",         icon: Shield },
    { id: "audit",         label: "Audit",          icon: FileText },
    { id: "prank",         label: "Prank",          icon: Ghost },
];

const PAYMENT_STATUS: Record<TonPaymentStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
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

const TON_EXPLORER = "https://toncenter.com/tx/";

// ═══════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════

function shortAddr(addr: string | null | undefined): string {
    if (!addr || addr.length < 10) return addr || "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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
    wallets: { address: string; verified?: boolean }[];
    onSend: (d: { fromAddress: string; toAddress: string; amountTon: string; memo: string }) => Promise<{ error?: string }>;
}) {
    const [from, setFrom] = useState(wallets[0]?.address || "");
    const [to, setTo] = useState(""); const [amount, setAmount] = useState(""); const [memo, setMemo] = useState("");
    const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [sim, setSim] = useState<{ allowed: boolean; requiresApproval: boolean; reason: string } | null>(null);

    const simulate = useCallback(async () => {
        if (!to || !amount || isNaN(parseFloat(amount))) { setSim(null); return; }
        try {
            const res = await fetch("/api/v1/ton/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: "", toAddress: to, amountNano: tonToNano(amount) }) });
            if (res.ok) setSim(await res.json());
        } catch { /* silent */ }
    }, [to, amount]);

    useEffect(() => { if (open) simulate(); }, [open, simulate]);

    if (!open) return null;
    const handleSend = async () => {
        setError("");
        if (!from || !to || !amount) { setError("All fields required"); return; }
        setLoading(true);
        const r = await onSend({ fromAddress: from, toAddress: to, amountTon: amount, memo });
        setLoading(false);
        if (r.error) setError(r.error); else onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><Send className="h-5 w-5 text-blue-400" /><h2 className="text-lg font-semibold">Send Toncoin</h2></div>
                <div className="space-y-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">From</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)}>
                            {wallets.map((w) => <option key={w.address} value={w.address}>{shortAddr(w.address)} {w.verified ? "✓" : ""}</option>)}
                        </select></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">To (address or .ton name)</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono" placeholder="EQD... or myagent.ton" value={to} onChange={(e) => setTo(e.target.value)} onBlur={simulate} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Amount (TON)</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={simulate} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Memo</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Task bounty #42" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
                    {sim && (
                        <div className={cn("text-xs rounded-md px-3 py-2", sim.allowed ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                            {sim.allowed ? (sim.requiresApproval ? "⚠ Requires admin approval" : "✓ Within policy — executes immediately") : `✗ ${sim.reason}`}
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
    wallets: { address: string }[];
    onPost: (d: { title: string; description: string; amountTon: string; funderAddress: string; tags: string }) => Promise<{ error?: string }>;
}) {
    const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [funder, setFunder] = useState(wallets[0]?.address || ""); const [tags, setTags] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
    if (!open) return null;
    const handle = async () => {
        setError(""); if (!title || !amount) { setError("Title and amount required"); return; }
        setLoading(true);
        const r = await onPost({ title, description: desc, amountTon: amount, funderAddress: funder, tags });
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
                        <div><label className="text-xs text-muted-foreground mb-1 block">Amount (TON)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Tags (comma-sep)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="research,analysis" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
                    </div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Funder Wallet</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={funder} onChange={(e) => setFunder(e.target.value)}>
                            {wallets.map((w) => <option key={w.address} value={w.address}>{shortAddr(w.address)}</option>)}
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
    onCreate: (d: { label: string; network: string }) => Promise<{ privateKeyHex?: string; error?: string }>;
}) {
    const [label, setLabel] = useState(""); const [network, setNetwork] = useState("mainnet"); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<{ address: string; privateKeyHex: string } | null>(null);
    if (!open) return null;
    const handle = async () => {
        setError(""); if (!label) { setError("Label required"); return; }
        setLoading(true);
        const r = await onCreate({ label, network });
        setLoading(false);
        if (r.error) setError(r.error);
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-purple-400" /><h2 className="text-lg font-semibold">Generate Agent Wallet</h2></div>
                {result ? (
                    <div className="space-y-3">
                        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-400">
                            Wallet generated. <strong>Save the private key below — it will not be shown again.</strong>
                        </div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">TON Address</label><p className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-all">{result.address}</p></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Private Key (hex) — save now!</label><p className="font-mono text-xs bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 break-all">{result.privateKeyHex}</p></div>
                        <Button size="sm" className="w-full" onClick={onClose}>Done</Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Label</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Research Agent #1" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Network</label>
                            <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={network} onChange={(e) => setNetwork(e.target.value)}>
                                <option value="mainnet">Mainnet</option><option value="testnet">Testnet</option>
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
// Dialog: Create Subscription
// ═══════════════════════════════════════════════════════════════

function CreateSubDialog({ open, onClose, wallets, onCreate }: {
    open: boolean; onClose: () => void; wallets: { address: string }[];
    onCreate: (d: { fromAddress: string; toAddress: string; amountTon: string; memo: string; frequency: string; maxCycles: string }) => Promise<{ error?: string }>;
}) {
    const [from, setFrom] = useState(wallets[0]?.address || ""); const [to, setTo] = useState(""); const [amount, setAmount] = useState(""); const [memo, setMemo] = useState(""); const [freq, setFreq] = useState("monthly"); const [maxC, setMaxC] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
    if (!open) return null;
    const handle = async () => {
        setError(""); if (!from || !to || !amount) { setError("Required fields missing"); return; }
        setLoading(true);
        const r = await onCreate({ fromAddress: from, toAddress: to, amountTon: amount, memo, frequency: freq, maxCycles: maxC });
        setLoading(false);
        if (r.error) setError(r.error); else onClose();
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-green-400" /><h2 className="text-lg font-semibold">Create Subscription</h2></div>
                <div className="space-y-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">From</label><select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)}>{wallets.map((w) => <option key={w.address} value={w.address}>{shortAddr(w.address)}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">To</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono" placeholder="EQD..." value={to} onChange={(e) => setTo(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Amount (TON)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Frequency</label><select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={freq} onChange={(e) => setFreq(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Max Cycles (blank=∞)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="1" value={maxC} onChange={(e) => setMaxC(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Memo</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
                    </div>
                    {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" onClick={handle} disabled={loading}>{loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}Create</Button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Overview Panel
// ═══════════════════════════════════════════════════════════════

function OverviewPanel({ wallets, payments, subscriptions, bounties, balance, policy, feeConfig, onConnect, onSend }: {
    wallets: { address: string; verified: boolean }[]; payments: TonPayment[]; subscriptions: TonSubscription[]; bounties: TonBounty[];
    balance: { balanceTon: string } | null; policy: (TonPolicy & { configured?: boolean }) | null; feeConfig: TonFeeConfig | null;
    onConnect: () => void; onSend: () => void;
}) {
    const pending = payments.filter((p) => p.status === "pending_approval").length;
    const executed = payments.filter((p) => p.status === "executed");
    const totalSent = executed.reduce((s, p) => s + parseFloat(nanoToTon(p.amountNano) || "0"), 0);
    const openBounties = bounties.filter((b) => b.status === "open").length;
    const primary = wallets.find((w) => w.verified) || wallets[0];

    return (
        <div className="space-y-4">
            {primary ? (
                <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center"><span className="text-lg">💎</span></div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-mono">{shortAddr(primary.address)}</p><CopyBtn text={primary.address} />
                                    {primary.verified && <span className="flex items-center gap-0.5 text-xs text-green-400"><ShieldCheck className="h-3 w-3" />Verified</span>}
                                </div>
                                <p className="text-2xl font-bold mt-0.5">{balance ? `${balance.balanceTon} TON` : "—"}</p>
                            </div>
                        </div>
                        <Button size="sm" onClick={onSend}><Send className="h-3.5 w-3.5 mr-1.5" />Send</Button>
                    </div>
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
                    <Wallet className="h-10 w-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No TON wallet connected</p>
                    <Button size="sm" onClick={onConnect}><Wallet className="h-3.5 w-3.5 mr-1.5" />Connect Wallet</Button>
                </div>
            )}

            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: "Payments", value: payments.length, color: "text-blue-400" },
                    { label: "Pending Approval", value: pending, color: pending > 0 ? "text-yellow-400" : "text-muted-foreground" },
                    { label: "Open Bounties", value: openBounties, color: "text-yellow-400" },
                    { label: "Total Sent", value: `${totalSent.toFixed(2)} TON`, color: "text-purple-400" },
                ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                        <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                    </div>
                ))}
            </div>

            {policy && (
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-purple-400" /><span className="text-sm font-medium">Spending Policy</span></div>
                        {policy.paused
                            ? <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full"><AlertTriangle className="h-3 w-3" />Paused</span>
                            : <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" />Active</span>}
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                        {[
                            { label: "Per-tx cap", value: `${nanoToTon(policy.perTxCapNano)} TON` },
                            { label: "Daily cap", value: `${nanoToTon(policy.dailyCapNano)} TON` },
                            { label: "Approval >", value: `${nanoToTon(policy.approvalThresholdNano)} TON` },
                            { label: "Platform fee", value: feeConfig ? `${(feeConfig.feeBps / 100).toFixed(1)}%` : "—" },
                        ].map((f) => (
                            <div key={f.label}><p className="text-xs text-muted-foreground">{f.label}</p><p className="font-medium">{f.value}</p></div>
                        ))}
                    </div>
                </div>
            )}

            {payments.length > 0 && (
                <div className="rounded-lg border border-border bg-card">
                    <div className="px-4 py-2.5 border-b border-border"><p className="text-sm font-medium">Recent Payments</p></div>
                    <div className="divide-y divide-border">
                        {payments.slice(0, 5).map((p) => {
                            const s = PAYMENT_STATUS[p.status];
                            return (
                                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <s.icon className={cn("h-3.5 w-3.5", s.color)} />
                                        <div><p className="text-xs font-mono text-muted-foreground">{shortAddr(p.toAddress)}</p><p className="text-xs text-muted-foreground">{p.memo || "No memo"}</p></div>
                                    </div>
                                    <div className="text-right"><p className="text-sm font-medium">{nanoToTon(p.amountNano)} TON</p><p className={cn("text-xs", s.color)}>{s.label}</p></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Payments Panel
// ═══════════════════════════════════════════════════════════════

function PaymentsPanel({ payments, actionLoading, onApprove, onReject, onSend, onRefresh }: {
    payments: TonPayment[]; actionLoading: string | null;
    onApprove: (p: TonPayment) => void; onReject: (p: TonPayment) => void; onSend: () => void; onRefresh: () => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</p>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button><Button size="sm" onClick={onSend}><Plus className="h-3.5 w-3.5 mr-1.5" />New Payment</Button></div>
            </div>
            {payments.length === 0 ? <EmptyState label="No payments yet" /> : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {payments.map((p) => {
                        const s = PAYMENT_STATUS[p.status];
                        return (
                            <div key={p.id} className="p-4 space-y-2">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <s.icon className={cn("h-4 w-4 shrink-0", s.color)} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1 text-xs"><span className="text-muted-foreground font-mono">{shortAddr(p.fromAddress)}</span><span className="text-muted-foreground">→</span><span className="font-mono">{shortAddr(p.toAddress)}</span><CopyBtn text={p.toAddress} /></div>
                                            <p className="text-xs text-muted-foreground truncate">{p.memo || "No memo"}</p>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0"><p className="font-semibold">{nanoToTon(p.amountNano)} TON</p><p className={cn("text-xs", s.color)}>{s.label}</p></div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-3 text-xs text-muted-foreground">
                                        <span>{fmtDate(p.createdAt)}</span>
                                        {p.txHash && <a href={`${TON_EXPLORER}${p.txHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-blue-400 hover:underline"><ExternalLink className="h-3 w-3" />On-chain</a>}
                                    </div>
                                    {p.status === "pending_approval" && (
                                        <div className="flex gap-1.5">
                                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" disabled={actionLoading === `reject-${p.id}`} onClick={() => onReject(p)}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                                            <Button size="sm" className="h-7 text-xs" disabled={actionLoading === `approve-${p.id}`} onClick={() => onApprove(p)}>{actionLoading === `approve-${p.id}` ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Approve</Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Bounties Panel
// ═══════════════════════════════════════════════════════════════

function BountiesPanel({ bounties, actionLoading, wallet, feeConfig, onPost, onAction, onRefresh }: {
    bounties: TonBounty[]; actionLoading: string | null; wallet: string | null | undefined;
    feeConfig: TonFeeConfig | null;
    onPost: () => void;
    onAction: (id: string, action: string, extra?: Record<string, string>) => void;
    onRefresh: () => void;
}) {
    const [proofInput, setProofInput] = useState<Record<string, string>>({});
    const feePercent = feeConfig?.enabled ? (feeConfig.feeBps / 100).toFixed(1) : "0";

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">{bounties.length} bounti{bounties.length !== 1 ? "es" : "y"}</p>
                    {feeConfig?.enabled && (
                        <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Percent className="h-3 w-3" />{feePercent}% platform fee
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" onClick={onPost}><Plus className="h-3.5 w-3.5 mr-1.5" />Post Bounty</Button>
                </div>
            </div>
            {bounties.length === 0 ? <EmptyState label="No bounties yet — post the first task" /> : (
                <div className="space-y-2">
                    {bounties.map((b) => (
                        <div key={b.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-medium text-sm">{b.title}</p>
                                    {b.description && <p className="text-xs text-muted-foreground mt-0.5">{b.description.slice(0, 100)}{b.description.length > 100 ? "…" : ""}</p>}
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                        {b.tags.map((t) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{t}</span>)}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="font-semibold">{nanoToTon(b.amountNano)} {b.tokenSymbol}</p>
                                    <span className={cn("text-xs capitalize", BOUNTY_STATUS_COLOR[b.status] || "text-muted-foreground")}>{b.status}</span>
                                </div>
                            </div>

                            {b.claimerAddress && (
                                <div className="text-xs text-muted-foreground">Claimer: <span className="font-mono">{shortAddr(b.claimerAddress)}</span></div>
                            )}
                            {b.deliveryProof && (
                                <div className="text-xs text-muted-foreground">Proof: <span className="text-foreground">{b.deliveryProof.slice(0, 80)}</span></div>
                            )}
                            {b.releaseTxHash && (
                                <a href={`${TON_EXPLORER}${b.releaseTxHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-0.5">
                                    <ExternalLink className="h-3 w-3" />View payout on-chain
                                </a>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{fmtDate(b.createdAt)}</span>
                                <div className="flex gap-1.5">
                                    {b.status === "open" && (
                                        <>
                                            <Button size="sm" className="h-7 text-xs" disabled={actionLoading === `claim-${b.id}`} onClick={() => onAction(b.id, "claim", { claimerAddress: wallet || "" })}><CheckCircle2 className="h-3 w-3 mr-1" />Claim</Button>
                                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30" onClick={() => onAction(b.id, "cancel")}><Ban className="h-3 w-3 mr-1" />Cancel</Button>
                                        </>
                                    )}
                                    {b.status === "claimed" && (
                                        <div className="flex items-center gap-2">
                                            <input className="h-7 bg-background border border-border rounded px-2 text-xs" placeholder="Delivery proof / URL" value={proofInput[b.id] || ""} onChange={(e) => setProofInput((p) => ({ ...p, [b.id]: e.target.value }))} />
                                            <Button size="sm" className="h-7 text-xs" disabled={actionLoading === `submit-${b.id}`} onClick={() => onAction(b.id, "submit", { deliveryProof: proofInput[b.id] || "" })}>Submit</Button>
                                        </div>
                                    )}
                                    {b.status === "submitted" && (
                                        <>
                                            <Button size="sm" className="h-7 text-xs" disabled={actionLoading === `approve-${b.id}`} onClick={() => onAction(b.id, "approve", { reviewedBy: wallet || "", amountNano: b.amountNano, claimerAddress: b.claimerAddress || "" })}><CheckCircle2 className="h-3 w-3 mr-1" />Approve & Release</Button>
                                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30" onClick={() => onAction(b.id, "reject", { reviewedBy: wallet || "" })}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Subscriptions Panel
// ═══════════════════════════════════════════════════════════════

function SubsPanel({ subs, actionLoading, onPause, onResume, onCancel, onCreate, onRefresh }: {
    subs: TonSubscription[]; actionLoading: string | null;
    onPause: (id: string) => void; onResume: (id: string) => void; onCancel: (id: string) => void; onCreate: () => void; onRefresh: () => void;
}) {
    const sc: Record<string, string> = { active: "text-green-400", paused: "text-yellow-400", cancelled: "text-red-400", completed: "text-muted-foreground" };
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{subs.length} subscription{subs.length !== 1 ? "s" : ""}</p>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button><Button size="sm" onClick={onCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />New</Button></div>
            </div>
            {subs.length === 0 ? <EmptyState label="No subscriptions yet" /> : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {subs.map((s) => (
                        <div key={s.id} className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-4">
                                <div><div className="flex items-center gap-1"><span className="text-xs font-mono text-muted-foreground">{shortAddr(s.toAddress)}</span><CopyBtn text={s.toAddress} /></div><p className="text-xs text-muted-foreground">{s.memo || "No memo"}</p></div>
                                <div className="text-right"><p className="font-semibold">{nanoToTon(s.amountNano)} TON</p><p className="text-xs text-muted-foreground capitalize">{s.frequency}</p></div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                    <span className={cn("capitalize", sc[s.status])}>{s.status}</span>
                                    <span>{s.cyclesCompleted}/{s.maxCycles ?? "∞"} cycles</span>
                                    {s.nextPaymentAt && <span>Next: {fmtDate(s.nextPaymentAt)}</span>}
                                </div>
                                {s.status === "active" && <div className="flex gap-1.5">
                                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionLoading === `pause-${s.id}`} onClick={() => onPause(s.id)}><Pause className="h-3 w-3 mr-1" />Pause</Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30" disabled={actionLoading === `cancel-${s.id}`} onClick={() => onCancel(s.id)}><Trash2 className="h-3 w-3 mr-1" />Cancel</Button>
                                </div>}
                                {s.status === "paused" && <Button size="sm" className="h-7 text-xs" disabled={actionLoading === `resume-${s.id}`} onClick={() => onResume(s.id)}><Play className="h-3 w-3 mr-1" />Resume</Button>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// History Panel
// ═══════════════════════════════════════════════════════════════

type OnChainTx = { hash: string; direction: string; amountTon: string; date: string; from: string; to: string | null; feesTon: string; explorerUrl: string };

function HistoryPanel({ address, network }: { address: string | null; network: string }) {
    const [txs, setTxs] = useState<OnChainTx[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!address) return;
        setLoading(true); setError("");
        try {
            const res = await fetch(`/api/v1/ton/history?address=${encodeURIComponent(address)}&limit=30&network=${network}`);
            if (res.ok) { const d = await res.json(); setTxs(d.transactions || []); }
            else setError("Failed to load history");
        } catch { setError("Network error"); }
        setLoading(false);
    }, [address, network]);

    useEffect(() => { load(); }, [load]);

    if (!address) return <EmptyState label="Connect a wallet to view transaction history" />;
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{txs.length} transactions for <span className="font-mono">{shortAddr(address)}</span></p>
                <Button variant="outline" size="sm" onClick={load}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /></Button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {loading && txs.length === 0 ? <div className="flex justify-center py-10"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div> : txs.length === 0 ? <EmptyState label="No transactions found" /> : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {txs.map((tx) => (
                        <div key={tx.hash} className="px-4 py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                {tx.direction === "in"
                                    ? <ArrowDownLeft className="h-4 w-4 text-green-400 shrink-0" />
                                    : <ArrowUpRight className="h-4 w-4 text-red-400 shrink-0" />}
                                <div>
                                    <p className="text-xs font-mono text-muted-foreground">{tx.direction === "in" ? `from ${shortAddr(tx.from)}` : `to ${shortAddr(tx.to)}`}</p>
                                    <p className="text-xs text-muted-foreground">{new Date(tx.date).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <p className={cn("font-semibold text-sm", tx.direction === "in" ? "text-green-400" : "text-foreground")}>
                                    {tx.direction === "in" ? "+" : "-"}{tx.amountTon} TON
                                </p>
                                <a href={tx.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300"><ExternalLink className="h-3.5 w-3.5" /></a>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Analytics Panel
// ═══════════════════════════════════════════════════════════════

function AnalyticsPanel({ payments, bounties, subscriptions, feeConfig }: {
    payments: TonPayment[]; bounties: TonBounty[]; subscriptions: TonSubscription[]; feeConfig: TonFeeConfig | null;
}) {
    const executed = payments.filter((p) => p.status === "executed");
    const totalSent = executed.reduce((s, p) => s + parseFloat(nanoToTon(p.amountNano)), 0);
    const releasedBounties = bounties.filter((b) => b.status === "released");
    const totalBountyPayout = releasedBounties.reduce((s, b) => s + parseFloat(nanoToTon(b.netAmountNano || b.amountNano)), 0);
    const totalFeeEarned = releasedBounties.reduce((s, b) => s + parseFloat(nanoToTon(b.feeNano || "0")), 0);
    const activeSubs = subscriptions.filter((s) => s.status === "active").length;
    const feePercent = feeConfig?.enabled ? (feeConfig.feeBps / 100).toFixed(1) : "0";

    // Daily spend (last 7 days)
    const days: { date: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
        const next = new Date(d); next.setDate(next.getDate() + 1);
        const label = d.toLocaleDateString(undefined, { weekday: "short" });
        const amount = executed
            .filter((p) => p.executedAt && new Date(p.executedAt) >= d && new Date(p.executedAt) < next)
            .reduce((s, p) => s + parseFloat(nanoToTon(p.amountNano)), 0);
        days.push({ date: label, amount });
    }
    const maxDay = Math.max(...days.map((d) => d.amount), 0.01);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: "Total Payments", value: executed.length, icon: Send, color: "text-blue-400" },
                    { label: "Total Sent", value: `${totalSent.toFixed(2)} TON`, icon: TrendingUp, color: "text-purple-400" },
                    { label: "Bounties Released", value: releasedBounties.length, icon: Trophy, color: "text-yellow-400" },
                    { label: "Fee Revenue", value: `${totalFeeEarned.toFixed(3)} TON`, icon: Percent, color: "text-green-400" },
                ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center gap-2 mb-1"><s.icon className={cn("h-4 w-4", s.color)} /><span className="text-xs text-muted-foreground">{s.label}</span></div>
                        <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Daily spend chart */}
            <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-medium mb-4">Daily Spend — Last 7 Days</p>
                <div className="flex items-end gap-2 h-24">
                    {days.map((d) => (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-blue-500/20 rounded-t-sm" style={{ height: `${Math.max(4, (d.amount / maxDay) * 80)}px` }} />
                            <span className="text-xs text-muted-foreground">{d.date}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Revenue breakdown */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2"><Percent className="h-4 w-4 text-green-400" />Platform Revenue</p>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Fee rate</span><span>{feePercent}%</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Bounty payouts</span><span>{totalBountyPayout.toFixed(3)} TON</span></div>
                        <div className="flex justify-between font-medium"><span>Total fees earned</span><span className="text-green-400">{totalFeeEarned.toFixed(4)} TON</span></div>
                    </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2"><RefreshCw className="h-4 w-4 text-blue-400" />Subscriptions</p>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Active</span><span className="text-green-400">{activeSubs}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{subscriptions.length}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span>{subscriptions.filter((s) => s.status === "completed").length}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Agent Wallets Panel
// ═══════════════════════════════════════════════════════════════

function AgentWalletsPanel({ agentWallets, actionLoading, onGenerate, onAction, onRefresh }: {
    agentWallets: TonAgentWallet[]; actionLoading: string | null;
    onGenerate: () => void; onAction: (id: string, status: "active" | "frozen" | "retired") => void; onRefresh: () => void;
}) {
    const statusColor: Record<string, string> = { active: "text-green-400", frozen: "text-yellow-400", retired: "text-muted-foreground" };
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{agentWallets.length} agent wallet{agentWallets.length !== 1 ? "s" : ""}</p>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button><Button size="sm" onClick={onGenerate}><Plus className="h-3.5 w-3.5 mr-1.5" />Generate Wallet</Button></div>
            </div>
            <div className="rounded-lg border border-border bg-amber-500/5 border-amber-500/20 px-4 py-2.5 text-xs text-amber-400">
                Private keys are encrypted with AES-256-GCM and stored in the org secrets vault. They are only shown once at generation time.
            </div>
            {agentWallets.length === 0 ? <EmptyState label="No agent wallets generated yet" /> : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {agentWallets.map((w) => (
                        <div key={w.id} className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-purple-400" /><p className="text-sm font-medium">{w.label}</p></div>
                                    <div className="flex items-center gap-1 mt-0.5"><p className="text-xs font-mono text-muted-foreground">{w.address}</p><CopyBtn text={w.address} /></div>
                                    {w.agentId && <p className="text-xs text-muted-foreground mt-0.5">Agent: {w.agentId}</p>}
                                </div>
                                <div className="text-right">
                                    <span className={cn("text-xs capitalize", statusColor[w.status])}>{w.status}</span>
                                    <p className="text-xs text-muted-foreground">{w.network}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">PK: <span className="font-mono">{w.privateKeyMasked}</span></span>
                                {w.status === "active" && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs text-yellow-400 border-yellow-500/30" onClick={() => onAction(w.id, "frozen")}><Pause className="h-3 w-3 mr-1" />Freeze</Button>
                                )}
                                {w.status === "frozen" && (
                                    <div className="flex gap-1.5">
                                        <Button size="sm" className="h-7 text-xs" onClick={() => onAction(w.id, "active")}><Play className="h-3 w-3 mr-1" />Unfreeze</Button>
                                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30" onClick={() => onAction(w.id, "retired")}><Trash2 className="h-3 w-3 mr-1" />Retire</Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Policy Panel
// ═══════════════════════════════════════════════════════════════

function PolicyPanel({ policy, feeConfig, onSave, onSaveFee, onRefresh }: {
    policy: (TonPolicy & { configured?: boolean }) | null; feeConfig: TonFeeConfig | null;
    onSave: (d: { perTxCapTon: string; dailyCapTon: string; monthlyCapTon: string; approvalThresholdTon: string; allowlistRaw: string; paused: boolean; requireApprovalForAll: boolean; notifyTelegramChatId: string }) => Promise<{ error?: string }>;
    onSaveFee: (d: { feeBps: number; feeRecipientAddress: string; minFeeBountyTon: string; enabled: boolean }) => Promise<{ error?: string }>;
    onRefresh: () => void;
}) {
    const [perTx, setPerTx] = useState(policy ? nanoToTon(policy.perTxCapNano) : "5");
    const [daily, setDaily] = useState(policy ? nanoToTon(policy.dailyCapNano) : "20");
    const [monthly, setMonthly] = useState(policy ? nanoToTon(policy.monthlyCapNano) : "100");
    const [threshold, setThreshold] = useState(policy ? nanoToTon(policy.approvalThresholdNano) : "2");
    const [allowlist, setAllowlist] = useState(policy ? policy.allowlist.join("\n") : "");
    const [paused, setPaused] = useState(policy?.paused ?? false);
    const [requireApprovalForAll, setRequireApprovalForAll] = useState(policy?.requireApprovalForAll ?? false);
    const [notifyChat, setNotifyChat] = useState(policy?.notifyTelegramChatId || "");
    const [feeBps, setFeeBps] = useState(feeConfig ? String(feeConfig.feeBps / 100) : "2");
    const [feeAddr, setFeeAddr] = useState(feeConfig?.feeRecipientAddress || "");
    const [feeMin, setFeeMin] = useState(feeConfig ? nanoToTon(feeConfig.minFeeBountyNano) : "1");
    const [feeEnabled, setFeeEnabled] = useState(feeConfig?.enabled ?? true);
    const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState("");

    useEffect(() => {
        if (policy) { setPerTx(nanoToTon(policy.perTxCapNano)); setDaily(nanoToTon(policy.dailyCapNano)); setMonthly(nanoToTon(policy.monthlyCapNano)); setThreshold(nanoToTon(policy.approvalThresholdNano)); setAllowlist(policy.allowlist.join("\n")); setPaused(policy.paused); setRequireApprovalForAll(policy.requireApprovalForAll ?? false); setNotifyChat(policy.notifyTelegramChatId || ""); }
        if (feeConfig) { setFeeBps(String(feeConfig.feeBps / 100)); setFeeAddr(feeConfig.feeRecipientAddress); setFeeMin(nanoToTon(feeConfig.minFeeBountyNano)); setFeeEnabled(feeConfig.enabled); }
    }, [policy, feeConfig]);

    const handleSave = async () => {
        setSaving(true); setError("");
        const [r1, r2] = await Promise.all([
            onSave({ perTxCapTon: perTx, dailyCapTon: daily, monthlyCapTon: monthly, approvalThresholdTon: threshold, allowlistRaw: allowlist, paused, requireApprovalForAll, notifyTelegramChatId: notifyChat }),
            onSaveFee({ feeBps: Math.round(parseFloat(feeBps || "0") * 100), feeRecipientAddress: feeAddr, minFeeBountyTon: feeMin, enabled: feeEnabled }),
        ]);
        setSaving(false);
        if (r1.error || r2.error) setError(r1.error || r2.error || "Save failed");
        else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Configure spending limits, approvals, and platform fee.</p>
                <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>

            {/* Kill switch */}
            <div className={cn("rounded-lg border p-4 flex items-center justify-between", paused ? "border-red-500/30 bg-red-500/5" : "border-border bg-card")}>
                <div className="flex items-center gap-3">
                    {paused ? <AlertTriangle className="h-5 w-5 text-red-400" /> : <ShieldCheck className="h-5 w-5 text-green-400" />}
                    <div><p className="text-sm font-medium">{paused ? "Treasury Paused" : "Treasury Active"}</p><p className="text-xs text-muted-foreground">{paused ? "All outbound payments blocked (kill switch)" : "Payments allowed within policy limits"}</p></div>
                </div>
                <Button variant="outline" size="sm" className={paused ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"} onClick={() => setPaused(!paused)}>
                    {paused ? <><Play className="h-3.5 w-3.5 mr-1.5" />Resume</> : <><Pause className="h-3.5 w-3.5 mr-1.5" />Pause</>}
                </Button>
            </div>

            {/* Spending limits */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <p className="text-sm font-medium flex items-center gap-2"><Shield className="h-4 w-4 text-purple-400" />Spending Limits</p>
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: "Per-tx cap (TON)", value: perTx, onChange: setPerTx, help: "0 = no cap" },
                        { label: "Daily cap (TON)", value: daily, onChange: setDaily, help: "0 = no cap" },
                        { label: "Monthly cap (TON)", value: monthly, onChange: setMonthly, help: "0 = no cap" },
                        { label: "Approval threshold (TON)", value: threshold, onChange: setThreshold, help: "Payments above this require approval. 0 = always" },
                    ].map((f) => (
                        <div key={f.label}><label className="text-xs text-muted-foreground mb-1 block">{f.label}</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.1" value={f.value} onChange={(e) => f.onChange(e.target.value)} /><p className="text-xs text-muted-foreground mt-0.5">{f.help}</p></div>
                    ))}
                </div>
                <div><label className="text-xs text-muted-foreground mb-1 block">Destination Allowlist (one address per line, blank = allow all)</label><textarea className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs font-mono h-20 resize-none" placeholder={"EQD...\nEQA..."} value={allowlist} onChange={(e) => setAllowlist(e.target.value)} /></div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.008 9.461c-.147.666-.54.829-1.093.516l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 14.607l-2.96-.924c-.643-.204-.657-.643.136-.953l11.56-4.457c.538-.194 1.009.131.836.975z"/></svg>
                        Telegram Notification Chat ID
                    </label>
                    <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono" placeholder="-1001234567890 or @channelname" value={notifyChat} onChange={(e) => setNotifyChat(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-0.5">Receives a message when a payment requires approval. Leave blank to disable.</p>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" className="h-4 w-4 rounded border-border accent-purple-500" checked={requireApprovalForAll} onChange={(e) => setRequireApprovalForAll(e.target.checked)} />
                    <span className="text-sm">Require approval for all payments</span>
                    <span className="text-xs text-muted-foreground">(ignores threshold — every payment needs manual approval)</span>
                </label>
            </div>

            {/* Platform fee */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-2"><Percent className="h-4 w-4 text-green-400" />Platform Fee</p>
                    <button onClick={() => setFeeEnabled(!feeEnabled)} className={cn("text-xs px-2 py-0.5 rounded-full border", feeEnabled ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-border text-muted-foreground")}>
                        {feeEnabled ? "Enabled" : "Disabled"}
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div><label className="text-xs text-muted-foreground mb-1 block">Fee % (max 10%)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" max="10" step="0.1" value={feeBps} onChange={(e) => setFeeBps(e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Min bounty size (TON)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.1" value={feeMin} onChange={(e) => setFeeMin(e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Fee recipient address</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono" placeholder="EQD..." value={feeAddr} onChange={(e) => setFeeAddr(e.target.value)} /></div>
                </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : saved ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" /> : <Shield className="h-3.5 w-3.5 mr-1.5" />}
                    {saved ? "Saved" : "Save All"}
                </Button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Audit Panel
// ═══════════════════════════════════════════════════════════════

function AuditPanel({ entries, onRefresh }: { entries: TonAuditEntry[]; onRefresh: () => void }) {
    const icons: Record<string, { icon: typeof Send; color: string }> = {
        wallet_connected: { icon: Wallet, color: "text-blue-400" }, wallet_verified: { icon: ShieldCheck, color: "text-green-400" },
        wallet_status_changed: { icon: Wallet, color: "text-yellow-400" },
        payment_created: { icon: Plus, color: "text-blue-400" }, payment_approved: { icon: CheckCircle2, color: "text-green-400" },
        payment_rejected: { icon: XCircle, color: "text-red-400" }, payment_executed: { icon: Send, color: "text-purple-400" },
        payment_blocked: { icon: Ban, color: "text-red-500" }, subscription_created: { icon: RefreshCw, color: "text-green-400" },
        subscription_cancelled: { icon: Trash2, color: "text-red-400" }, policy_updated: { icon: Shield, color: "text-purple-400" },
        policy_paused: { icon: Pause, color: "text-yellow-400" }, policy_resumed: { icon: Play, color: "text-green-400" },
        bounty_posted: { icon: Plus, color: "text-blue-400" }, bounty_claimed: { icon: CheckCircle2, color: "text-yellow-400" },
        bounty_submitted: { icon: Send, color: "text-blue-400" }, bounty_approved: { icon: CheckCircle2, color: "text-green-400" },
        bounty_rejected: { icon: XCircle, color: "text-red-400" }, bounty_cancelled: { icon: Trash2, color: "text-red-400" },
        bounty_released: { icon: Send, color: "text-purple-400" },
        notification_failed: { icon: AlertTriangle, color: "text-orange-400" },
    };
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{entries.length} events</p>
                <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
            {entries.length === 0 ? <EmptyState label="No audit events yet" /> : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {entries.map((e) => {
                        const cfg = icons[e.event] || { icon: FileText, color: "text-muted-foreground" };
                        return (
                            <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                                <cfg.icon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.color)} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-medium capitalize">{e.event.replace(/_/g, " ")}</span>
                                        {e.amountNano && <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full font-mono">{nanoToTon(e.amountNano)} TON</span>}
                                        {e.txHash && <a href={`${TON_EXPLORER}${e.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-0.5"><ExternalLink className="h-3 w-3" />{e.txHash.slice(0, 8)}…</a>}
                                    </div>
                                    {e.note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.note}</p>}
                                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                                        <span>{fmtDate(e.createdAt)}</span>
                                        {e.reviewedBy && <span>by {shortAddr(e.reviewedBy)}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Prank Panel
// ═══════════════════════════════════════════════════════════════

type PrankMessage = { type: "text" | "image" | "voice"; content: string; imageUrl?: string; delay?: number };
type PrankResult = { messages: PrankMessage[]; summary: string; sendStatus?: Record<number, "pending" | "sent" | "failed"> };

function PrankPanel({ orgId, wallet }: { orgId: string | undefined; wallet: string | null | undefined }) {
    const [friendName, setFriendName] = useState("");
    const [telegramUsername, setTelegramUsername] = useState("");
    const [persona, setPersona] = useState("");
    const [prompt, setPrompt] = useState("");
    const [useTexts, setUseTexts] = useState(true);
    const [useImages, setUseImages] = useState(true);
    const [useVoice, setUseVoice] = useState(true);
    const [intensity, setIntensity] = useState<"light" | "medium" | "chaotic">("medium");
    const [generating, setGenerating] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<PrankResult | null>(null);
    const [error, setError] = useState("");
    const [botToken, setBotToken] = useState("");

    const handleGenerate = async () => {
        if (!friendName || !prompt) { setError("Friend name and prank idea are required"); return; }
        setError("");
        setGenerating(true);
        setResult(null);
        try {
            const res = await fetch("/api/v1/ton/prank", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-wallet-address": wallet || "" },
                body: JSON.stringify({ orgId, friendName, persona, prompt, useTexts, useImages, useVoice, intensity }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Generation failed"); return; }
            setResult({ messages: data.messages, summary: data.summary, sendStatus: {} });
        } catch {
            setError("Failed to generate prank");
        } finally {
            setGenerating(false);
        }
    };

    const handleSend = async () => {
        if (!result || !botToken || !telegramUsername) { setError("Bot token and Telegram username required to send"); return; }
        setError("");
        setSending(true);
        try {
            const res = await fetch("/api/v1/ton/prank", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "x-wallet-address": wallet || "" },
                body: JSON.stringify({ messages: result.messages, telegramUsername, botToken }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Send failed"); return; }
            setResult((r) => r ? { ...r, sendStatus: data.sendStatus } : r);
        } catch {
            setError("Failed to send prank");
        } finally {
            setSending(false);
        }
    };

    const msgIcon = (type: PrankMessage["type"]) => {
        if (type === "image") return <Image className="h-3.5 w-3.5 text-purple-400 shrink-0" />;
        if (type === "voice") return <Mic className="h-3.5 w-3.5 text-green-400 shrink-0" />;
        return <MessageSquare className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
    };

    const msgBg = (type: PrankMessage["type"]) => {
        if (type === "image") return "bg-purple-500/5 border-purple-500/20";
        if (type === "voice") return "bg-green-500/5 border-green-500/20";
        return "bg-blue-500/5 border-blue-500/20";
    };

    return (
        <div className="space-y-4">
            {/* Config card */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Ghost className="h-5 w-5 text-orange-400" />
                    <h2 className="text-sm font-semibold">Configure Prank</h2>
                    <span className="ml-auto text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/20">OpenClaw</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Friend&apos;s Name *</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Alex" value={friendName} onChange={(e) => setFriendName(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Agent Persona Name</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Sam (leave blank to auto-pick)" value={persona} onChange={(e) => setPersona(e.target.value)} />
                    </div>
                </div>

                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Prank Scenario *</label>
                    <textarea
                        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm h-20 resize-none"
                        placeholder="e.g. Pretend to be a long-lost friend who just moved back to town and wants to meet up urgently. Act totally normal but keep escalating until they're confused."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-muted-foreground">Media:</span>
                    {([
                        { key: "texts", label: "Texts", icon: MessageSquare, value: useTexts, set: setUseTexts },
                        { key: "images", label: "AI Photos", icon: Image, value: useImages, set: setUseImages },
                        { key: "voice", label: "Voice Notes", icon: Mic, value: useVoice, set: setUseVoice },
                    ] as const).map((m) => (
                        <button
                            key={m.key}
                            onClick={() => m.set(!m.value)}
                            className={cn(
                                "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all",
                                m.value ? "bg-foreground/10 border-border text-foreground" : "border-border/50 text-muted-foreground"
                            )}
                        >
                            <m.icon className="h-3 w-3" />{m.label}
                        </button>
                    ))}

                    <span className="text-xs text-muted-foreground ml-2">Intensity:</span>
                    {(["light", "medium", "chaotic"] as const).map((lvl) => (
                        <button
                            key={lvl}
                            onClick={() => setIntensity(lvl)}
                            className={cn(
                                "text-xs px-2.5 py-1 rounded-full border capitalize transition-all",
                                intensity === lvl
                                    ? lvl === "chaotic" ? "bg-red-500/10 border-red-500/30 text-red-400"
                                        : lvl === "medium" ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
                                            : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                    : "border-border/50 text-muted-foreground"
                            )}
                        >
                            {lvl}
                        </button>
                    ))}
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}

                <Button onClick={handleGenerate} disabled={generating} size="sm">
                    {generating
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Generating…</>
                        : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Prank</>}
                </Button>
            </div>

            {/* Result preview */}
            {result && (
                <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold flex items-center gap-2"><Ghost className="h-4 w-4 text-orange-400" />Prank Preview</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{result.summary}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{result.messages.length} messages</span>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {result.messages.map((m, i) => (
                            <div key={i} className={cn("rounded-lg border px-3 py-2.5 flex items-start gap-2", msgBg(m.type))}>
                                {msgIcon(m.type)}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-medium capitalize text-muted-foreground">{m.type}</span>
                                        {m.delay && <span className="text-xs text-muted-foreground">+{m.delay}s delay</span>}
                                        {result.sendStatus?.[i] && (
                                            <span className={cn("text-xs ml-auto", result.sendStatus[i] === "sent" ? "text-green-400" : result.sendStatus[i] === "failed" ? "text-red-400" : "text-muted-foreground")}>
                                                {result.sendStatus[i]}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs leading-relaxed">{m.content}</p>
                                    {m.imageUrl && <img src={m.imageUrl} alt="AI generated" className="mt-2 rounded-md max-h-40 object-cover" />}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Send via Telegram */}
                    <div className="border-t border-border pt-4 space-y-3">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.008 9.461c-.147.666-.54.829-1.093.516l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 14.607l-2.96-.924c-.643-.204-.657-.643.136-.953l11.56-4.457c.538-.194 1.009.131.836.975z"/></svg>
                            Send via Telegram Bot (optional)
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Friend&apos;s Telegram Username</label>
                                <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="@username or chat_id" value={telegramUsername} onChange={(e) => setTelegramUsername(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Bot Token</label>
                                <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono" type="password" placeholder="1234567890:AAF..." value={botToken} onChange={(e) => setBotToken(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={handleSend} disabled={sending || !botToken || !telegramUsername} size="sm" variant="outline">
                            {sending
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending…</>
                                : <><Send className="h-3.5 w-3.5 mr-1.5" />Send Prank</>}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════

export default function TonModPage() {
    const { currentOrg: org } = useOrg();
    const { address: wallet } = useSession();
    const orgId = org?.id;

    const [tab, setTab] = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const [connectedWallets, setConnectedWallets] = useState<{ id: string; address: string; verified: boolean }[]>([]);
    const [balance, setBalance] = useState<{ balanceTon: string } | null>(null);
    const [payments, setPayments] = useState<TonPayment[]>([]);
    const [bounties, setBounties] = useState<TonBounty[]>([]);
    const [subscriptions, setSubscriptions] = useState<TonSubscription[]>([]);
    const [agentWallets, setAgentWallets] = useState<TonAgentWallet[]>([]);
    const [policy, setPolicy] = useState<(TonPolicy & { configured?: boolean }) | null>(null);
    const [feeConfig, setFeeConfig] = useState<TonFeeConfig | null>(null);
    const [auditEntries, setAuditEntries] = useState<TonAuditEntry[]>([]);

    const [showSend, setShowSend] = useState(false);
    const [showBounty, setShowBounty] = useState(false);
    const [showSub, setShowSub] = useState(false);
    const [showGenWallet, setShowGenWallet] = useState(false);

    const hdrs = useCallback(() => ({ "x-wallet-address": wallet || "" }), [wallet]);

    const fetchAll = useCallback(async () => {
        if (!orgId) return;
        const [w, p, b, s, aw, pol, fees, a] = await Promise.allSettled([
            fetch(`/api/v1/ton/connect?orgId=${orgId}`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
            fetch(`/api/v1/ton/payments?orgId=${orgId}`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
            fetch(`/api/v1/ton/bounties?orgId=${orgId}`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
            fetch(`/api/v1/ton/subscriptions?orgId=${orgId}`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
            fetch(`/api/v1/ton/agent-wallets?orgId=${orgId}`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
            fetch(`/api/v1/ton/policies?orgId=${orgId}`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
            fetch(`/api/v1/ton/fees?orgId=${orgId}`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
            fetch(`/api/v1/ton/audit?orgId=${orgId}&limit=100`, { headers: hdrs() }).then((r) => r.ok ? r.json() : null),
        ]);

        const walletData = w.status === "fulfilled" ? w.value : null;
        const walletList = walletData?.wallets || [];
        setConnectedWallets(walletList);

        const primary = walletList.find((x: { verified: boolean }) => x.verified) || walletList[0];
        if (primary?.address) {
            fetch(`/api/v1/ton/balance?address=${encodeURIComponent(primary.address)}`).then((r) => r.ok ? r.json() : null).then((d) => d && setBalance(d));
        }

        if (p.status === "fulfilled" && p.value) setPayments(p.value.payments || []);
        if (b.status === "fulfilled" && b.value) setBounties(b.value.bounties || []);
        if (s.status === "fulfilled" && s.value) setSubscriptions(s.value.subscriptions || []);
        if (aw.status === "fulfilled" && aw.value) setAgentWallets(aw.value.wallets || []);
        if (pol.status === "fulfilled" && pol.value) setPolicy(pol.value.policy || null);
        if (fees.status === "fulfilled" && fees.value) setFeeConfig(fees.value.feeConfig || null);
        if (a.status === "fulfilled" && a.value) setAuditEntries(a.value.entries || []);
    }, [orgId, hdrs]);

    useEffect(() => {
        if (!orgId) return;
        setLoading(true);
        fetchAll().finally(() => setLoading(false));
    }, [orgId, fetchAll]);

    const handleConnectWallet = async () => {
        if (!orgId || !wallet) return;
        await fetch("/api/v1/ton/connect", { method: "POST", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, address: wallet, walletName: "Swarm Session" }) });
        fetchAll();
    };

    const handleSendPayment = async (d: { fromAddress: string; toAddress: string; amountTon: string; memo: string }) => {
        if (!orgId || !wallet) return { error: "Not connected" };
        // Resolve .ton DNS if needed
        let toAddress = d.toAddress;
        if (d.toAddress.endsWith(".ton") || (!d.toAddress.startsWith("0:") && !d.toAddress.startsWith("EQ") && !d.toAddress.startsWith("UQ"))) {
            const r = await fetch(`/api/v1/ton/resolve?name=${encodeURIComponent(d.toAddress)}`).then((x) => x.json());
            if (!r.resolved) return { error: `Could not resolve "${d.toAddress}"` };
            toAddress = r.address;
        }
        const res = await fetch("/api/v1/ton/payments", { method: "POST", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, fromAddress: d.fromAddress, toAddress, amountNano: tonToNano(d.amountTon), memo: d.memo, createdBy: wallet }) });
        const result = await res.json();
        if (res.ok) { fetchAll(); return {}; }
        return { error: result.error || "Failed" };
    };

    const handleApprove = async (p: TonPayment) => {
        if (!orgId || !wallet) return;
        setActionLoading(`approve-${p.id}`);
        await fetch(`/api/v1/ton/payments/${p.id}`, { method: "PATCH", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, action: "approve", reviewedBy: wallet, fromAddress: p.fromAddress, toAddress: p.toAddress, amountNano: p.amountNano }) });
        await fetchAll();
        setActionLoading(null);
    };

    const handleReject = async (p: TonPayment) => {
        if (!orgId || !wallet) return;
        setActionLoading(`reject-${p.id}`);
        await fetch(`/api/v1/ton/payments/${p.id}`, { method: "PATCH", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, action: "reject", reviewedBy: wallet, fromAddress: p.fromAddress, toAddress: p.toAddress, amountNano: p.amountNano }) });
        await fetchAll();
        setActionLoading(null);
    };

    const handleSubAction = async (id: string, status: "paused" | "active" | "cancelled") => {
        if (!orgId || !wallet) return;
        setActionLoading(`${status}-${id}`);
        await fetch("/api/v1/ton/subscriptions", { method: "PATCH", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ id, orgId, status, updatedBy: wallet }) });
        await fetchAll();
        setActionLoading(null);
    };

    const handleCreateSub = async (d: { fromAddress: string; toAddress: string; amountTon: string; memo: string; frequency: string; maxCycles: string }) => {
        if (!orgId || !wallet) return { error: "Not connected" };
        const res = await fetch("/api/v1/ton/subscriptions", { method: "POST", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, ...d, amountNano: tonToNano(d.amountTon), maxCycles: d.maxCycles ? parseInt(d.maxCycles, 10) : null, createdBy: wallet }) });
        const result = await res.json();
        if (res.ok) { fetchAll(); return {}; }
        return { error: result.error || "Failed" };
    };

    const handlePostBounty = async (d: { title: string; description: string; amountTon: string; funderAddress: string; tags: string }) => {
        if (!orgId || !wallet) return { error: "Not connected" };
        const res = await fetch("/api/v1/ton/bounties", { method: "POST", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, title: d.title, description: d.description, amountNano: tonToNano(d.amountTon), funderAddress: d.funderAddress, tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean), postedBy: wallet }) });
        const result = await res.json();
        if (res.ok) { fetchAll(); return {}; }
        return { error: result.error || "Failed" };
    };

    const handleBountyAction = async (id: string, action: string, extra: Record<string, string> = {}) => {
        if (!orgId) return;
        setActionLoading(`${action}-${id}`);
        await fetch(`/api/v1/ton/bounties/${id}`, { method: "PATCH", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, action, ...extra }) });
        await fetchAll();
        setActionLoading(null);
    };

    const handleGenerateWallet = async (d: { label: string; network: string }) => {
        if (!orgId || !wallet) return { error: "Not connected" };
        const res = await fetch("/api/v1/ton/agent-wallets", { method: "POST", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, label: d.label, network: d.network, createdBy: wallet }) });
        const result = await res.json();
        if (res.ok) { fetchAll(); return { privateKeyHex: result.privateKeyHex }; }
        return { error: result.error || "Failed" };
    };

    const handleAgentWalletAction = async (id: string, status: "active" | "frozen" | "retired") => {
        if (!orgId || !wallet) return;
        setActionLoading(`wallet-${id}`);
        await fetch("/api/v1/ton/agent-wallets", { method: "PATCH", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ id, orgId, status, updatedBy: wallet }) });
        await fetchAll();
        setActionLoading(null);
    };

    const handleSavePolicy = async (d: { perTxCapTon: string; dailyCapTon: string; monthlyCapTon: string; approvalThresholdTon: string; allowlistRaw: string; paused: boolean; requireApprovalForAll: boolean; notifyTelegramChatId: string }) => {
        if (!orgId || !wallet) return { error: "Not connected" };
        const res = await fetch("/api/v1/ton/policies", { method: "POST", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, perTxCapNano: tonToNano(d.perTxCapTon || "0"), dailyCapNano: tonToNano(d.dailyCapTon || "0"), monthlyCapNano: tonToNano(d.monthlyCapTon || "0"), approvalThresholdNano: tonToNano(d.approvalThresholdTon || "0"), allowlist: d.allowlistRaw.split("\n").map((s) => s.trim()).filter(Boolean), paused: d.paused, requireApprovalForAll: d.requireApprovalForAll, notifyTelegramChatId: d.notifyTelegramChatId || null, updatedBy: wallet }) });
        const result = await res.json();
        if (res.ok) { fetchAll(); return {}; }
        return { error: result.error || "Failed" };
    };

    const handleSaveFee = async (d: { feeBps: number; feeRecipientAddress: string; minFeeBountyTon: string; enabled: boolean }) => {
        if (!orgId || !wallet) return { error: "Not connected" };
        const res = await fetch("/api/v1/ton/fees", { method: "POST", headers: { ...hdrs(), "Content-Type": "application/json" }, body: JSON.stringify({ orgId, feeBps: d.feeBps, feeRecipientAddress: d.feeRecipientAddress, minFeeBountyNano: tonToNano(d.minFeeBountyTon || "1"), enabled: d.enabled, updatedBy: wallet }) });
        const result = await res.json();
        if (res.ok) { fetchAll(); return {}; }
        return { error: result.error || "Failed" };
    };

    const pendingCount = payments.filter((p) => p.status === "pending_approval").length;
    const primaryWallet = connectedWallets.find((w) => w.verified) || connectedWallets[0];
    const allWallets = [...connectedWallets, ...agentWallets.filter((aw) => aw.status === "active").map((aw) => ({ address: aw.address, verified: false }))];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20"><span className="text-xl">💎</span></div>
                    <div>
                        <h1 className="text-xl font-semibold">TON Treasury</h1>
                        <p className="text-sm text-muted-foreground">Telegram-native payments, bounties, agent wallets, and spending controls on TON</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleConnectWallet}><Wallet className="h-4 w-4 mr-1.5" />Connect Wallet</Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit border border-border overflow-x-auto max-w-full">
                {TABS.map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap",
                            tab === t.id ? "bg-background text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground")}>
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                        {t.id === "payments" && pendingCount > 0 && <span className="ml-1 text-xs bg-yellow-500/20 text-yellow-400 px-1.5 rounded-full">{pendingCount}</span>}
                        {t.id === "bounties" && bounties.filter((b) => b.status === "submitted").length > 0 && <span className="ml-1 text-xs bg-purple-500/20 text-purple-400 px-1.5 rounded-full">{bounties.filter((b) => b.status === "submitted").length}</span>}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
                <>
                    {tab === "overview" && <OverviewPanel wallets={connectedWallets} payments={payments} subscriptions={subscriptions} bounties={bounties} balance={balance} policy={policy} feeConfig={feeConfig} onConnect={handleConnectWallet} onSend={() => setShowSend(true)} />}
                    {tab === "payments" && <PaymentsPanel payments={payments} actionLoading={actionLoading} onApprove={handleApprove} onReject={handleReject} onSend={() => setShowSend(true)} onRefresh={fetchAll} />}
                    {tab === "bounties" && <BountiesPanel bounties={bounties} actionLoading={actionLoading} wallet={wallet} feeConfig={feeConfig} onPost={() => setShowBounty(true)} onAction={handleBountyAction} onRefresh={fetchAll} />}
                    {tab === "subscriptions" && <SubsPanel subs={subscriptions} actionLoading={actionLoading} onPause={(id) => handleSubAction(id, "paused")} onResume={(id) => handleSubAction(id, "active")} onCancel={(id) => handleSubAction(id, "cancelled")} onCreate={() => setShowSub(true)} onRefresh={fetchAll} />}
                    {tab === "history" && <HistoryPanel address={primaryWallet?.address || null} network="mainnet" />}
                    {tab === "analytics" && <AnalyticsPanel payments={payments} bounties={bounties} subscriptions={subscriptions} feeConfig={feeConfig} />}
                    {tab === "agent-wallets" && <AgentWalletsPanel agentWallets={agentWallets} actionLoading={actionLoading} onGenerate={() => setShowGenWallet(true)} onAction={handleAgentWalletAction} onRefresh={fetchAll} />}
                    {tab === "policy" && <PolicyPanel policy={policy} feeConfig={feeConfig} onSave={handleSavePolicy} onSaveFee={handleSaveFee} onRefresh={fetchAll} />}
                    {tab === "audit" && <AuditPanel entries={auditEntries} onRefresh={fetchAll} />}
                    {tab === "prank" && <PrankPanel orgId={orgId} wallet={wallet} />}
                </>
            )}

            <SendPaymentDialog open={showSend} onClose={() => setShowSend(false)} wallets={allWallets.length > 0 ? allWallets : [{ address: wallet || "" }]} onSend={handleSendPayment} />
            <PostBountyDialog open={showBounty} onClose={() => setShowBounty(false)} wallets={allWallets.length > 0 ? allWallets : [{ address: wallet || "" }]} onPost={handlePostBounty} />
            <CreateSubDialog open={showSub} onClose={() => setShowSub(false)} wallets={allWallets.length > 0 ? allWallets : [{ address: wallet || "" }]} onCreate={handleCreateSub} />
            <GenerateWalletDialog open={showGenWallet} onClose={() => setShowGenWallet(false)} onCreate={handleGenerateWallet} />
        </div>
    );
}
