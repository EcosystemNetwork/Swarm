/** Map Job Node — Custom React Flow node representing a dispatched job with status and progress. */
"use client";

import { Handle, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
};

interface MapJobNodeData {
  label: string;
  jobTitle: string;
  priority: string;
  reward: string;
  status: string;
  requiredSkills: string[];
  assignedAgent?: string;
  currencySymbol?: string;
  [key: string]: unknown;
}

export function MapJobNode({ data }: { data: MapJobNodeData }) {
  const isOpen = data.status === "open";
  const isAssigned = !!data.assignedAgent;

  return (
    <div
      className={`rounded-lg border-2 bg-card px-3 py-2.5 shadow-lg min-w-[180px] transition-all ${
        isAssigned
          ? "border-amber-500 animate-glow-pulse"
          : isOpen
          ? "border-emerald-500"
          : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-3 !h-3" />

      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-foreground truncate flex-1">
          💼 {data.jobTitle}
        </span>
        <Badge variant="outline" className={`text-[10px] ml-2 shrink-0 ${PRIORITY_COLORS[data.priority] || ""}`}>
          {data.priority}
        </Badge>
      </div>

      {data.reward && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 w-fit mb-2">
          <span className="text-sm font-bold text-amber-500">{data.reward}</span>
          <span className="text-[10px] text-amber-500/70">{data.currencySymbol || "$"}</span>
        </div>
      )}

      {data.requiredSkills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {data.requiredSkills.slice(0, 3).map((s) => (
            <Badge key={s} variant="outline" className="text-[10px]">
              {s}
            </Badge>
          ))}
          {data.requiredSkills.length > 3 && (
            <Badge variant="outline" className="text-[10px]">
              +{data.requiredSkills.length - 3}
            </Badge>
          )}
        </div>
      )}

      {isAssigned && (
        <p className="text-[10px] text-amber-500 font-medium">🤖 → {data.assignedAgent}</p>
      )}

      {isOpen && !isAssigned && (
        <p className="text-[10px] text-emerald-500">⬅ Connect an agent to assign</p>
      )}
    </div>
  );
}
