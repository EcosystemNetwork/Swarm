"use client";

import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mockAgents } from "@/lib/mock-data";

interface CreateSwarmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSwarmDialog({ open, onOpenChange }: CreateSwarmDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleCreate = () => {
    // Mock create — just close dialog
    setName("");
    setDescription("");
    setSelectedAgents([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Create Swarm</DialogTitle>
        <DialogDescription>Set up a new prediction swarm with your agents.</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-2">
          <Label htmlFor="swarm-name">Swarm Name *</Label>
          <Input
            id="swarm-name"
            placeholder="e.g. Polymarket Alpha"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="swarm-desc">Description</Label>
          <Textarea
            id="swarm-desc"
            placeholder="What is this swarm's strategy?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Select Agents</Label>
          <div className="grid grid-cols-2 gap-2">
            {mockAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => toggleAgent(agent.id)}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left text-sm transition-colors ${
                  selectedAgents.includes(agent.id)
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${agent.status === "online" ? "bg-green-500" : "bg-gray-300"}`} />
                <div>
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-xs text-gray-500">{agent.type}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={!name.trim()}
          className="bg-green-500 hover:bg-green-600 text-white"
        >
          Create Swarm
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
