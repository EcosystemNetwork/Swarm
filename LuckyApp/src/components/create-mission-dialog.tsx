"use client";

import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mockSwarms, type MarketType } from "@/lib/mock-data";

interface CreateMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { title: string; description: string; marketType: MarketType; swarmId: string; targetDate: string }) => void;
}

const marketTypes: { value: MarketType; label: string; icon: string }[] = [
  { value: "crypto", label: "Crypto", icon: "₿" },
  { value: "sports", label: "Sports", icon: "⚽" },
  { value: "esports", label: "Esports", icon: "🎮" },
  { value: "events", label: "Events", icon: "🌍" },
];

export function CreateMissionDialog({ open, onOpenChange, onSubmit }: CreateMissionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [marketType, setMarketType] = useState<MarketType>("crypto");
  const [swarmId, setSwarmId] = useState(mockSwarms[0]?.id || "");
  const [targetDate, setTargetDate] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({ title, description, marketType, swarmId, targetDate });
    setTitle("");
    setDescription("");
    setMarketType("crypto");
    setTargetDate("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>🎯 Create Mission</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mission title..." />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the mission..."
            />
          </div>
          <div>
            <Label>Market Type</Label>
            <div className="flex gap-2 mt-1">
              {marketTypes.map((mt) => (
                <button
                  key={mt.value}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    marketType === mt.value
                      ? "bg-green-50 border-green-300 text-green-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setMarketType(mt.value)}
                >
                  {mt.icon} {mt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="swarm">Assign to Swarm</Label>
            <select
              id="swarm"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={swarmId}
              onChange={(e) => setSwarmId(e.target.value)}
            >
              {mockSwarms.map((s) => (
                <option key={s.id} value={s.id}>🐝 {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="targetDate">Target Date</Label>
            <Input id="targetDate" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!title.trim()} className="bg-green-600 hover:bg-green-700 text-white">
          Create Mission
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
