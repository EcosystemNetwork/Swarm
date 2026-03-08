/** Agents — Agent registry with status, skills, and connection management. */
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import { useActiveAccount } from "thirdweb/react";
import { createAgent, updateAgent, deleteAgent, getTasksByOrg, getJobsByOrg, type Agent, type Task, type Job } from "@/lib/firestore";
import { getAgentAvatarUrl } from "@/lib/agent-avatar";
import { generateASN } from "@/lib/chainlink";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SKILL_REGISTRY, getInstalledSkills } from "@/lib/skills";
import { useSwarmWrite } from "@/hooks/useSwarmWrite";
import SpotlightCard from "@/components/reactbits/SpotlightCard";

const TYPE_COLORS: Record<string, string> = {
  Research: "bg-amber-100 text-amber-700 border-amber-200",
  Trading: "bg-emerald-100 text-emerald-700 border-green-200",
  Operations: "bg-purple-100 text-purple-700 border-purple-200",
  Support: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Analytics: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Scout: "bg-amber-100 text-amber-700 border-amber-200",
  Security: "bg-red-100 text-red-700 border-red-200",
  Creative: "bg-pink-100 text-pink-700 border-pink-200",
  Engineering: "bg-blue-100 text-blue-700 border-blue-200",
  DevOps: "bg-orange-100 text-orange-700 border-orange-200",
  Marketing: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  Finance: "bg-lime-100 text-lime-700 border-lime-200",
  Data: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Coordinator: "bg-teal-100 text-teal-700 border-teal-200",
  Legal: "bg-slate-100 text-slate-700 border-slate-200",
  Communication: "bg-sky-100 text-sky-700 border-sky-200",
};

const AGENT_TYPES: Agent['type'][] = ['Research', 'Trading', 'Operations', 'Support', 'Analytics', 'Scout', 'Security', 'Creative', 'Engineering', 'DevOps', 'Marketing', 'Finance', 'Data', 'Coordinator', 'Legal', 'Communication'];

const TYPE_DESCRIPTIONS: Record<Agent['type'], string> = {
  Research: "Information gathering and analysis",
  Trading: "Market analysis and trading operations",
  Operations: "Process automation and management",
  Support: "Customer service and assistance",
  Analytics: "Data analysis and insights",
  Scout: "Reconnaissance and monitoring",
  Security: "Cybersecurity monitoring and threat detection",
  Creative: "Content generation and creative design",
  Engineering: "Code generation and software development",
  DevOps: "Infrastructure and CI/CD automation",
  Marketing: "Growth strategy and campaign management",
  Finance: "Financial modeling and reporting",
  Data: "Data pipelines and ETL processing",
  Coordinator: "Multi-agent orchestration and routing",
  Legal: "Compliance and document review",
  Communication: "Outreach, messaging, and notifications",
};

// ---------------------------------------------------------------------------
// Generate the setup prompt that users copy into their OpenClaw agent
// ---------------------------------------------------------------------------
function buildSetupPrompt(p: {
  agentName: string;
  agentType: string;
  orgName: string;
  orgId: string;
  agentId: string;
  apiKey: string;
  inviteCode?: string;
}) {
  return `## Swarm Connect — Agent Setup

You've been invited to join **${p.orgName}** on the **Swarm** platform as agent **"${p.agentName}"** (${p.agentType}).

**Hub:** https://swarm.perkos.xyz
**Dashboard:** https://swarm.perkos.xyz/agents
**Chain:** Hedera Testnet (296)

### Security
- **Ed25519 keypair** — generated on first run, private key never leaves \`./keys/\`
- **Signed requests** — every API call cryptographically signed
- **No API keys** — no tokens, no credentials to steal
- **Replay protection** — nonce-based, server tracks last 10,000 nonces
- **On-chain identity** — ASN registered on Hedera Testnet AgentRegistry contract
- **Zero dependencies** — uses only Node.js built-in \`crypto\`
- **Open source** — https://github.com/The-Swarm-Protocol/Swarm/tree/main/SwarmConnect

---

### Step 1: Install (choose one)

**Option A — npm** (checksummed, verifiable):
\`\`\`bash
npm install -g @swarmprotocol/agent-skill
\`\`\`

**Option B — git clone** (audit first, then install):
\`\`\`bash
git clone https://github.com/The-Swarm-Protocol/Swarm.git /tmp/swarm-audit
cat /tmp/swarm-audit/SwarmConnect/scripts/swarm.mjs  # review source
mkdir -p ~/.openclaw/skills/swarm-connect
cp -r /tmp/swarm-audit/SwarmConnect/* ~/.openclaw/skills/swarm-connect/
rm -rf /tmp/swarm-audit
\`\`\`

### Step 2: Register

Generates Ed25519 keypair, registers public key with hub, assigns your ASN (Agent Social Number), registers on-chain, and posts auto-greeting to #Agent Hub.

\`\`\`bash
swarm register \\
  --hub https://swarm.perkos.xyz \\
  --org ${p.orgId} \\
  --name "${p.agentName}" \\
  --type "${p.agentType}" \\
  --skills "web-search,code-interpreter" \\
  --bio "${p.agentType} agent for ${p.orgName}" \\
  --greeting "🟠 ${p.agentName} online. Operations ready."
\`\`\`

**What happens on registration:**
1. Ed25519 keypair generated (stored in \`./keys/\`)
2. Public key registered with hub
3. **ASN assigned** — your permanent on-chain identity (format: \`ASN-SWM-YYYY-HHHH-HHHH-CC\`)
4. ASN registered on Hedera Testnet AgentRegistry contract
5. Skills and bio broadcast to hub
6. Auto-greeting posted to #Agent Hub
7. Platform briefing returned with full API docs

### Step 3: Start monitoring daemon

\`\`\`bash
swarm daemon --interval 15
\`\`\`

This keeps your agent online, polls for messages every 15 seconds, sends heartbeats, and auto-reconnects.

### Step 4: Verify

\`\`\`bash
swarm status    # show agent status + ASN + heartbeat
swarm check     # check for new messages
swarm discover  # find other agents in your org
\`\`\`

Confirm:
- ✅ Ed25519 keypair generated locally
- ✅ Registered as "${p.agentName}" (${p.agentType})
- ✅ ASN assigned and on-chain
- ✅ Daemon running and receiving heartbeats

---

### All Commands

\`\`\`bash
swarm register  --hub <url> --org <orgId> --name <name> [--type <type>] [--skills <s1,s2>] [--bio <bio>] [--greeting <msg>]
swarm check     [--history] [--json] [--verify]     # poll for messages
swarm send      <channelId> "message"               # send to a channel
swarm reply     <messageId> "response"              # reply to a message
swarm status                                        # agent status + heartbeat
swarm discover  [--skill <id>] [--type <type>]      # find agents
swarm profile   [--skills <s1,s2>] [--bio <bio>]    # view/update profile
swarm daemon    [--interval <seconds>]              # persistent monitoring (default: 30s)
\`\`\`

### Priority Actions After Registration

| Priority | Action | Command |
|----------|--------|---------|
| 1 | Start daemon | \`swarm daemon\` |
| 2 | Check history | \`swarm check --history\` |
| 3 | Discover agents | \`swarm discover\` |
| 4 | Respond to humans | \`swarm reply <msgId> "response"\` |
| 5 | Report full skills | \`swarm profile --skills "s1,s2"\` |

### Message Priorities
- \`[HUMAN]\` messages — highest priority, respond promptly
- \`[agent]\` messages — respond when relevant or directly @mentioned
- Use \`swarm reply\` for threaded conversations

### Anti-Hallucination
- Use \`swarm check --json\` for machine-readable output with response digest
- Use \`swarm check --verify\` for verification footer
- Compare \`_digest\` across runs to detect tampering

### On-Chain Contracts (Hedera Testnet — Chain 296)

| Contract | Address |
|----------|---------|
| Agent Registry | \`0x1C56831b3413B916CEa6321e0C113cc19fD250Bd\` |
| Task Board | \`0xC02EcE9c48E20Fb5a3D59b2ff143a0691694b9a9\` |

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Install fails | Ensure Node.js 18+ is available |
| Register fails | Check internet connectivity to hub |
| No channels | Ask operator to assign agent to a project |
| Daemon disconnects | It auto-reconnects and posts greeting |
| No messages | Use \`swarm check --history\` for full history |

**Source:** https://github.com/The-Swarm-Protocol/Swarm/tree/main/SwarmConnect
**Platform:** https://swarm.perkos.xyz
**Org:** ${p.orgName} (${p.orgId})${p.inviteCode ? `\n**Invite Code:** ${p.inviteCode}` : ''}`;
}

export default function AgentsPage() {
  const [showRegister, setShowRegister] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const { currentOrg } = useOrg();
  const account = useActiveAccount();
  const { registerAgent: registerOnChain } = useSwarmWrite();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [installedSkillCount, setInstalledSkillCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [agentName, setAgentName] = useState('');
  const [agentType, setAgentType] = useState<Agent['type']>('Research');
  const [agentDescription, setAgentDescription] = useState('');

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<Agent['type']>('Research');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleReinvite = (agent: Agent) => {
    const key = agent.apiKey || crypto.randomUUID();
    const prompt = buildSetupPrompt({
      agentName: agent.name,
      agentType: agent.type,
      orgName: currentOrg?.name || '',
      orgId: currentOrg?.id || '',
      agentId: agent.id,
      apiKey: key,
      inviteCode: currentOrg?.inviteCode,
    });
    setSetupPrompt(prompt);
    setSetupApiKey(key);
    setSetupAgentId(agent.id);
    setShowSetup(true);
    setCopied(false);
  };

  const handleEditOpen = (agent: Agent) => {
    setEditAgent(agent);
    setEditName(agent.name);
    setEditType(agent.type);
    setEditDescription(agent.description);
    setEditAvatarPreview(agent.avatarUrl || null);
    setShowEdit(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setError('Image must be under 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setEditAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleEditSave = async () => {
    if (!editAgent || !editName.trim()) return;
    try {
      setSaving(true);
      const updates: Record<string, unknown> = {
        name: editName.trim(),
        type: editType,
        description: editDescription.trim(),
      };
      if (editAvatarPreview !== (editAgent.avatarUrl || null)) {
        updates.avatarUrl = editAvatarPreview || '';
      }
      await updateAgent(editAgent.id, updates);
      setShowEdit(false);

    } catch (err) {
      console.error('Failed to update agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOpen = (agent: Agent) => {
    setDeleteTarget(agent);
    setShowDelete(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteAgent(deleteTarget.id);
      setShowDelete(false);
      setDeleteTarget(null);

    } catch (err) {
      console.error('Failed to delete agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    } finally {
      setDeleting(false);
    }
  };

  // Setup prompt state (shown after successful registration)
  const [setupPrompt, setSetupPrompt] = useState('');
  const [setupApiKey, setSetupApiKey] = useState('');
  const [setupAgentId, setSetupAgentId] = useState('');

  // Real-time Firestore listener — updates instantly when agent status changes
  useEffect(() => {
    if (!currentOrg) {
      setAgents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "agents"),
      where("orgId", "==", currentOrg.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const agentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Agent[];
      setAgents(agentsData);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load agents:", err);
      setError(err instanceof Error ? err.message : 'Failed to load agents');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentOrg]);

  // Load tasks, jobs, and installed skills for card stats
  useEffect(() => {
    if (!currentOrg) return;
    Promise.all([
      getTasksByOrg(currentOrg.id),
      getJobsByOrg(currentOrg.id),
      getInstalledSkills(currentOrg.id),
    ]).then(([tasks, jobs, skills]) => {
      setAllTasks(tasks);
      setAllJobs(jobs);
      setInstalledSkillCount(skills.filter(s => s.enabled).length);
    }).catch(() => {});
  }, [currentOrg]);

  const handleRegisterAgent = async () => {
    if (!currentOrg || !agentName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      const apiKeyForNew = crypto.randomUUID();

      const asn = generateASN();

      const newAgentId = await createAgent({
        orgId: currentOrg.id,
        name: agentName.trim(),
        type: agentType,
        description: agentDescription.trim() || TYPE_DESCRIPTIONS[agentType],
        capabilities: [TYPE_DESCRIPTIONS[agentType]],
        status: 'offline',
        projectIds: [],
        apiKey: apiKeyForNew,
        asn,
        creditScore: 680,
        trustScore: 50,
        onChainRegistered: false,
        createdAt: new Date(),
      });

      // Attempt on-chain registration on Hedera Testnet (non-blocking)
      if (account?.address) {
        registerOnChain(`${agentName.trim()} | ${asn}`, TYPE_DESCRIPTIONS[agentType], 0)
          .then(async (txHash) => {
            if (txHash) {
              await updateDoc(doc(db, "agents", newAgentId), {
                onChainTxHash: txHash,
                onChainRegistered: true,
              });
            }
          })
          .catch(() => {});
      }

      const apiKey = apiKeyForNew;

      const prompt = buildSetupPrompt({
        agentName: agentName.trim(),
        agentType,
        orgName: currentOrg.name,
        orgId: currentOrg.id,
        agentId: newAgentId,
        apiKey,
        inviteCode: currentOrg.inviteCode,
      });

      setSetupPrompt(prompt);
      setSetupApiKey(apiKey);
      setSetupAgentId(newAgentId);

      // Clear form and switch dialogs
      setAgentName('');
      setAgentType('Research');
      setAgentDescription('');
      setShowRegister(false);
      setShowSetup(true);
      setCopied(false);

      // Reload agents

    } catch (err) {
      console.error('Failed to register agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to register agent');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(setupPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = setupPrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground mt-1">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
          <Button
            onClick={() => setShowRegister(true)}
            className="bg-amber-600 hover:bg-amber-700 text-black"
          >
            + Register Agent
          </Button>
      </div>

      {currentOrg.inviteCode && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-950/20 px-4 py-2 text-sm">
          <span className="text-muted-foreground">Organization Invite Code:</span>
          <span className="font-bold tracking-widest text-amber-400">{currentOrg.inviteCode}</span>
          <button
            onClick={() => navigator.clipboard.writeText(currentOrg.inviteCode || '')}
            className="ml-1 text-muted-foreground hover:text-foreground"
            title="Copy invite code"
          >
            📋
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Fleet summary */}
      {!loading && agents.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total Agents", value: agents.length, icon: "🤖" },
            { label: "Online", value: agents.filter(a => a.status === 'online').length, icon: "🟢" },
            { label: "Busy", value: agents.filter(a => a.status === 'busy').length, icon: "🟡" },
            { label: "Offline", value: agents.filter(a => a.status === 'offline').length, icon: "🔴" },
            { label: "Skills", value: installedSkillCount, sub: `of ${SKILL_REGISTRY.length}`, icon: "🧩" },
          ].map(s => (
            <Card key={s.label} className="border-border">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">{s.icon}</span>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
                <p className="text-lg font-bold">{s.value}</p>
                {'sub' in s && s.sub && <p className="text-[10px] text-muted-foreground">{s.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="text-4xl mb-4">🤖</div>
          <p className="text-lg">No agents yet</p>
          <p className="text-sm mt-1">Register your first agent to get started</p>
          <Button
            onClick={() => setShowRegister(true)}
            className="mt-4"
          >
            Register First Agent
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <SpotlightCard className="p-0 hover:border-amber-300 transition-colors cursor-pointer h-full" spotlightColor="rgba(255, 191, 0, 0.08)">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-lg font-bold text-amber-700 dark:text-amber-400 overflow-hidden">
                        <img src={agent.avatarUrl || getAgentAvatarUrl(agent.name, agent.type)} alt={agent.name} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
                        <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5" title={agent.id}>
                          ID: {agent.id}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={TYPE_COLORS[agent.type] || ""}>{agent.type}</Badge>
                          <span className={`text-xs font-medium flex items-center gap-1.5 ${agent.status === "online" ? "text-emerald-400" :
                            agent.status === "busy" ? "text-amber-400" : "text-red-400"
                            }`}>
                            <span className={`w-3 h-3 rounded-full border-2 ${agent.status === "online" ? "bg-emerald-500 border-emerald-300 shadow-[0_0_6px_rgba(16,185,129,0.6)]" :
                              agent.status === "busy" ? "bg-amber-500 border-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.6)]" : "bg-red-500 border-red-300 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                              }`} />
                            {agent.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Agent bio (self-reported) or fallback to user-provided description */}
                  <CardDescription className="mb-3 line-clamp-2">
                    {agent.bio || agent.description}
                  </CardDescription>
                  {/* Agent bio shown separately if both exist */}
                  {agent.bio && agent.description && agent.bio !== agent.description && (
                    <p className="text-[10px] text-muted-foreground/70 mb-2 line-clamp-1 italic">Instructions: {agent.description}</p>
                  )}
                  {/* Reported skills (from agent) */}
                  {(agent.reportedSkills ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(agent.reportedSkills ?? []).slice(0, 4).map((skill, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                          {skill.name}
                        </Badge>
                      ))}
                      {(agent.reportedSkills ?? []).length > 4 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          +{(agent.reportedSkills ?? []).length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
                  {/* Capabilities badges (fallback if no reported skills) */}
                  {(agent.reportedSkills ?? []).length === 0 && (agent.capabilities ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(agent.capabilities ?? []).slice(0, 3).map((cap, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {cap.length > 25 ? cap.substring(0, 25) + '…' : cap}
                        </Badge>
                      ))}
                      {(agent.capabilities ?? []).length > 3 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          +{(agent.capabilities ?? []).length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                  {(() => {
                    const agentTaskList = allTasks.filter(t => t.assigneeAgentId === agent.id);
                    const doneTasks = agentTaskList.filter(t => t.status === 'done').length;
                    const agentJobList = allJobs.filter(j => j.takenByAgentId === agent.id);
                    const rate = agentTaskList.length > 0 ? Math.round((doneTasks / agentTaskList.length) * 100) : 0;
                    return (
                      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border text-center">
                        <div>
                          <div className="text-sm font-bold text-amber-600 dark:text-amber-400">{(agent.projectIds ?? []).length}</div>
                          <div className="text-[10px] text-muted-foreground">Projects</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold">{agentTaskList.length}</div>
                          <div className="text-[10px] text-muted-foreground">Tasks</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold">{agentJobList.length}</div>
                          <div className="text-[10px] text-muted-foreground">Jobs</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{rate}%</div>
                          <div className="text-[10px] text-muted-foreground">Done</div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-300"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReinvite(agent); }}
                    >
                      🔗 Re-invite
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditOpen(agent); }}
                    >
                      ✏️ Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteOpen(agent); }}
                    >
                      🗑️ Remove
                    </Button>
                  </div>
                </CardContent>
              </SpotlightCard>
            </Link>
          ))}
        </div>
      )}

      {/* Register Agent Dialog */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent >
          <DialogHeader>
            <DialogTitle>Register New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Name *</label>
              <Input
                placeholder="e.g. Alpha Trader"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegisterAgent()}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Agent Type *</label>
              <Select value={agentType} onValueChange={(value: Agent['type']) => setAgentType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{type}</span>
                        <span className="text-xs text-muted-foreground">{TYPE_DESCRIPTIONS[type]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Instructions</label>
              <Textarea
                placeholder="Describe what this agent should do, its responsibilities, and any specific instructions..."
                value={agentDescription}
                onChange={e => setAgentDescription(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">Your instructions for this agent. The agent will also write its own bio when it connects.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowRegister(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegisterAgent}
                disabled={creating || !agentName.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-black"
              >
                {creating ? 'Registering...' : 'Register Agent'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent >
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="w-16 h-16 rounded-full border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity shrink-0"
              >
                {editAvatarPreview ? (
                  <img src={editAvatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{editName?.charAt(0)?.toUpperCase() || '?'}</span>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => avatarInputRef.current?.click()} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  📷 Change Avatar
                </button>
                {editAvatarPreview && (
                  <button type="button" onClick={() => setEditAvatarPreview(null)} className="text-xs text-red-500 hover:text-red-400 ml-3">
                    Remove
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG or WebP, max 500KB</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Name *</label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Type *</label>
              <Select value={editType} onValueChange={(value: Agent['type']) => setEditType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{type}</span>
                        <span className="text-xs text-muted-foreground">{TYPE_DESCRIPTIONS[type]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Instructions</label>
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="Your instructions for this agent..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">Your instructions for this agent.</p>
            </div>

            {/* Agent Bio (read-only — written by the agent) */}
            {editAgent?.bio && (
              <div>
                <label className="text-sm font-medium mb-1 block">Agent Bio</label>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground italic">
                  {editAgent.bio}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Written by the agent on connect. Read-only.</p>
              </div>
            )}

            {/* Reported Skills (read-only — reported by the agent) */}
            {(editAgent?.reportedSkills ?? []).length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1 block">Reported Skills</label>
                <div className="flex flex-wrap gap-1.5">
                  {(editAgent?.reportedSkills ?? []).map((skill, i) => (
                    <Badge key={i} variant="secondary" className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                      {skill.name}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Self-reported by the agent. Read-only.</p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={saving || !editName.trim()} className="bg-amber-600 hover:bg-amber-700 text-black">
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Agent Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent >
          <DialogHeader>
            <DialogTitle>Remove Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Removing...' : '🗑️ Remove'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Setup Prompt Dialog — shown after successful registration */}
      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>🎉 Agent Registered!</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Agent ID</span>
                <p className="font-mono text-xs break-all">{setupAgentId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Organization</span>
                <p className="font-mono text-xs break-all">{currentOrg?.id}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">API Key</span>
                <p className="font-mono text-xs break-all">{setupApiKey}</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Setup Prompt — paste this into your OpenClaw agent
              </label>
              <pre className="bg-muted border rounded-md p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                {setupPrompt}
              </pre>
            </div>

            <div className="flex gap-2 justify-end">
              <Button asChild variant="outline">
                <a href="/plugins/swarm-connect.zip" download>
                  ⬇ Download Skill
                </a>
              </Button>
              <Button
                onClick={handleCopyPrompt}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {copied ? '✅ Copied!' : '📋 Copy Prompt'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
