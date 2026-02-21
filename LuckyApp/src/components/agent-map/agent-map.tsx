"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MapAgentNode } from "./map-agent-node";
import { MapHubNode } from "./map-hub-node";

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
  costPerRun?: number;
  activeJobName?: string;
  assignedCost?: number;
}

interface Task {
  id: string;
  status: string;
  assigneeAgentId?: string;
}

interface AgentMapProps {
  projectName: string;
  agents: Agent[];
  tasks: Task[];
}

const nodeTypes = { agentNode: MapAgentNode, hubNode: MapHubNode };

function AgentMapInner({ projectName, agents, tasks }: AgentMapProps) {
  const cx = 300;
  const cy = 250;
  const radius = 220;

  const { initialNodes, initialEdges } = useMemo(() => {
    const activeTasks = tasks.filter((t) => t.status === "in_progress");
    const doneTasks = tasks.filter((t) => t.status === "done");

    const hubNode: Node = {
      id: "hub",
      type: "hubNode",
      position: { x: cx - 110, y: cy - 50 },
      data: {
        label: "Hub",
        projectName,
        agentCount: agents.length,
        taskCount: tasks.length,
        activeCount: activeTasks.length,
        doneCount: doneTasks.length,
      },
    };

    const agentNodes: Node[] = agents.map((agent, i) => {
      const angle = (2 * Math.PI * i) / (agents.length || 1) - Math.PI / 2;
      const agentTasks = tasks.filter((t) => t.assigneeAgentId === agent.id);
      const agentActive = agentTasks.filter((t) => t.status === "in_progress");
      return {
        id: agent.id,
        type: "agentNode",
        position: {
          x: cx + radius * Math.cos(angle) - 100,
          y: cy + radius * Math.sin(angle) - 40,
        },
        data: {
          label: agent.name,
          agentName: agent.name,
          type: agent.type,
          status: agent.status,
          taskCount: agentTasks.length,
          activeCount: agentActive.length,
          costEstimate: `$${(agent.costPerRun ?? 1.5).toFixed(2)}`,
          activeJobName: agent.activeJobName,
          assignedCost: agent.assignedCost ?? 0,
        },
      };
    });

    const edges: Edge[] = agents.map((agent) => {
      const agentTasks = tasks.filter((t) => t.assigneeAgentId === agent.id);
      const hasActive = agentTasks.some((t) => t.status === "in_progress");
      const allDone = agentTasks.length > 0 && agentTasks.every((t) => t.status === "done");
      return {
        id: `hub-${agent.id}`,
        source: "hub",
        target: agent.id,
        animated: hasActive,
        style: {
          stroke: "#d97706",
          strokeWidth: 2,
          strokeDasharray: !hasActive && !allDone ? "5 5" : undefined,
        },
      };
    });

    return { initialNodes: [hubNode, ...agentNodes], initialEdges: edges };
  }, [projectName, agents, tasks]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="h-[500px] w-full rounded-lg border border-border bg-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

export default function AgentMap(props: AgentMapProps) {
  return (
    <ReactFlowProvider>
      <AgentMapInner {...props} />
    </ReactFlowProvider>
  );
}
