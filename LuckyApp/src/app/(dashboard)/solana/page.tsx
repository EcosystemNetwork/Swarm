/** Solana — Wallet, SPL tokens, staking, programs, and Metaplex integration. */
"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/analytics/stat-card";
import { useOrg } from "@/contexts/OrgContext";
import { useSession } from "@/contexts/SessionContext";
import { getOwnedItems, SKILL_REGISTRY, type OwnedItem } from "@/lib/skills";
import { getAgentsByOrg, type Agent } from "@/lib/firestore";
import { useActiveAccount } from "thirdweb/react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SOLANA_MANIFEST } from "@/lib/solana";
import { METAPLEX_MANIFEST } from "@/lib/metaplex";
import { cn } from "@/lib/utils";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import DecryptedText from "@/components/reactbits/DecryptedText";
import {
  Zap, Wallet, Globe, Landmark, Users, Palette,
  Wrench, GitBranch, Code, Play, ExternalLink,
  Sparkles, Layers, FileEdit, Image,
  CheckCircle, Copy, Loader2, Send,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type SolanaTab = "overview" | "wallet" | "network" | "treasury" | "agents" | "metaplex";

const CLUSTER_OPTIONS = [
  { id: "mainnet-beta", label: "Mainnet Beta", rpc: "https://api.mainnet-beta.solana.com" },
  { id: "devnet", label: "Devnet", rpc: "https://api.devnet.solana.com" },
  { id: "testnet", label: "Testnet", rpc: "https://api.testnet.solana.com" },
];

const TOOL_ICONS: Record<string, typeof Wrench> = {
  Wallet: Wallet,
  Coins: Landmark,
  Lock: GitBranch,
  Code: Code,
  ExternalLink: ExternalLink,
  Sparkles: Sparkles,
  Layers: Layers,
  FileEdit: FileEdit,
  Image: Image,
};

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════

export default function SolanaPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as SolanaTab) || "overview";
  const [tab, setTab] = useState<SolanaTab>(initialTab);
  const [cluster, setCluster] = useState("devnet");
  const [inventory, setInventory] = useState<OwnedItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const { currentOrg } = useOrg();
  const { address } = useSession();
  const account = useActiveAccount();

  // Mint Agent Identity NFT state
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [useCustomWallet, setUseCustomWallet] = useState(false);
  const [customWallet, setCustomWallet] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintCustodial, setMintCustodial] = useState(false);

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null;
  const recipientAddress = useCustomWallet ? customWallet : (account?.address || address || "");

  const hasMetaplex = useMemo(
    () => inventory.some(i => i.skillId === "metaplex-nft" && i.enabled),
    [inventory]
  );

  const clusterInfo = CLUSTER_OPTIONS.find(c => c.id === cluster) || CLUSTER_OPTIONS[1];

  useEffect(() => {
    if (!currentOrg) return;
    getOwnedItems(currentOrg.id).then(setInventory).catch(() => {});
    getAgentsByOrg(currentOrg.id).then(setAgents).catch(() => {});
  }, [currentOrg]);

  // Sync tab from URL param
  useEffect(() => {
    const urlTab = searchParams.get("tab") as SolanaTab;
    if (urlTab && urlTab !== tab) setTab(urlTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const tabs: { id: SolanaTab; label: string; icon: typeof Zap }[] = [
    { id: "overview", label: "Overview", icon: Zap },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "network", label: "Network", icon: Globe },
    { id: "treasury", label: "Treasury", icon: Landmark },
    { id: "agents", label: "Agents", icon: Users },
    ...(hasMetaplex ? [{ id: "metaplex" as const, label: "Metaplex", icon: Palette }] : []),
  ];

  async function handleMintNft() {
    if (!selectedAgent || !recipientAddress || !currentOrg) return;
    setMinting(true);
    setMintError(null);
    setMintSuccess(null);
    setMintCustodial(false);
    try {
      const res = await fetch("/api/v1/metaplex/mint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": account?.address || address || "",
        },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          orgId: currentOrg.id,
          recipientAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Mint failed (${res.status})`);

      // Update local state with the real mint address
      setAgents(prev => prev.map(a =>
        a.id === selectedAgent.id ? { ...a, nftMintAddress: data.mintAddress, nftMintedAt: new Date() } : a
      ));
      setMintSuccess(data.mintAddress);
      setMintCustodial(data.custodial || false);
    } catch (err) {
      setMintError(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setMinting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <DecryptedText text="Solana" speed={30} maxIterations={6} animateOn="view" sequential className="text-3xl font-bold" />
          </h1>
          <p className="text-muted-foreground mt-1">Wallet, tokens, staking, and program interactions on Solana</p>
        </div>
        <Badge variant="outline" className="text-xs px-2 py-1 bg-purple-500/10 border-purple-500/20 text-purple-400">
          {clusterInfo.label}
        </Badge>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border pb-px overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap",
              tab === t.id
                ? "bg-purple-500/10 text-purple-400 border-b-2 border-purple-500"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Cluster" value={clusterInfo.label} icon="🌐" />
            <StatCard title="Agents" value={String(agents.length)} icon="🤖" />
            <StatCard title="Mods Installed" value={String(inventory.filter(i => i.enabled).length)} icon="📦" />
            <StatCard title="Metaplex" value={hasMetaplex ? "Active" : "Not Installed"} icon="🎨" />
          </div>

          {/* Tools */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SOLANA_MANIFEST.tools.map(tool => {
                const Icon = TOOL_ICONS[tool.icon] || Wrench;
                return (
                  <SpotlightCard key={tool.id} className="p-0 glass-card-enhanced">
                    <CardHeader className="px-4 pt-4 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Icon className="h-4 w-4 text-purple-400" />
                        {tool.name}
                        <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{tool.category}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                      {tool.usageExample && (
                        <pre className="mt-2 p-2 rounded bg-muted/50 text-[10px] overflow-x-auto">
                          <code>{tool.usageExample}</code>
                        </pre>
                      )}
                    </CardContent>
                  </SpotlightCard>
                );
              })}
            </div>
          </div>

          {/* Workflows */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Workflows</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SOLANA_MANIFEST.workflows.map(wf => (
                <SpotlightCard key={wf.id} className="p-0 glass-card-enhanced">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{wf.icon}</span>
                      {wf.name}
                      {wf.estimatedTime && (
                        <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{wf.estimatedTime}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-2">{wf.description}</p>
                    <ol className="space-y-1">
                      {wf.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="text-purple-400 font-mono text-[10px] mt-0.5">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </SpotlightCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Wallet Tab ─── */}
      {tab === "wallet" && (
        <div className="space-y-6">
          <SpotlightCard className="p-0 glass-card-enhanced">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4 text-purple-400" />
                Connected Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {address ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Address:</span>
                    <code className="text-xs font-mono bg-muted/50 px-2 py-0.5 rounded">{address}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Cluster:</span>
                    <Badge variant="outline" className="text-[10px]">{clusterInfo.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground/60">
                    Connect a Solana wallet (Phantom, Solflare) for native SOL operations. Currently showing your Swarm session address.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No wallet connected. Sign in to view wallet details.</p>
              )}
            </CardContent>
          </SpotlightCard>

          {/* Agent Skills */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Agent Skills</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SOLANA_MANIFEST.agentSkills.map(skill => (
                <SpotlightCard key={skill.id} className="p-0 glass-card-enhanced">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Play className="h-3.5 w-3.5 text-purple-400" />
                      {skill.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <p className="text-xs text-muted-foreground">{skill.description}</p>
                    <div className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded text-purple-400">{skill.invocation}</div>
                    {skill.exampleInput && (
                      <div className="flex gap-4 text-[10px]">
                        <div><span className="text-muted-foreground">Input:</span> <code>{skill.exampleInput}</code></div>
                      </div>
                    )}
                  </CardContent>
                </SpotlightCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Network Tab ─── */}
      {tab === "network" && (
        <div className="space-y-6">
          <SpotlightCard className="p-0 glass-card-enhanced">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-purple-400" />
                Cluster Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {CLUSTER_OPTIONS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCluster(c.id)}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                      cluster === c.id
                        ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                        : "border-border hover:border-purple-500/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">RPC Endpoint:</span>
                  <code className="text-xs font-mono bg-muted/50 px-2 py-0.5 rounded flex-1">{clusterInfo.rpc}</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Explorer:</span>
                  <a
                    href={`https://solscan.io/?cluster=${cluster}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:underline flex items-center gap-1"
                  >
                    Solscan <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </CardContent>
          </SpotlightCard>

          {/* Examples */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Code Examples</h2>
            <div className="grid grid-cols-1 gap-3">
              {SOLANA_MANIFEST.examples.map(ex => (
                <SpotlightCard key={ex.id} className="p-0 glass-card-enhanced">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Code className="h-4 w-4 text-purple-400" />
                      {ex.name}
                      {ex.language && <Badge variant="outline" className="text-[9px] px-1.5">{ex.language}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-2">{ex.description}</p>
                    {ex.codeSnippet && (
                      <pre className="p-3 rounded-lg bg-zinc-900 text-[10px] overflow-x-auto border border-border">
                        <code>{ex.codeSnippet}</code>
                      </pre>
                    )}
                  </CardContent>
                </SpotlightCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Treasury Tab ─── */}
      {tab === "treasury" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="SOL Balance" value="—" icon="◎" />
            <StatCard title="Token Accounts" value="—" icon="🪙" />
            <StatCard title="Staked SOL" value="—" icon="🔒" />
          </div>
          <SpotlightCard className="p-0 glass-card-enhanced">
            <CardContent className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Connect a Solana wallet to view treasury balances and token accounts.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Treasury tracking will show SOL holdings, SPL token balances, and staking positions.
              </p>
            </CardContent>
          </SpotlightCard>
        </div>
      )}

      {/* ─── Agents Tab ─── */}
      {tab === "agents" && (
        <div className="space-y-6">
          <StatCard title="Registered Agents" value={String(agents.length)} icon="🤖" />
          {agents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {agents.map(agent => (
                <SpotlightCard key={agent.id} className="p-0 glass-card-enhanced">
                  <CardContent className="px-4 py-3 flex items-center gap-3">
                    <img
                      src={agent.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${agent.name}`}
                      alt={agent.name}
                      className="w-10 h-10 rounded-full border-2 border-purple-500/30"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{agent.name}</p>
                      <p className="text-[10px] text-muted-foreground">{agent.type} · {agent.status}</p>
                    </div>
                    <span className={cn(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      agent.status === "online" ? "bg-emerald-400" : agent.status === "busy" ? "bg-amber-400" : "bg-gray-400"
                    )} />
                  </CardContent>
                </SpotlightCard>
              ))}
            </div>
          ) : (
            <SpotlightCard className="p-0 glass-card-enhanced">
              <CardContent className="px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">No agents registered yet.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Register agents from the Agents page to see them here.</p>
              </CardContent>
            </SpotlightCard>
          )}
        </div>
      )}

      {/* ─── Metaplex Tab (only if installed) ─── */}
      {tab === "metaplex" && hasMetaplex && (
        <div className="space-y-6">
          {/* Metaplex header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20">
              <Palette className="h-5 w-5 text-pink-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Metaplex</h2>
              <p className="text-xs text-muted-foreground">NFT minting, collections, metadata, and agent identity on Solana</p>
            </div>
            <a
              href="https://www.metaplex.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-pink-400 hover:underline flex items-center gap-1"
            >
              Docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* ── Mint Agent Identity NFT ── */}
          <SpotlightCard className="p-0 glass-card-enhanced" spotlightColor="rgba(236,72,153,0.06)">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-pink-400" />
                Mint Agent Identity NFT
                <Badge variant="outline" className="ml-auto text-[9px] px-1.5 bg-pink-500/10 border-pink-500/20 text-pink-400">Devnet</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              {/* Agent selector */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Select Agent</p>
                <Select value={selectedAgentId} onValueChange={(v) => { setSelectedAgentId(v); setMintSuccess(null); setMintError(null); }}>
                  <SelectTrigger className="bg-zinc-900 text-white">
                    <SelectValue placeholder="Choose an agent to mint..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 text-white border-border">
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className="flex items-center gap-2">
                          {agent.name} <span className="text-muted-foreground">({agent.type})</span>
                          {agent.asn && <span className="text-muted-foreground text-[10px] font-mono">{agent.asn.split("-").slice(0, 4).join("-")}</span>}
                          {agent.nftMintAddress && <Badge className="text-[9px] px-1 bg-pink-500/10 text-pink-400 border-pink-500/20 ml-1">Minted</Badge>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* NFT Preview */}
              {selectedAgent && (
                <div className="rounded-lg border border-pink-500/20 bg-pink-500/5 p-4 space-y-3">
                  <p className="text-xs font-medium text-pink-400 uppercase tracking-wider">NFT Preview</p>
                  <div className="flex items-start gap-4">
                    <img
                      src={selectedAgent.avatarUrl || `https://api.dicebear.com/9.x/bottts/svg?seed=${selectedAgent.name}-${selectedAgent.type || "agent"}`}
                      alt={selectedAgent.name}
                      className="w-20 h-20 rounded-lg border-2 border-pink-500/30 bg-zinc-900"
                    />
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-semibold">{selectedAgent.name}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div><span className="text-muted-foreground">Type:</span> {selectedAgent.type}</div>
                        <div><span className="text-muted-foreground">ASN:</span> {selectedAgent.asn || "N/A"}</div>
                        <div><span className="text-muted-foreground">Status:</span> {selectedAgent.status}</div>
                        <div><span className="text-muted-foreground">Trust:</span> {selectedAgent.trustScore ?? "—"}</div>
                      </div>
                      {selectedAgent.reportedSkills && selectedAgent.reportedSkills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedAgent.reportedSkills.map(s => (
                            <Badge key={s.id} variant="outline" className="text-[9px] px-1.5 bg-pink-500/10 border-pink-500/20 text-pink-400">{s.name}</Badge>
                          ))}
                        </div>
                      )}
                      {selectedAgent.bio && (
                        <p className="text-[10px] text-muted-foreground italic mt-1">{selectedAgent.bio}</p>
                      )}
                    </div>
                  </div>
                  <pre className="p-2 rounded bg-zinc-900 text-[10px] overflow-x-auto border border-border text-muted-foreground">
                    <code>{JSON.stringify({
                      name: selectedAgent.name,
                      symbol: "SWARM",
                      description: selectedAgent.bio || selectedAgent.description,
                      image: selectedAgent.avatarUrl || `dicebear:${selectedAgent.name}`,
                      attributes: [
                        { trait_type: "Type", value: selectedAgent.type },
                        { trait_type: "ASN", value: selectedAgent.asn || "unassigned" },
                        { trait_type: "Trust Score", value: selectedAgent.trustScore ?? 0 },
                        { trait_type: "Credit Score", value: selectedAgent.creditScore ?? 0 },
                      ],
                    }, null, 2)}</code>
                  </pre>
                </div>
              )}

              {/* Already minted indicator */}
              {selectedAgent?.nftMintAddress && !mintSuccess && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-emerald-400">Already Minted</p>
                    <code className="text-[10px] text-muted-foreground font-mono break-all">{selectedAgent.nftMintAddress}</code>
                  </div>
                  <a
                    href={`https://solscan.io/token/${selectedAgent.nftMintAddress}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-pink-400 hover:underline flex items-center gap-1 shrink-0"
                  >
                    Solscan <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Recipient wallet (only if not yet minted) */}
              {selectedAgent && !selectedAgent.nftMintAddress && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Recipient Wallet</p>
                    <button
                      onClick={() => setUseCustomWallet(!useCustomWallet)}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border transition-all",
                        useCustomWallet
                          ? "bg-pink-500/10 text-pink-400 border-pink-500/20"
                          : "text-muted-foreground border-border hover:border-pink-500/20"
                      )}
                    >
                      {useCustomWallet ? "Using custom wallet" : "Custom wallet"}
                    </button>
                  </div>

                  {useCustomWallet ? (
                    <Input
                      placeholder="Enter Solana (base58) or EVM (0x) wallet address..."
                      value={customWallet}
                      onChange={(e) => setCustomWallet(e.target.value)}
                      className="font-mono text-xs bg-zinc-900 text-white"
                    />
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                      <Wallet className="h-4 w-4 text-pink-400" />
                      <code className="text-xs font-mono truncate flex-1">
                        {recipientAddress || "No wallet connected"}
                      </code>
                      <Badge variant="outline" className="text-[9px] px-1.5">thirdweb</Badge>
                    </div>
                  )}

                  {/* EVM address notice */}
                  {recipientAddress && /^0x[0-9a-fA-F]{40}$/.test(recipientAddress) && (
                    <p className="text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded px-2 py-1.5">
                      EVM address detected. NFT will be held by the Swarm platform wallet on Solana with your EVM address recorded in the metadata for ownership tracking.
                    </p>
                  )}

                  {/* Mint button */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleMintNft}
                      disabled={minting || !recipientAddress}
                      className="bg-pink-600 hover:bg-pink-700 text-white"
                    >
                      {minting ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Minting...</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-2" /> Mint Agent Identity NFT</>
                      )}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      Solana Devnet
                    </span>
                  </div>
                </div>
              )}

              {/* Success state */}
              {mintSuccess && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                    <p className="text-sm font-medium text-emerald-400">NFT Minted Successfully!</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] font-mono text-muted-foreground break-all flex-1">{mintSuccess}</code>
                    <button onClick={() => navigator.clipboard.writeText(mintSuccess)} className="text-pink-400 hover:text-pink-300">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Send className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {mintCustodial
                        ? <>Held by platform wallet · Owner: <code className="font-mono">{recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}</code></>
                        : <>Sent to: <code className="font-mono">{recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}</code></>
                      }
                    </span>
                  </div>
                  <a
                    href={`https://solscan.io/token/${mintSuccess}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-pink-400 hover:underline"
                  >
                    View on Solscan <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Error state */}
              {mintError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-xs text-red-400">{mintError}</p>
                </div>
              )}
            </CardContent>
          </SpotlightCard>

          {/* Metaplex stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Programs" value="Core, Token Metadata, Bubblegum" icon="📜" />
            <StatCard title="Agent Registry" value="Available" icon="🤖" />
            <StatCard title="Collections" value="—" icon="📁" />
            <StatCard title="NFTs Minted" value={String(agents.filter(a => a.nftMintAddress).length)} icon="🎨" />
          </div>

          {/* Metaplex Tools */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {METAPLEX_MANIFEST.tools.map(tool => {
                const Icon = TOOL_ICONS[tool.icon] || Wrench;
                return (
                  <SpotlightCard key={tool.id} className="p-0 glass-card-enhanced">
                    <CardHeader className="px-4 pt-4 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Icon className="h-4 w-4 text-pink-400" />
                        {tool.name}
                        <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{tool.category}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                      {tool.usageExample && (
                        <pre className="mt-2 p-2 rounded bg-muted/50 text-[10px] overflow-x-auto">
                          <code>{tool.usageExample}</code>
                        </pre>
                      )}
                    </CardContent>
                  </SpotlightCard>
                );
              })}
            </div>
          </div>

          {/* Metaplex Workflows */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Workflows</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {METAPLEX_MANIFEST.workflows.map(wf => (
                <SpotlightCard key={wf.id} className="p-0 glass-card-enhanced">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{wf.icon}</span>
                      {wf.name}
                      {wf.estimatedTime && (
                        <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{wf.estimatedTime}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-2">{wf.description}</p>
                    <ol className="space-y-1">
                      {wf.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="text-pink-400 font-mono text-[10px] mt-0.5">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </SpotlightCard>
              ))}
            </div>
          </div>

          {/* Metaplex Agent Skills */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Agent Skills</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {METAPLEX_MANIFEST.agentSkills.map(skill => (
                <SpotlightCard key={skill.id} className="p-0 glass-card-enhanced">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Play className="h-3.5 w-3.5 text-pink-400" />
                      {skill.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <p className="text-xs text-muted-foreground">{skill.description}</p>
                    <div className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded text-pink-400">{skill.invocation}</div>
                  </CardContent>
                </SpotlightCard>
              ))}
            </div>
          </div>

          {/* Metaplex Examples */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Code Examples</h2>
            <div className="grid grid-cols-1 gap-3">
              {METAPLEX_MANIFEST.examples.map(ex => (
                <SpotlightCard key={ex.id} className="p-0 glass-card-enhanced">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Code className="h-4 w-4 text-pink-400" />
                      {ex.name}
                      {ex.language && <Badge variant="outline" className="text-[9px] px-1.5">{ex.language}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-2">{ex.description}</p>
                    {ex.codeSnippet && (
                      <pre className="p-3 rounded-lg bg-zinc-900 text-[10px] overflow-x-auto border border-border">
                        <code>{ex.codeSnippet}</code>
                      </pre>
                    )}
                  </CardContent>
                </SpotlightCard>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
