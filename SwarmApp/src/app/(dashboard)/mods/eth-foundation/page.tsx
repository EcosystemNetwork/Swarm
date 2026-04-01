"use client";

/**
 * Ethereum Foundation Mod Dashboard
 *
 * Community & Network Public Goods on Ethereum — secp256k1 wallets, ETH payments,
 * bounties (ESP categories), staking, agent wallets, contract deploy (Solidity),
 * spending policy, audit log, public goods tracking, governance proposals.
 */

import { useState, useEffect, useCallback } from "react";
import {
    Wallet, Send, RefreshCw, Shield, FileText, LayoutDashboard,
    ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Ban, ExternalLink,
    Plus, Pause, Play, Copy, Check, Trophy, History, BarChart3,
    KeyRound, TrendingUp, Fingerprint, Loader2,
    Rocket, Coins as CoinsIcon, Globe, Vote, Heart,
    type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOrg } from "@/contexts/OrgContext";
import { useSession } from "@/contexts/SessionContext";
import {
    weiToEth, ethToWei,
    type EthPolicy, type EthPayment, type EthSubscription, type EthAuditEntry,
    type EthPaymentStatus,
} from "@/lib/eth-foundation-policy";
import type { EthBounty, EthFeeConfig, EthBountyCategory } from "@/lib/eth-foundation-bounty";

// ═══════════════════════════════════════════════════════════════
// Types for ETH-specific data
// ═══════════════════════════════════════════════════════════════

interface EthAgentWallet {
    id: string;
    orgId: string;
    label: string;
    address: string;
    network: string;
    status: "active" | "frozen" | "archived";
    createdAt: unknown;
    createdBy: string;
    ensName?: string;
}

interface EthDeployment {
    id: string;
    orgId: string;
    name: string;
    type: string;
    status: "pending" | "deploying" | "deployed" | "failed";
    contractAddress?: string;
    network: string;
    createdAt: unknown;
}

interface PublicGood {
    id: string;
    type: string;
    repo: string;
    description: string;
    impactScore: number;
    createdAt: unknown;
}

interface GovernanceProposal {
    id: string;
    title: string;
    status: "active" | "passed" | "rejected" | "pending";
    votesFor: number;
    votesAgainst: number;
    createdAt: unknown;
    endsAt: unknown;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

type Tab = "overview" | "payments" | "bounties" | "erc8004" | "reputation" | "public-goods" | "governance" | "staking" | "swap" | "bridge" | "history" | "analytics" | "agent-wallets" | "deploy" | "policy" | "audit";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "overview",       label: "Overview",        icon: LayoutDashboard },
    { id: "payments",       label: "Payments",        icon: Send },
    { id: "bounties",       label: "Bounties",        icon: Trophy },
    { id: "erc8004",        label: "ERC-8004",        icon: Fingerprint },
    { id: "reputation",     label: "Reputation",      icon: ShieldCheck },
    { id: "public-goods",   label: "Public Goods",    icon: Heart },
    { id: "governance",     label: "Governance",      icon: Vote },
    { id: "staking",        label: "Staking",         icon: TrendingUp },
    { id: "swap",           label: "Swap",            icon: RefreshCw },
    { id: "bridge",         label: "Bridge",          icon: ExternalLink },
    { id: "history",        label: "History",         icon: History },
    { id: "analytics",      label: "Analytics",       icon: BarChart3 },
    { id: "agent-wallets",  label: "Agent Wallets",   icon: KeyRound },
    { id: "deploy",         label: "Deploy",          icon: Rocket },
    { id: "policy",         label: "Policy",          icon: Shield },
    { id: "audit",          label: "Audit",           icon: FileText },
];

const PAYMENT_STATUS: Record<EthPaymentStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
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

const ESP_CATEGORIES: { value: EthBountyCategory; label: string }[] = [
    { value: "public-goods", label: "Public Goods" },
    { value: "tooling", label: "Tooling" },
    { value: "research", label: "Research" },
    { value: "community", label: "Community" },
    { value: "governance", label: "Governance" },
    { value: "infrastructure", label: "Infrastructure" },
    { value: "education", label: "Education" },
    { value: "general", label: "General" },
];

const DEPLOY_TYPE_LABELS: Record<string, string> = {
    erc20: "ERC-20 Token",
    erc721: "ERC-721 NFT",
    erc1155: "ERC-1155 Multi",
    custom: "Custom Contract",
    proxy: "Proxy (UUPS)",
    governor: "Governor",
};

const DEPLOY_STATUS_META: Record<string, { label: string; color: string }> = {
    pending:   { label: "Pending",   color: "text-yellow-400" },
    deploying: { label: "Deploying", color: "text-purple-400" },
    deployed:  { label: "Deployed",  color: "text-green-400" },
    failed:    { label: "Failed",    color: "text-red-400" },
};

const GOVERNANCE_STATUS_COLOR: Record<string, string> = {
    active: "text-blue-400", passed: "text-green-400", rejected: "text-red-400", pending: "text-yellow-400",
};

const ETH_EXPLORERS: Record<string, string> = {
    mainnet: "https://etherscan.io/tx/",
    sepolia: "https://sepolia.etherscan.io/tx/",
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
    wallets: EthAgentWallet[];
    onSend: (d: { fromAddress: string; toAddress: string; amountEth: string; memo: string }) => Promise<{ error?: string }>;
}) {
    const [from, setFrom] = useState(wallets[0]?.address || "");
    const [to, setTo] = useState(""); const [amount, setAmount] = useState(""); const [memo, setMemo] = useState("");
    const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [sim, setSim] = useState<{ allowed: boolean; requiresApproval: boolean; reason: string } | null>(null);
    const [ensResolved, setEnsResolved] = useState<string | null>(null);

    const simulate = useCallback(async () => {
        if (!to || !amount || isNaN(parseFloat(amount))) { setSim(null); return; }
        try {
            const res = await fetch("/api/v1/eth-foundation/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: "", toAddress: to, amount: ethToWei(amount) }) });
            if (res.ok) setSim(await res.json());
        } catch { /* silent */ }
    }, [to, amount]);

    const resolveEns = useCallback(async () => {
        if (!to || !to.endsWith(".eth")) { setEnsResolved(null); return; }
        try {
            const res = await fetch(`/api/v1/eth-foundation/ens-resolve?name=${encodeURIComponent(to)}`);
            if (res.ok) { const data = await res.json(); setEnsResolved(data.address || null); }
        } catch { /* silent */ }
    }, [to]);

    useEffect(() => { if (open) { simulate(); resolveEns(); } }, [open, simulate, resolveEns]);

    if (!open) return null;
    const handleSend = async () => {
        setError("");
        if (!from || !to || !amount) { setError("All fields required"); return; }
        setLoading(true);
        const r = await onSend({ fromAddress: from, toAddress: ensResolved || to, amountEth: amount, memo });
        setLoading(false);
        if (r.error) setError(r.error); else onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><Send className="h-5 w-5 text-indigo-400" /><h2 className="text-lg font-semibold">Send ETH</h2></div>
                <div className="space-y-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">From</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)}>
                            {wallets.map((w) => <option key={w.address} value={w.address}>{w.label} ({shortAddr(w.address)}){w.ensName ? ` — ${w.ensName}` : ""}</option>)}
                        </select></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">To (Ethereum address or ENS name)</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono" placeholder="0x1234…abcd or vitalik.eth" value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => { simulate(); resolveEns(); }} />
                        {ensResolved && <p className="text-[10px] text-indigo-400 mt-0.5 font-mono">Resolved: {shortAddr(ensResolved)}</p>}
                    </div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Amount (ETH)</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={simulate} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Memo</label>
                        <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="ESP grant payment #42" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
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
// Dialog: Post Bounty (with ESP category selector)
// ═══════════════════════════════════════════════════════════════

function PostBountyDialog({ open, onClose, wallets, onPost }: {
    open: boolean; onClose: () => void;
    wallets: EthAgentWallet[];
    onPost: (d: { title: string; description: string; amountEth: string; funderAddress: string; tags: string; category: EthBountyCategory }) => Promise<{ error?: string }>;
}) {
    const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [funder, setFunder] = useState(wallets[0]?.address || ""); const [tags, setTags] = useState(""); const [category, setCategory] = useState<EthBountyCategory>("general"); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
    if (!open) return null;
    const handle = async () => {
        setError(""); if (!title || !amount) { setError("Title and amount required"); return; }
        setLoading(true);
        const r = await onPost({ title, description: desc, amountEth: amount, funderAddress: funder, tags, category });
        setLoading(false);
        if (r.error) setError(r.error); else onClose();
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-yellow-400" /><h2 className="text-lg font-semibold">Post Bounty</h2></div>
                <div className="space-y-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">Task Title</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Build Ethereum public goods dashboard" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Description</label><textarea className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm h-20 resize-none" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">ESP Category</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as EthBountyCategory)}>
                            {ESP_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Amount (ETH)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Tags (comma-sep)</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="defi,public-goods" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
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
// Dialog: Generate Agent Wallet (secp256k1)
// ═══════════════════════════════════════════════════════════════

function GenerateWalletDialog({ open, onClose, onCreate }: {
    open: boolean; onClose: () => void;
    onCreate: (d: { label: string; network: string }) => Promise<{ privateKeyHex?: string; address?: string; error?: string }>;
}) {
    const [label, setLabel] = useState(""); const [network, setNetwork] = useState("sepolia"); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<{ address: string; privateKeyHex: string } | null>(null);
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
                <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-indigo-400" /><h2 className="text-lg font-semibold">Generate Ethereum Agent Wallet</h2></div>
                {result ? (
                    <div className="space-y-3">
                        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-400">
                            Wallet generated (secp256k1). <strong>Save the private key below — it will not be shown again.</strong>
                        </div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Ethereum Address</label><p className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-all">{result.address}</p></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Private Key (hex) — save now!</label><p className="font-mono text-xs bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 break-all">{result.privateKeyHex}</p></div>
                        <Button size="sm" className="w-full" onClick={onClose}>Done</Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Label</label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" placeholder="Public Goods Agent #1" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Network</label>
                            <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" value={network} onChange={(e) => setNetwork(e.target.value)}>
                                <option value="sepolia">Sepolia (Testnet)</option><option value="mainnet">Mainnet</option>
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

export default function EthFoundationModPage() {
    const { currentOrg } = useOrg();
    const { address } = useSession();
    const orgId = currentOrg?.id || "";
    const userId = address || "";

    const [activeTab, setActiveTab] = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);

    // Data state
    const [wallets, setWallets] = useState<EthAgentWallet[]>([]);
    const [payments, setPayments] = useState<EthPayment[]>([]);
    const [bounties, setBounties] = useState<EthBounty[]>([]);
    const [subscriptions, setSubscriptions] = useState<EthSubscription[]>([]);
    const [auditEntries, setAuditEntries] = useState<EthAuditEntry[]>([]);
    const [policy, setPolicy] = useState<(EthPolicy & { configured?: boolean }) | null>(null);
    const [deployments, setDeployments] = useState<EthDeployment[]>([]);
    const [balance, setBalance] = useState<{ balanceEth: string } | null>(null);
    const [publicGoods, setPublicGoods] = useState<PublicGood[]>([]);
    const [proposals, setProposals] = useState<GovernanceProposal[]>([]);

    // Dialog state
    const [showSend, setShowSend] = useState(false);
    const [showBounty, setShowBounty] = useState(false);
    const [showGenWallet, setShowGenWallet] = useState(false);

    // Fetch data
    const fetchData = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [walletsRes, paymentsRes, bountiesRes, policyRes, auditRes, deployRes, pgRes, govRes] = await Promise.all([
                fetch(`/api/v1/eth-foundation/agent-wallets?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ wallets: [] })),
                fetch(`/api/v1/eth-foundation/payments?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ payments: [] })),
                fetch(`/api/v1/eth-foundation/bounties?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ bounties: [] })),
                fetch(`/api/v1/eth-foundation/policies?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ policy: null })),
                fetch(`/api/v1/eth-foundation/audit?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ entries: [] })),
                fetch(`/api/v1/eth-foundation/deploy?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ deployments: [] })),
                fetch(`/api/v1/eth-foundation/public-goods?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ contributions: [] })),
                fetch(`/api/v1/eth-foundation/governance?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ proposals: [] })),
            ]);
            setWallets(walletsRes.wallets || []);
            setPayments(paymentsRes.payments || []);
            setBounties(bountiesRes.bounties || []);
            setPolicy(policyRes.policy || null);
            setAuditEntries(auditRes.entries || []);
            setDeployments(deployRes.deployments || []);
            setPublicGoods(pgRes.contributions || []);
            setProposals(govRes.proposals || []);

            // Fetch balance for first wallet
            if (walletsRes.wallets?.length > 0) {
                const w = walletsRes.wallets[0];
                const net = w.network || "sepolia";
                const balRes = await fetch(`/api/v1/eth-foundation/balance?address=${w.address}&network=${net}`).then((r) => r.json()).catch(() => null);
                if (balRes) setBalance({ balanceEth: balRes.balanceEth || "0" });
            }
        } catch (err) {
            console.error("Failed to fetch Ethereum Foundation data:", err);
        }
        setLoading(false);
    }, [orgId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Action handlers
    const handleSend = async (d: { fromAddress: string; toAddress: string; amountEth: string; memo: string }) => {
        const res = await fetch("/api/v1/eth-foundation/payments", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, fromAddress: d.fromAddress, toAddress: d.toAddress, amount: ethToWei(d.amountEth), memo: d.memo, createdBy: userId }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed" };
        await fetchData();
        return {};
    };

    const handlePostBounty = async (d: { title: string; description: string; amountEth: string; funderAddress: string; tags: string; category: EthBountyCategory }) => {
        const res = await fetch("/api/v1/eth-foundation/bounties", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, title: d.title, description: d.description, amount: ethToWei(d.amountEth), funderAddress: d.funderAddress, tags: d.tags ? d.tags.split(",").map((t) => t.trim()) : [], category: d.category, postedBy: userId }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed" };
        await fetchData();
        return {};
    };

    const handleGenWallet = async (d: { label: string; network: string }) => {
        const res = await fetch("/api/v1/eth-foundation/agent-wallets", {
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
    const totalSent = executed.reduce((s, p) => s + parseFloat(weiToEth(p.amount) || "0"), 0);
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
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <CoinsIcon className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Ethereum Foundation</h1>
                        <p className="text-xs text-muted-foreground">Community &amp; Network Public Goods on Ethereum</p>
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
                        <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-violet-500/5 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                        <CoinsIcon className="h-5 w-5 text-indigo-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-sm font-mono">{shortAddr(primary.address)}</p><CopyBtn text={primary.address} />
                                            {primary.ensName && <span className="text-xs text-indigo-400 font-medium">{primary.ensName}</span>}
                                        </div>
                                        <p className="text-2xl font-bold mt-0.5">{balance ? `${balance.balanceEth} ETH` : "—"}</p>
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => setShowSend(true)}><Send className="h-3.5 w-3.5 mr-1.5" />Send</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
                            <Wallet className="h-10 w-10 text-muted-foreground mx-auto" />
                            <p className="text-sm text-muted-foreground">No Ethereum wallet configured</p>
                            <Button size="sm" onClick={() => setShowGenWallet(true)}><KeyRound className="h-3.5 w-3.5 mr-1.5" />Generate Agent Wallet</Button>
                        </div>
                    )}

                    <div className="grid grid-cols-4 gap-3">
                        {[
                            { label: "Payments", value: payments.length, color: "text-blue-400" },
                            { label: "Pending Approval", value: pending, color: pending > 0 ? "text-yellow-400" : "text-muted-foreground" },
                            { label: "Open Bounties", value: openBounties, color: "text-yellow-400" },
                            { label: "Total Sent", value: `${totalSent.toFixed(4)} ETH`, color: "text-indigo-400" },
                        ].map((s) => (
                            <div key={s.label} className="rounded-lg border border-border p-3 bg-card">
                                <p className="text-xs text-muted-foreground">{s.label}</p>
                                <p className={cn("text-lg font-bold mt-0.5", s.color)}>{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Ethereum blockchain info */}
                    <div className="rounded-lg border border-border p-4 bg-card space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-indigo-400" />Ethereum Blockchain</h3>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                            <div><span className="text-muted-foreground">Finality:</span> <span className="font-medium">~12 seconds</span></div>
                            <div><span className="text-muted-foreground">Smart Contracts:</span> <span className="font-medium">Solidity</span></div>
                            <div><span className="text-muted-foreground">Chain ID:</span> <span className="font-medium">1 (mainnet) / 11155111 (Sepolia)</span></div>
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
                                                <td className="px-3 py-2 text-right font-medium">{weiToEth(p.amount)} ETH</td>
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
                                            {(b as any).category && <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">{(b as any).category}</span>}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">{b.description || "No description"}</p>
                                        {b.tags.length > 0 && <div className="flex gap-1 mt-1">{b.tags.map((t) => <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</div>}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-indigo-400">{weiToEth(b.amount)} ETH</p>
                                        <p className="text-[10px] text-muted-foreground">{fmtDate(b.createdAt)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "public-goods" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><Heart className="h-4 w-4 text-violet-400" />Public Goods Contributions ({publicGoods.length})</h3>
                    </div>
                    {publicGoods.length === 0 ? <EmptyState label="No public goods contributions tracked yet" /> : (
                        <div className="grid grid-cols-2 gap-3">
                            {publicGoods.map((pg) => (
                                <div key={pg.id} className="rounded-lg border border-border p-4 bg-card space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-medium bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded">{pg.type}</span>
                                        <span className="text-[10px] text-muted-foreground">{fmtDate(pg.createdAt as Date | null)}</span>
                                    </div>
                                    <p className="text-sm font-medium">{pg.description}</p>
                                    {pg.repo && (
                                        <div className="flex items-center gap-1 text-xs text-indigo-400">
                                            <Globe className="h-3 w-3" />
                                            <span className="font-mono truncate">{pg.repo}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-1 border-t border-border">
                                        <span className="text-xs text-muted-foreground">Impact Score</span>
                                        <span className={cn("text-sm font-bold", pg.impactScore >= 80 ? "text-green-400" : pg.impactScore >= 50 ? "text-yellow-400" : "text-muted-foreground")}>{pg.impactScore}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "governance" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><Vote className="h-4 w-4 text-indigo-400" />Governance Proposals ({proposals.length})</h3>
                    </div>
                    {proposals.length === 0 ? <EmptyState label="No governance proposals yet" /> : (
                        <div className="space-y-2">
                            {proposals.map((p) => {
                                const total = p.votesFor + p.votesAgainst;
                                const forPct = total > 0 ? Math.round((p.votesFor / total) * 100) : 0;
                                return (
                                    <div key={p.id} className="rounded-lg border border-border p-4 bg-card space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium">{p.title}</p>
                                            <span className={cn("text-xs font-medium", GOVERNANCE_STATUS_COLOR[p.status] || "text-muted-foreground")}>{p.status}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-green-400">For: {p.votesFor}</span>
                                                <span className="text-red-400">Against: {p.votesAgainst}</span>
                                            </div>
                                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-green-400 rounded-full" style={{ width: `${forPct}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>Created: {fmtDate(p.createdAt as Date | null)}</span>
                                            <span>Ends: {fmtDate(p.endsAt as Date | null)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "staking" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-indigo-400" />ETH Staking</h3>
                    </div>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <p className="text-xs text-muted-foreground">Stake ETH to secure the Ethereum network via proof of stake and earn staking rewards.</p>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Est. APY</span><p className="text-lg font-bold text-indigo-400">~3.5%</p></div>
                            <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Min Stake (Solo)</span><p className="text-lg font-bold">32 ETH</p></div>
                            <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Withdrawal</span><p className="text-lg font-bold">~1-5 days</p></div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Liquid staking via Lido (stETH) or Rocket Pool (rETH) available for smaller amounts</p>
                    </div>
                </div>
            )}

            {activeTab === "swap" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="h-4 w-4 text-blue-400" />Token Swap (Uniswap)</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <p className="text-xs text-muted-foreground">Swap tokens on Ethereum&apos;s leading DEX. Supports ETH, USDC, USDT, DAI, WETH, and ERC-20 tokens.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs text-muted-foreground mb-1 block">From Token</label>
                                <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                                    <option>ETH</option><option>USDC</option><option>DAI</option><option>USDT</option>
                                </select></div>
                            <div><label className="text-xs text-muted-foreground mb-1 block">To Token</label>
                                <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                                    <option>USDC</option><option>ETH</option><option>DAI</option><option>USDT</option>
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
                    <h3 className="text-sm font-semibold flex items-center gap-2"><ExternalLink className="h-4 w-4 text-violet-400" />Ethereum Bridge</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <p className="text-xs text-muted-foreground">Bridge assets between Ethereum L1 and popular L2s. Move ETH, ERC-20 tokens, and NFTs across chains.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-indigo-500/20 p-3 text-center">
                                <p className="text-xs font-medium text-indigo-400">Ethereum L1</p>
                                <p className="text-sm font-bold text-indigo-400">Mainnet</p>
                                <p className="text-[10px] text-muted-foreground">Chain ID: 1</p>
                            </div>
                            <div className="rounded-lg border border-violet-500/20 p-3 text-center">
                                <p className="text-xs font-medium text-violet-400">Layer 2</p>
                                <p className="text-sm font-bold text-violet-400">Optimism / Arbitrum / Base</p>
                                <p className="text-[10px] text-muted-foreground">Optimistic & ZK rollups</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">All bridge transactions are tracked and contribute to your agent&apos;s cross-chain activity log</p>
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
                                        <p className="text-sm font-bold">{weiToEth(p.amount)} ETH</p>
                                        <p className="text-[10px] text-muted-foreground">{fmtDate(p.executedAt || p.createdAt)}</p>
                                        {p.txHash && (
                                            <a href={`${ETH_EXPLORERS[wallets[0]?.network === "mainnet" ? "mainnet" : "sepolia"]}${p.txHash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-400 hover:underline flex items-center gap-0.5 justify-end">
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
                            <p className="text-2xl font-bold text-indigo-400">{totalSent.toFixed(4)} ETH</p>
                        </div>
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Agent Wallets</p>
                            <p className="text-2xl font-bold text-violet-400">{wallets.length}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Bounties Released</p>
                            <p className="text-2xl font-bold text-yellow-400">{bounties.filter((b) => b.status === "released").length}</p>
                        </div>
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Contracts Deployed</p>
                            <p className="text-2xl font-bold text-violet-400">{deployments.filter((d) => d.status === "deployed").length}</p>
                        </div>
                        <div className="rounded-lg border border-border p-4 bg-card">
                            <p className="text-xs text-muted-foreground">Public Goods</p>
                            <p className="text-2xl font-bold text-violet-400">{publicGoods.length}</p>
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
                                            {w.ensName && <span className="text-xs text-indigo-400 ml-1">{w.ensName}</span>}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{fmtDate(w.createdAt as Date | null)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "deploy" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Contract Deployments ({deployments.length})</h3>
                    {deployments.length === 0 ? <EmptyState label="No deployments yet — deploy ERC-20, ERC-721, ERC-1155, or custom Solidity contracts" /> : (
                        <div className="space-y-2">
                            {deployments.map((d) => {
                                const meta = DEPLOY_STATUS_META[d.status];
                                return (
                                    <div key={d.id} className="rounded-lg border border-border p-3 bg-card flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium">{d.name}</p>
                                                <span className={cn("text-[10px] font-medium", meta?.color)}>{meta?.label}</span>
                                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{DEPLOY_TYPE_LABELS[d.type] || d.type}</span>
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
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-indigo-400" />Spending Policy</h3>
                    <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div><span className="text-muted-foreground">Per-TX Cap:</span> <span className="font-medium">{policy ? weiToEth(policy.perTxCap) : "1.0"} ETH</span></div>
                            <div><span className="text-muted-foreground">Daily Cap:</span> <span className="font-medium">{policy ? weiToEth(policy.dailyCap) : "5.0"} ETH</span></div>
                            <div><span className="text-muted-foreground">Monthly Cap:</span> <span className="font-medium">{policy ? weiToEth(policy.monthlyCap) : "25.0"} ETH</span></div>
                            <div><span className="text-muted-foreground">Approval Threshold:</span> <span className="font-medium">{policy ? weiToEth(policy.approvalThreshold) : "0.5"} ETH</span></div>
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

            {activeTab === "erc8004" && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Fingerprint className="h-5 w-5 text-violet-400" />
                        <h3 className="text-sm font-semibold">ERC-8004 Agent Identity & Trust</h3>
                    </div>

                    {/* Explainer */}
                    <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground space-y-2">
                        <p>ERC-8004 (EIP-8004) provides three on-chain registries for autonomous agent identity:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li><strong className="text-foreground">Agent Registry</strong> — ERC-721 identity tokens with operator wallets and metadata URIs</li>
                            <li><strong className="text-foreground">Reputation Registry</strong> — Composable on-chain trust scores from task completions and peer reviews</li>
                            <li><strong className="text-foreground">Validation Registry</strong> — Third-party attestations of agent capabilities and certifications</li>
                        </ul>
                    </div>

                    {/* Identity Card */}
                    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
                        <h4 className="text-xs font-semibold flex items-center gap-2"><Fingerprint className="h-3.5 w-3.5 text-violet-400" />Agent Identity</h4>
                        <div className="rounded-md border border-dashed border-border p-6 text-center space-y-2">
                            <p className="text-xs text-muted-foreground">No ERC-8004 identity registered yet. Register your agent to enable trust-gated transactions.</p>
                            <Button size="sm" variant="outline"><Fingerprint className="h-3.5 w-3.5 mr-1.5" />Register Agent (ERC-8004)</Button>
                        </div>
                    </div>

                    {/* On-Chain Reputation */}
                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <h4 className="text-xs font-semibold flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-yellow-400" />On-Chain Reputation</h4>
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: "Score", value: "—", sub: "/100" },
                                { label: "Tasks", value: "0" },
                                { label: "Successes", value: "0" },
                                { label: "Disputes", value: "0" },
                            ].map((s) => (
                                <div key={s.label} className="rounded-lg border border-border p-3">
                                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                                    <p className="text-lg font-bold">{s.value}{s.sub && <span className="text-xs text-muted-foreground font-normal">{s.sub}</span>}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Validation Attestations */}
                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <h4 className="text-xs font-semibold flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-green-400" />Validation Attestations</h4>
                        <EmptyState label="No capability validations yet — validators attest to agent skills and certifications" />
                    </div>

                    {/* DevSpot Manifest */}
                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <h4 className="text-xs font-semibold flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-blue-400" />Agent Manifest (agent.json)</h4>
                        <div className="rounded-md bg-muted/50 p-3 font-mono text-[10px] whitespace-pre overflow-x-auto">{`{
  "name": "...",
  "operatorWallet": "0x...",
  "erc8004TokenId": null,
  "supportedTools": ["code_gen", "github", "blockchain_tx"],
  "taskCategories": ["defi", "public-goods", "governance"],
  "computeConstraints": { "maxCostUsd": 5.0 }
}`}</div>
                    </div>

                    {/* Bounty Tracks */}
                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <h4 className="text-xs font-semibold">Hackathon Bounty Tracks</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
                                <p className="text-xs font-semibold text-violet-400 mb-1">Agent Only: Let the Agent Cook</p>
                                <p className="text-[10px] text-muted-foreground">$4,000 — Fully autonomous agents that discover, plan, execute, and submit without human intervention. ERC-8004 identity required.</p>
                            </div>
                            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                                <p className="text-xs font-semibold text-blue-400 mb-1">Agents With Receipts — ERC-8004</p>
                                <p className="text-[10px] text-muted-foreground">$4,004 — Agent systems leveraging ERC-8004 identity, reputation, and validation registries for verifiable trust.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "reputation" && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-yellow-400" />Reputation & Trust</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: "Credit Score", value: "680", sub: "300-900", color: "text-indigo-400" },
                            { label: "Trust Score", value: "50/100", color: "text-yellow-400" },
                            { label: "Tier", value: "Bronze", sub: "→ Silver → Gold → Platinum → Diamond", color: "text-amber-400" },
                        ].map((s) => (
                            <div key={s.label} className="rounded-lg border border-border p-4 bg-card">
                                <p className="text-xs text-muted-foreground">{s.label}</p>
                                <p className={cn("text-xl font-bold mt-0.5", s.color)}>{s.value}</p>
                                {s.sub && <p className="text-[10px] text-muted-foreground mt-1">{s.sub}</p>}
                            </div>
                        ))}
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground space-y-2">
                        <p>Reputation scores update based on:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li>ETH payments sent/received (+credit)</li>
                            <li>Bounties completed (+credit, +trust)</li>
                            <li>Public goods contributions (+credit, +trust)</li>
                            <li>Governance votes (+trust)</li>
                            <li>ERC-8004 validations received (+trust)</li>
                            <li>Trust-gated delegations completed (+trust)</li>
                            <li>Autonomous executions completed (+credit, +trust)</li>
                            <li>Disputes or timeouts (-credit, -trust)</li>
                        </ul>
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
