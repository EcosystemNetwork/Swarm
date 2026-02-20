"use client";

import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { AgentType } from "@/lib/mock-data";

interface RegisterAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AGENT_TYPES: AgentType[] = ["Crypto", "Sports", "Esports", "Events", "Quant", "Scout"];

export function RegisterAgentDialog({ open, onOpenChange }: RegisterAgentDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AgentType>("Crypto");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");

  const handleRegister = () => {
    setName("");
    setType("Crypto");
    setDescription("");
    setCapabilities("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Register Agent</DialogTitle>
        <DialogDescription>Add a new AI agent to your fleet.</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent Name *</Label>
          <Input
            id="agent-name"
            placeholder="e.g. CryptoHawk"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-type">Agent Type</Label>
          <Select
            id="agent-type"
            value={type}
            onChange={(e) => setType(e.target.value as AgentType)}
          >
            {AGENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-desc">Description</Label>
          <Textarea
            id="agent-desc"
            placeholder="What does this agent specialize in?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-caps">Capabilities (comma-separated)</Label>
          <Input
            id="agent-caps"
            placeholder="e.g. sentiment-analysis, price-prediction"
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
          />
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          onClick={handleRegister}
          disabled={!name.trim()}
          className="bg-green-500 hover:bg-green-600 text-white"
        >
          Register Agent
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
