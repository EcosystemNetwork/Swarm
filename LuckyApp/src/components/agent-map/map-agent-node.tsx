/** Map Agent Node — Custom React Flow node for an agent showing name, status, and skill badges. */
"use client";

import { useState } from "react";
import { Handle, Position } from "@xyflow/react";

const TYPE_ICONS: Record<string, string> = {
  Research: "🔬",
  Trading: "📈",
  Operations: "⚙️",
  Support: "🛟",
  Analytics: "📊",
  Scout: "🔍",
};

const STATUS_DOT: Record<string, string> = {
  online: "🟢",
  busy: "🟡",
  offline: "🔴",
};

const STATUS_LABEL: Record<string, string> = {
  online: "Online",
  busy: "Busy",
  offline: "Offline",
};

interface MapAgentNodeData {
  label: string;
  agentName: string;
  type: string;
  status: string;
  taskCount: number;
  activeCount: number;
  costEstimate: string;
  activeJobName?: string;
  assignedCost?: number;
  currencySymbol?: string;
  [key: string]: unknown;
}

export function MapAgentNode({ data }: { data: MapAgentNodeData }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TYPE_ICONS[data.type] || "🤖";
  const dot = STATUS_DOT[data.status] || "🔴";
  const isWorking = data.status === 'busy' && data.activeJobName;
  const doneCount = data.taskCount - data.activeCount;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
      className={`rounded-lg border-2 bg-card px-3 py-2.5 shadow-lg cursor-pointer transition-all duration-200 ${
        expanded ? 'min-w-[240px] max-w-[280px]' : 'min-w-[180px] max-w-[220px]'
      } ${isWorking ? 'border-amber-500 animate-glow-pulse' : 'border-amber-600'}`}
    >
      <Handle type="target" position={Position.Right} className="!bg-amber-600" />

      {/* Header — always visible */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-foreground truncate">
          {icon} {data.type} Agent
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {isWorking && <span className="animate-spin text-xs">⚙️</span>}
          {dot}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{data.agentName}</p>

      {/* Collapsed summary */}
      {!expanded && (
        <>
          <div className="border-t border-border my-1" />
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.taskCount} tasks · {data.activeCount} active
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Click to expand</p>
        </>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Status row */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50">
            <span className="text-[11px] font-medium text-foreground">{dot} {STATUS_LABEL[data.status] || data.status}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">Est. {data.costEstimate}/run</span>
          </div>

          {/* Active job */}
          {isWorking && (
            <div className="px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] text-muted-foreground mb-0.5">Active Job</p>
              <p className="text-[11px] text-amber-500 font-medium">{data.activeJobName}</p>
            </div>
          )}

          {/* Task breakdown */}
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="px-1 py-1 rounded bg-muted/40">
              <p className="text-sm font-bold text-foreground">{data.taskCount}</p>
              <p className="text-[9px] text-muted-foreground">Total</p>
            </div>
            <div className="px-1 py-1 rounded bg-amber-500/10">
              <p className="text-sm font-bold text-amber-500">{data.activeCount}</p>
              <p className="text-[9px] text-muted-foreground">Active</p>
            </div>
            <div className="px-1 py-1 rounded bg-emerald-500/10">
              <p className="text-sm font-bold text-emerald-500">{doneCount}</p>
              <p className="text-[9px] text-muted-foreground">Done</p>
            </div>
          </div>

          {/* Assigned cost */}
          {(data.assignedCost ?? 0) > 0 && (
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] text-muted-foreground">Assigned Budget</span>
              <span className="text-xs font-bold text-amber-500">
                {data.assignedCost?.toLocaleString()} {data.currencySymbol || "$"}
              </span>
            </div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-3 !h-3" id="job-source" />
    </div>
  );
}
