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
  Research: "bg-blue-100 text-blue-700 border-blue-200",
  Trading: "bg-green-100 text-green-700 border-green-200",
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

export default function AgentsPage() {
  const [showRegister, setShowRegister] = useState(false);
  const { currentOrg } = useOrg();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [agentName, setAgentName] = useState('');
  const [agentType, setAgentType] = useState<Agent['type']>('Research');
  const [agentDescription, setAgentDescription] = useState('');

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
  }, [currentOrg]);

  const handleRegisterAgent = async () => {
    if (!currentOrg || !agentName.trim()) return;

    try {
      setCreating(true);
      setError(null);

      await createAgent({
        orgId: currentOrg.id,
        name: agentName.trim(),
        type: agentType,
        description: agentDescription.trim() || TYPE_DESCRIPTIONS[agentType],
        capabilities: [TYPE_DESCRIPTIONS[agentType]], // Start with default capability
        status: 'offline', // New agents start offline
        projectIds: [],
        createdAt: new Date(),
      });

      // Clear form and close dialog
      setAgentName('');
      setAgentType('Research');
      setAgentDescription('');
      setShowRegister(false);

      // Reload agents
      await loadAgents();
    } catch (err) {
      console.error('Failed to register agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to register agent');
    } finally {
      setCreating(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🤖 Agent Fleet</h1>
          <p className="text-gray-500 mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🤖 Agent Fleet</h1>
          <p className="text-gray-500 mt-1">
            Monitor and manage your enterprise AI agents
          </p>
        </div>
        <Button
          onClick={() => setShowRegister(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          + Register Agent
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <p>Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
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
              <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{agent.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={TYPE_COLORS[agent.type] || ""}>{agent.type}</Badge>
                          <span className={`text-xs flex items-center gap-1 ${
                            agent.status === "online" ? "text-green-600" : 
                            agent.status === "busy" ? "text-orange-600" : "text-gray-400"
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              agent.status === "online" ? "bg-green-500" : 
                              agent.status === "busy" ? "bg-orange-500" : "bg-gray-300"
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
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                    <div>
                      <div className="text-xs text-gray-500">Projects</div>
                      <div className="text-lg font-bold text-blue-600">
                        {agent.projectIds.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Capabilities</div>
                      <div className="text-lg font-bold text-gray-900">{agent.capabilities.length}</div>
                    </div>
                  </div>
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
                        <span className="text-xs text-gray-500">{TYPE_DESCRIPTIONS[type]}</span>
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
                className="bg-blue-600 hover:bg-blue-700"
              >
                {creating ? 'Registering...' : 'Register Agent'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}