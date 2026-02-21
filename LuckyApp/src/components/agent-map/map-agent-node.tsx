"use client";

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
  [key: string]: unknown;
}

export function MapAgentNode({ data }: { data: MapAgentNodeData }) {
  const icon = TYPE_ICONS[data.type] || "🤖";
  const dot = STATUS_DOT[data.status] || "🔴";
  const isWorking = data.status === 'busy' && data.activeJobName;

  return (
    <div className={`rounded-lg border-2 bg-card px-4 py-3 shadow-lg min-w-[200px] transition-all ${
      isWorking ? 'border-amber-500 animate-glow-pulse' : 'border-amber-600'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-amber-600" />
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-foreground">
          {icon} {data.type} Agent
        </span>
        <span className="flex items-center gap-1">
          {isWorking && <span className="animate-spin text-xs">⚙️</span>}
          {dot}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{data.agentName}</p>
      {isWorking && (
        <div className="mb-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
          <p className="text-[10px] text-amber-500 font-medium truncate">📋 {data.activeJobName}</p>
        </div>
      )}
      <div className="border-t border-border my-1" />
      <p className="text-xs text-muted-foreground mt-1">
        {data.taskCount} tasks · {data.activeCount} active
      </p>
      <p className="text-xs text-muted-foreground">Est. {data.costEstimate}/run</p>
      {(data.assignedCost ?? 0) > 0 && (
        <p className="text-xs font-semibold text-amber-500 mt-0.5">💰 {data.assignedCost?.toLocaleString()} HBAR assigned</p>
      )}
      {/* Right handle for connecting to jobs */}
      <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-3 !h-3" id="job-source" />
      <Handle type="source" position={Position.Bottom} className="!bg-amber-600" />
    </div>
  );
}
