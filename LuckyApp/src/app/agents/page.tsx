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
import { getAgentsByOrg, createAgent, type Agent } from "@/lib/firestore";

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
  return `You are now connected to the Swarm platform as agent "${p.agentName}" (${p.agentType}).

Organization: ${p.orgName} (ID: ${p.orgId})
Invite Code: ${p.inviteCode || 'N/A'}
Agent ID: ${p.agentId}
Platform: https://swarm.perkos.xyz

To set up, install the Swarm Connect skill:
1. Download: https://swarm.perkos.xyz/plugins/swarm-connect.zip
2. Extract to ~/.openclaw/skills/swarm-connect/
3. Run: cd ~/.openclaw/skills/swarm-connect && npm install

Register your agent:
  node ~/.openclaw/skills/swarm-connect/scripts/swarm.mjs register --org ${p.orgId} --name "${p.agentName}" --type "${p.agentType}" --api-key ${p.apiKey}

Check status:
  node ~/.openclaw/skills/swarm-connect/scripts/swarm.mjs status

Your tasks will appear when assigned via the Swarm dashboard.`;
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

  // Setup prompt state (shown after successful registration)
  const [setupPrompt, setSetupPrompt] = useState('');
  const [setupApiKey, setSetupApiKey] = useState('');
  const [setupAgentId, setSetupAgentId] = useState('');

  const loadAgents = async () => {
    if (!currentOrg) return;

    try {
      setLoading(true);
      setError(null);
      const agentsData = await getAgentsByOrg(currentOrg.id);
      setAgents(agentsData);
    } catch (err) {
      console.error("Failed to load agents:", err);
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await loadAgents();
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
          <h1 className="text-3xl font-bold tracking-tight">🤖 Agent Fleet</h1>
          <p className="text-muted-foreground mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🤖 Agent Fleet</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage your enterprise AI agents
          </p>
        </div>
        <Button
          onClick={() => setShowRegister(true)}
          className="bg-amber-600 hover:bg-amber-600 text-white"
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
              <Card className="hover:border-amber-300 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg font-bold text-amber-700">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{agent.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={TYPE_COLORS[agent.type] || ""}>{agent.type}</Badge>
                          <span className={`text-xs flex items-center gap-1 ${
                            agent.status === "online" ? "text-emerald-600" : 
                            agent.status === "busy" ? "text-orange-600" : "text-muted-foreground"
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              agent.status === "online" ? "bg-emerald-500" : 
                              agent.status === "busy" ? "bg-orange-500" : "bg-muted"
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReinvite(agent); }}
                  >
                    🔗 Re-invite Agent
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Register Agent Dialog */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent>
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
                className="bg-amber-600 hover:bg-amber-600"
              >
                {creating ? 'Registering...' : 'Register Agent'}
              </Button>
            </div>
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
