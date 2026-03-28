"use client";

/**
 * /tma — Telegram Mini App entry point
 *
 * Flow:
 *  1. Reads window.Telegram.WebApp.initData
 *  2. Verifies via POST /api/v1/ton/tma/verify
 *  3. Prompts TON Connect wallet connection (with ton_proof)
 *  4. Shows open bounties + lets user claim / submit / pay
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTonConnectUI, useTonWallet, useTonAddress } from "@tonconnect/ui-react";
import {
    Diamond, Wallet, Trophy, Send, RefreshCw, CheckCircle2,
    ExternalLink, Shield, AlertTriangle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nanoToTon, tonToNano } from "@/lib/ton-policy";

// ─── Types ────────────────────────────────────────────────────

interface TmaUser {
    id: number;
    firstName: string;
    lastName: string | null;
    username: string | null;
    isPremium: boolean;
    photoUrl: string | null;
}

interface Bounty {
    id: string;
    title: string;
    description: string;
    amountNano: string;
    status: string;
    tags: string[];
    postedBy: string;
    claimedBy?: string;
}

interface Payment {
    id: string;
    fromAddress: string;
    toAddress: string;
    amountNano: string;
    memo: string;
    status: string;
    txHash?: string;
}

// ─── Helpers ──────────────────────────────────────────────────

function shortAddr(addr: string | null | undefined): string {
    if (!addr || addr.length < 10) return addr || "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const BOUNTY_COLOR: Record<string, string> = {
    open: "text-blue-400", claimed: "text-yellow-400", submitted: "text-purple-400",
    approved: "text-green-400", released: "text-green-500",
    rejected: "text-red-400", cancelled: "text-muted-foreground",
};

// ─── Page ─────────────────────────────────────────────────────

export default function TmaPage() {
    const [tonConnectUI] = useTonConnectUI();
    const tonWallet = useTonWallet();
    const tonAddress = useTonAddress(false);
    const tonAddressFriendly = useTonAddress(true);
    const verifiedRef = useRef<string | null>(null);

    const [tmaUser, setTmaUser] = useState<TmaUser | null>(null);
    const [verifying, setVerifying] = useState(true);
    const [tmaError, setTmaError] = useState<string | null>(null);
    const [orgId, setOrgId] = useState<string | null>(null);

    const [bounties, setBounties] = useState<Bounty[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [walletVerified, setWalletVerified] = useState(false);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Auth header — API routes require x-wallet-address for requireOrgMember
    const authHeaders = useCallback((): Record<string, string> => ({
        "Content-Type": "application/json",
        "x-wallet-address": tonAddress || "",
    }), [tonAddress]);

    // Step 1: Verify Telegram initData
    useEffect(() => {
        const verify = async () => {
            setVerifying(true);
            try {
                const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } }).Telegram?.WebApp;
                const initData = tg?.initData;
                tg?.ready?.();

                if (!initData) {
                    // Dev fallback — allow testing outside Telegram
                    if (process.env.NODE_ENV === "development") {
                        setTmaUser({ id: 0, firstName: "Dev", lastName: null, username: "dev_user", isPremium: false, photoUrl: null });
                        setVerifying(false);
                        return;
                    }
                    setTmaError("Not running inside Telegram");
                    setVerifying(false);
                    return;
                }

                const res = await fetch("/api/v1/ton/tma/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ initData }),
                });
                const data = await res.json();
                if (data.valid) {
                    setTmaUser(data.user);
                } else {
                    setTmaError(data.error || "Verification failed");
                }
            } catch (err) {
                console.error("[tma verify]", err);
                setTmaError("Failed to verify Telegram context");
            }
            setVerifying(false);
        };
        verify();
    }, []);

    // Read orgId from URL params (bot sends ?orgId=xxx)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setOrgId(params.get("orgId"));
    }, []);

    // Step 2: Auto-verify TON wallet when connected via TON Connect
    useEffect(() => {
        if (!tonWallet || !orgId || !tonAddress) return;
        if (verifiedRef.current === tonAddress) return;
        verifiedRef.current = tonAddress;

        const proof = tonWallet.connectItems?.tonProof;
        const hasProof = proof && "proof" in proof;

        (async () => {
            try {
                const saveRes = await fetch("/api/v1/ton/connect", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({ orgId, address: tonAddress, walletName: tonWallet.device?.appName || "TMA Wallet" }),
                });
                if (!saveRes.ok) console.error("[tma connect]", await saveRes.text());
                if (!hasProof) { setWalletVerified(false); await fetchData(); return; }
                const p = (proof as { proof: { timestamp: number; domain: { lengthBytes: number; value: string }; signature: string; payload: string } }).proof;
                const verifyRes = await fetch("/api/v1/ton/verify", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({
                        orgId,
                        address: tonAddress,
                        proof: { timestamp: p.timestamp, domain: p.domain, signature: p.signature, payload: p.payload },
                        publicKey: tonWallet.account.publicKey,
                    }),
                });
                if (verifyRes.ok) {
                    const data = await verifyRes.json();
                    setWalletVerified(data.valid === true);
                } else {
                    console.error("[tma verify]", await verifyRes.text());
                    setWalletVerified(false);
                }
                await fetchData();
            } catch (err) { console.error("[tma wallet auto-verify]", err); }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tonWallet?.account?.address, orgId]);

    useEffect(() => { if (!tonWallet) { verifiedRef.current = null; setWalletVerified(false); } }, [tonWallet]);

    // Fetch org data
    const fetchData = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const hdrs = { "x-wallet-address": tonAddress || "" };
            const [b, p] = await Promise.allSettled([
                fetch(`/api/v1/ton/bounties?orgId=${orgId}`, { headers: hdrs }).then(r => r.ok ? r.json() : null),
                fetch(`/api/v1/ton/payments?orgId=${orgId}`, { headers: hdrs }).then(r => r.ok ? r.json() : null),
            ]);
            if (b.status === "fulfilled" && b.value) setBounties(b.value.bounties || []);
            if (p.status === "fulfilled" && p.value) setPayments(p.value.payments || []);
        } catch { /* */ }
        setLoading(false);
    }, [orgId, tonAddress]);

    useEffect(() => { if (orgId) fetchData(); }, [orgId, fetchData]);

    // Actions
    const handleConnect = () => {
        tonConnectUI.setConnectRequestParameters({
            state: "ready",
            value: { tonProof: `swarm-tma-${orgId || "anon"}-${Date.now()}` },
        });
        tonConnectUI.openModal();
    };

    const handleClaimBounty = async (bountyId: string) => {
        if (!orgId) return;
        setActionLoading(`claim-${bountyId}`);
        await fetch(`/api/v1/ton/bounties/${bountyId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ orgId, action: "claim", claimerAddress: tonAddress || `tg:${tmaUser?.id}` }),
        });
        await fetchData();
        setActionLoading(null);
    };

    const handleSubmitBounty = async (bountyId: string) => {
        if (!orgId) return;
        setActionLoading(`submit-${bountyId}`);
        await fetch(`/api/v1/ton/bounties/${bountyId}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ orgId, action: "submit", submittedBy: tonAddress || `tg:${tmaUser?.id}`, deliveryProof: "Submitted via TMA" }),
        });
        await fetchData();
        setActionLoading(null);
    };

    const handleExecutePayment = async (p: Payment) => {
        if (!tonWallet || !orgId) return;
        setActionLoading(`execute-${p.id}`);
        try {
            await tonConnectUI.sendTransaction({
                messages: [{ address: p.toAddress, amount: p.amountNano }],
                validUntil: Math.floor(Date.now() / 1000) + 300,
            });
            // Poll for tx hash
            let txHash: string | null = null;
            const deadline = Date.now() + 15000;
            const hdrs = { "x-wallet-address": tonAddress || "" };
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 2500));
                try {
                    const r = await fetch(`/api/v1/ton/history?address=${encodeURIComponent(p.fromAddress)}&limit=5`, { headers: hdrs });
                    if (!r.ok) continue;
                    const data = await r.json();
                    const match = (data.transactions || []).find((tx: { direction: string; amountNano: string }) =>
                        tx.direction === "out" && tx.amountNano === p.amountNano,
                    );
                    if (match) { txHash = match.hash; break; }
                } catch { /* retry */ }
            }
            await fetch(`/api/v1/ton/payments/${p.id}`, {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify({ orgId, action: "execute", txHash: txHash || `pending-${Date.now()}`, fromAddress: p.fromAddress, toAddress: p.toAddress, amountNano: p.amountNano }),
            });
            await fetchData();
        } catch (err) {
            console.error("[tma execute]", err);
        }
        setActionLoading(null);
    };

    // ─── Render ───────────────────────────────────────────────

    if (verifying) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        );
    }

    if (tmaError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-yellow-400" />
                <p className="text-sm text-muted-foreground">{tmaError}</p>
                <p className="text-xs text-muted-foreground">Open this page from a Telegram bot Mini App</p>
            </div>
        );
    }

    const openBounties = bounties.filter(b => b.status === "open");
    const myBounties = bounties.filter(b => b.claimedBy === (tonAddress || `tg:${tmaUser?.id}`));
    const readyPayments = payments.filter(p => p.status === "ready");

    return (
        <div className="max-w-md mx-auto p-4 space-y-4 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">💎</span>
                    <div>
                        <h1 className="text-lg font-semibold">Swarm Treasury</h1>
                        {tmaUser && <p className="text-xs text-muted-foreground">Hey {tmaUser.firstName}{tmaUser.isPremium ? " ⭐" : ""}</p>}
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={tonWallet ? () => tonConnectUI.disconnect() : handleConnect}>
                    <Wallet className="h-4 w-4 mr-1.5" />
                    {tonWallet ? shortAddr(tonAddressFriendly) : "Connect"}
                </Button>
            </div>

            {/* Wallet status */}
            {tonWallet && (
                <div className={cn(
                    "rounded-lg border px-4 py-3 flex items-center gap-2",
                    walletVerified
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-yellow-500/20 bg-yellow-500/5",
                )}>
                    {walletVerified
                        ? <><CheckCircle2 className="h-4 w-4 text-green-400" /><span className="text-sm text-green-400">Wallet verified</span></>
                        : <><Shield className="h-4 w-4 text-yellow-400" /><span className="text-sm text-yellow-400">Wallet connected (unverified)</span></>
                    }
                    <span className="ml-auto text-xs font-mono text-muted-foreground">{shortAddr(tonAddressFriendly)}</span>
                </div>
            )}

            {!tonWallet && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
                    <Wallet className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Connect your TON wallet to claim bounties and send payments</p>
                    <Button size="sm" onClick={handleConnect}>
                        <Wallet className="h-3.5 w-3.5 mr-1.5" />Connect TON Wallet
                    </Button>
                </div>
            )}

            {!orgId && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-400">
                    <AlertTriangle className="h-4 w-4 inline mr-1.5" />
                    No orgId in URL. Ask the bot admin to include <code className="bg-background/50 px-1 rounded">?orgId=...</code> in the Mini App URL.
                </div>
            )}

            {/* Open Bounties */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-medium flex items-center gap-1.5"><Trophy className="h-4 w-4 text-yellow-400" />Open Bounties</h2>
                    <Button variant="ghost" size="sm" className="h-7" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                    </Button>
                </div>
                {openBounties.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No open bounties right now</div>
                ) : (
                    <div className="space-y-2">
                        {openBounties.map(b => (
                            <div key={b.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium">{b.title}</p>
                                        <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
                                    </div>
                                    <span className="text-sm font-bold text-blue-400 shrink-0 ml-2">{nanoToTon(b.amountNano)} TON</span>
                                </div>
                                {b.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {b.tags.map(t => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}
                                    </div>
                                )}
                                <Button size="sm" className="w-full h-8 text-xs" disabled={!tonWallet || actionLoading === `claim-${b.id}`} onClick={() => handleClaimBounty(b.id)}>
                                    {actionLoading === `claim-${b.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trophy className="h-3 w-3 mr-1" />}
                                    Claim Bounty
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* My Active Bounties */}
            {myBounties.length > 0 && (
                <div>
                    <h2 className="text-sm font-medium mb-2">My Bounties</h2>
                    <div className="space-y-2">
                        {myBounties.map(b => (
                            <div key={b.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium">{b.title}</p>
                                        <span className={cn("text-xs capitalize", BOUNTY_COLOR[b.status])}>{b.status}</span>
                                    </div>
                                    <span className="text-sm font-bold shrink-0 ml-2">{nanoToTon(b.amountNano)} TON</span>
                                </div>
                                {b.status === "claimed" && (
                                    <Button size="sm" className="w-full h-8 text-xs" disabled={actionLoading === `submit-${b.id}`} onClick={() => handleSubmitBounty(b.id)}>
                                        {actionLoading === `submit-${b.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                                        Submit Work
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Ready Payments (execute on-chain) */}
            {readyPayments.length > 0 && tonWallet && (
                <div>
                    <h2 className="text-sm font-medium mb-2 flex items-center gap-1.5"><Send className="h-4 w-4 text-blue-400" />Ready to Execute</h2>
                    <div className="space-y-2">
                        {readyPayments.map(p => (
                            <div key={p.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-mono text-muted-foreground">
                                        {shortAddr(p.fromAddress)} → {shortAddr(p.toAddress)}
                                    </div>
                                    <span className="text-sm font-bold">{nanoToTon(p.amountNano)} TON</span>
                                </div>
                                {p.memo && <p className="text-xs text-muted-foreground">{p.memo}</p>}
                                <Button size="sm" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700" disabled={actionLoading === `execute-${p.id}`} onClick={() => handleExecutePayment(p)}>
                                    {actionLoading === `execute-${p.id}` ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Sending…</> : <><Send className="h-3 w-3 mr-1" />Execute On-chain</>}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Executed Payments with tx links */}
            {payments.filter(p => p.status === "executed" && p.txHash).length > 0 && (
                <div>
                    <h2 className="text-sm font-medium mb-2 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" />Completed</h2>
                    <div className="space-y-2">
                        {payments.filter(p => p.status === "executed" && p.txHash).slice(0, 5).map(p => (
                            <div key={p.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-mono text-muted-foreground">{shortAddr(p.toAddress)}</div>
                                    <span className="text-sm font-medium text-green-400">{nanoToTon(p.amountNano)} TON</span>
                                </div>
                                <a href={`https://toncenter.com/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                                    <ExternalLink className="h-3 w-3" />View tx
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
