/** Map Hub Node — Custom React Flow node representing the central project hub/orchestrator. */
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
    <div className="relative rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 px-6 py-4 shadow-2xl min-w-[220px] text-center">
      {/* Glow ring */}
      <div className="absolute -inset-1 rounded-xl bg-amber-500/20 blur-md -z-10" />
      <Handle type="source" position={Position.Left} className="!bg-amber-900" id="left" />
      <Handle type="source" position={Position.Right} className="!bg-amber-900" id="right" />
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
