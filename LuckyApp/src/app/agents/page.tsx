"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import { createAgent, updateAgent, deleteAgent, type Agent } from "@/lib/firestore";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";

const TYPE_COLORS: Record<string, string> = {
  Research: "bg-amber-100 text-amber-700 border-amber-200",
  Trading: "bg-emerald-100 text-emerald-700 border-green-200",
  Operations: "bg-purple-100 text-purple-700 border-purple-200",
  Support: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Analytics: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Scout: "bg-amber-100 text-amber-700 border-amber-200",
};

const AGENT_TYPES: Agent['type'][] = ['Research', 'Trading', 'Operations', 'Support', 'Analytics', 'Scout'];

const TYPE_DESCRIPTIONS: Record<Agent['type'], string> = {
  Research: "Information gathering and analysis",
  Trading: "Market analysis and trading operations",
  Operations: "Process automation and management",
  Support: "Customer service and assistance",
  Analytics: "Data analysis and insights",
  Scout: "Reconnaissance and monitoring",
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
  return `## Swarm Connect — Secure Agent Setup (Plugin v3)

You've been invited to join **${p.orgName}** on the **Swarm** enterprise AI fleet platform as agent **"${p.agentName}"** (${p.agentType}).

### 🔒 Security Architecture
Swarm uses enterprise-grade secure communication:
- **WSS (WebSocket Secure)** — encrypted real-time connection to the Swarm Hub
- **JWT Authentication** — short-lived tokens (15 min) with automatic refresh
- **TLS 1.3** — all data encrypted in transit
- **Firestore backup** — messages persisted for reliability
- No inbound ports needed — all connections are outbound from your agent

---

**Execute ALL steps below now:**

### Step 0: Clean previous installation (if any)
\`\`\`bash
rm -rf ~/.openclaw/skills/swarm-connect ~/.swarm
# Remove old swarm cron jobs if they exist:
openclaw cron list 2>/dev/null | grep -i swarm && echo "⚠️ Remove old cron jobs: openclaw cron remove --id <job-id>"
# Kill old daemon if running:
kill $(cat ~/.swarm/daemon.pid 2>/dev/null) 2>/dev/null
\`\`\`

### Step 1: Install Swarm Connect plugin
\`\`\`bash
mkdir -p ~/.openclaw/skills/swarm-connect/scripts
cd ~/.openclaw/skills/swarm-connect
curl -L -o scripts/swarm.mjs https://swarm.perkos.xyz/swarm-connect/swarm-v3.mjs
curl -L -o package.json https://swarm.perkos.xyz/swarm-connect/package-v3.json
npm install
\`\`\`

### Step 2: Register with the platform
\`\`\`bash
node ~/.openclaw/skills/swarm-connect/scripts/swarm.mjs register \\
  --org ${p.orgId} \\
  --name "${p.agentName}" \\
  --type "${p.agentType}" \\
  --api-key ${p.apiKey} \\
  --agent-id ${p.agentId}
\`\`\`

### Step 3: Verify registration
\`\`\`bash
node ~/.openclaw/skills/swarm-connect/scripts/swarm.mjs status
\`\`\`
You should see your agent info and status "online". If not, check your org ID and API key.

### Step 4: Test connectivity
\`\`\`bash
node ~/.openclaw/skills/swarm-connect/scripts/swarm.mjs chat poll
\`\`\`
If you see channel info or "No new messages" → connection works. Errors → check internet and Node.js 18+.

### Step 5: Start the real-time daemon
The daemon maintains a persistent secure connection to the Swarm Hub. It listens for messages and triggers you to respond instantly.

**IMPORTANT:** You MUST set your OpenClaw gateway token so the daemon can trigger your responses. Find your token in your openclaw.json config file:
\`\`\`bash
# Find your gateway token:
grep -A2 '"auth"' ~/.openclaw/openclaw.json
\`\`\`

Then start the daemon with the token:
\`\`\`bash
mkdir -p ~/.swarm
# Replace YOUR_TOKEN with the actual token from your openclaw.json
export OPENCLAW_GATEWAY_TOKEN=YOUR_TOKEN
nohup node ~/.openclaw/skills/swarm-connect/scripts/swarm.mjs daemon > ~/.swarm/daemon.log 2>&1 &
echo $! > ~/.swarm/daemon.pid
\`\`\`

### Step 6: Verify daemon is running
\`\`\`bash
sleep 3 && cat ~/.swarm/daemon.log
\`\`\`
You should see "🟢 Daemon running. Listening for messages in real-time."

### Step 7: Report back to the user
**IMPORTANT:** Once all steps are complete, send a confirmation message to the user who gave you this prompt. Include:
- ✅ Plugin installed successfully (or ❌ with error details)
- ✅ Registered as "${p.agentName}" (${p.agentType})
- ✅ Connected to Swarm Hub via WSS (or 📡 Firestore fallback)
- ✅ Daemon running — listening for real-time messages
- Agent ID: ${p.agentId}
- Org: ${p.orgName}

If any step failed, clearly explain what went wrong so the operator can help troubleshoot.

---

### How Communication Works
1. **Daemon connects** to Swarm Hub via secure WebSocket (WSS)
2. **Human sends message** in a project channel on the dashboard
3. **Hub routes message** to all agents in that channel instantly
4. **Your daemon receives it** and triggers your OpenClaw agent to respond
5. **Your response** is sent back through the Hub to the channel

All messages are encrypted in transit. Your API key is only used once during registration — after that, JWT tokens handle auth with automatic rotation.

### Troubleshooting
| Problem | Solution |
|---------|----------|
| Plugin install fails | Make sure Node.js 18+ and npm are available |
| Register fails | Verify org ID and API key are correct |
| No channels found | Ask the operator to assign you to a project on the dashboard |
| Daemon crashes | Check \`~/.swarm/daemon.log\` for errors, then restart |
| Connection drops | Daemon auto-reconnects — check log for details |

**Platform:** https://swarm.perkos.xyz
**Agent ID:** ${p.agentId}
**Org:** ${p.orgName} (${p.orgId})${p.inviteCode ? `\n**Invite Code:** ${p.inviteCode}` : ''}`;
}

export default function AgentsPage() {
  const [showRegister, setShowRegister] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const { currentOrg } = useOrg();
  const [agents, setAgents] = useState<Agent[]>([]);
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
  const [saving, setSaving] = useState(false);

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
    setShowEdit(true);
  };

  const handleEditSave = async () => {
    if (!editAgent || !editName.trim()) return;
    try {
      setSaving(true);
      await updateAgent(editAgent.id, {
        name: editName.trim(),
        type: editType,
        description: editDescription.trim(),
      });
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

  const handleRegisterAgent = async () => {
    if (!currentOrg || !agentName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      const apiKeyForNew = crypto.randomUUID();

      const newAgentId = await createAgent({
        orgId: currentOrg.id,
        name: agentName.trim(),
        type: agentType,
        description: agentDescription.trim() || TYPE_DESCRIPTIONS[agentType],
        capabilities: [TYPE_DESCRIPTIONS[agentType]],
        status: 'offline',
        projectIds: [],
        apiKey: apiKeyForNew,
        createdAt: new Date(),
      });

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
        <div>
          <BlurText text="🤖 Agent Fleet" className="text-3xl font-bold tracking-tight" delay={80} animateBy="letters" />
          <p className="text-muted-foreground mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BlurText text="🤖 Agent Fleet" className="text-3xl font-bold tracking-tight" delay={80} animateBy="letters" />
          <p className="text-muted-foreground mt-1">
            Monitor and manage your enterprise AI agents
          </p>
        </div>
        <Button
          onClick={() => setShowRegister(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white"
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
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg font-bold text-amber-700">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={TYPE_COLORS[agent.type] || ""}>{agent.type}</Badge>
                          <span className={`text-xs font-medium flex items-center gap-1.5 ${
                            agent.status === "online" ? "text-emerald-400" : 
                            agent.status === "busy" ? "text-amber-400" : "text-red-400"
                          }`}>
                            <span className={`w-3 h-3 rounded-full border-2 ${
                              agent.status === "online" ? "bg-emerald-500 border-emerald-300 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : 
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
                  <CardDescription className="mb-3 line-clamp-2">{agent.description}</CardDescription>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                    <div>
                      <div className="text-xs text-muted-foreground">Projects</div>
                      <div className="text-lg font-bold text-amber-600">
                        {agent.projectIds.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Capabilities</div>
                      <div className="text-lg font-bold text-foreground">{agent.capabilities.length}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
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
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                placeholder={`Default: ${TYPE_DESCRIPTIONS[agentType]}`}
                value={agentDescription}
                onChange={e => setAgentDescription(e.target.value)}
                rows={3}
              />
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
                className="bg-amber-600 hover:bg-amber-700"
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
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={saving || !editName.trim()} className="bg-amber-600 hover:bg-amber-700">
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
                className="bg-amber-500 hover:bg-amber-600"
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
