"use client";

import { Handle, Position } from "@xyflow/react";

interface MapHubNodeData {
  label: string;
  projectName: string;
  agentCount: number;
  taskCount: number;
  activeCount: number;
  doneCount: number;
  [key: string]: unknown;
}

export function MapHubNode({ data }: { data: MapHubNodeData }) {
  return (
    <div className="rounded-xl bg-amber-600 px-6 py-4 shadow-xl min-w-[220px] text-center">
      <Handle type="source" position={Position.Bottom} className="!bg-amber-900" />
      <p className="text-base font-bold text-amber-950">⚡ Project Hub</p>
      <p className="text-sm text-amber-900 font-medium">&ldquo;{data.projectName}&rdquo;</p>
      <div className="border-t border-amber-500 my-2" />
      <p className="text-xs text-amber-950">
        {data.agentCount} agents · {data.taskCount} tasks
      </p>
      <p className="text-xs text-amber-950">
        {data.activeCount} active · {data.doneCount} done
      </p>
      <Handle type="target" position={Position.Top} className="!bg-amber-900" />
    </div>
  );
}
