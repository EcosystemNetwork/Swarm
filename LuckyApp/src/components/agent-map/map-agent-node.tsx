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
  [key: string]: unknown;
}

export function MapAgentNode({ data }: { data: MapAgentNodeData }) {
  const icon = TYPE_ICONS[data.type] || "🤖";
  const dot = STATUS_DOT[data.status] || "🔴";

  return (
    <div className="rounded-lg border-2 border-amber-600 bg-card px-4 py-3 shadow-lg min-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-amber-600" />
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-foreground">
          {icon} {data.type} Agent
        </span>
        <span>{dot}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{data.agentName}</p>
      <div className="border-t border-border my-1" />
      <p className="text-xs text-muted-foreground mt-1">
        {data.taskCount} tasks · {data.activeCount} active
      </p>
      <p className="text-xs text-muted-foreground">Est. {data.costEstimate}/run</p>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-600" />
    </div>
  );
}
