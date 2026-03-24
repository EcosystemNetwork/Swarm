/** AgentDetailDrawer — Slide-in panel for inspecting a single agent */
"use client";

import { X, RotateCcw, Pause, Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOffice } from "./office-store";
import { STATUS_COLORS } from "./types";
import type { VisualAgent } from "./types";

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "#6b7280";
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

export function AgentDetailDrawer() {
  const { state, dispatch } = useOffice();
  const { selectedAgentId, activePanel } = state;

  if (activePanel !== "agent-detail" || !selectedAgentId) return null;

  const agent = state.agents.get(selectedAgentId);
  if (!agent) return null;

  const close = () => dispatch({ type: "SELECT_AGENT", id: null });
  const statusColor = STATUS_COLORS[agent.status];

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full z-50 bg-background/95 backdrop-blur-xl border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={agent.status} />
          <h2 className="font-semibold truncate">{agent.name}</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={close}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Status */}
        <Section title="Status">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="capitalize text-xs"
              style={{ borderColor: statusColor + "40", color: statusColor }}
            >
              {agent.status}
            </Badge>
            <span className="text-xs text-muted-foreground capitalize">
              Zone: {agent.zone.replace("_", " ")}
            </span>
          </div>
        </Section>

        {/* Current Task */}
        <Section title="Current Task">
          {agent.currentTask ? (
            <p className="text-sm">{agent.currentTask}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No active task</p>
          )}
        </Section>

        {/* Speech Bubble */}
        {agent.speechBubble && (
          <Section title="Current Output">
            <div className="bg-muted/30 rounded-md p-3 text-sm font-mono leading-relaxed">
              {agent.speechBubble}
            </div>
          </Section>
        )}

        {/* Details */}
        <Section title="Details">
          <DetailRow label="ID" value={agent.id} mono />
          <DetailRow label="Model" value={agent.model || "—"} mono />
          <DetailRow label="Tool Calls" value={String(agent.toolCallCount)} />
          <DetailRow label="Last Active" value={formatTime(agent.lastActiveAt)} />
          {agent.parentAgentId && (
            <DetailRow label="Parent" value={agent.parentAgentId} mono />
          )}
          {agent.childAgentIds.length > 0 && (
            <DetailRow label="Sub-agents" value={String(agent.childAgentIds.length)} />
          )}
        </Section>

        {/* Actions */}
        <Section title="Actions">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
            <Button variant="outline" size="sm" className="text-xs">
              <Pause className="h-3 w-3 mr-1" />
              Pause
            </Button>
            <Button variant="outline" size="sm" className="text-xs">
              <ExternalLink className="h-3 w-3 mr-1" />
              View Logs
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} truncate max-w-[200px]`}>{value}</span>
    </div>
  );
}

function formatTime(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}
