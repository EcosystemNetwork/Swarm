"use client";

import { useMemo, useCallback, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MapAgentNode } from "./map-agent-node";
import { MapHubNode } from "./map-hub-node";
import { MapJobNode } from "./map-job-node";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

interface Job {
  id: string;
  title: string;
  reward?: string;
  priority: string;
  requiredSkills: string[];
  status: string;
}

interface AgentMapProps {
  projectName: string;
  agents: Agent[];
  tasks: Task[];
  jobs?: Job[];
  onAssign?: (assignments: { jobId: string; agentId: string; jobTitle: string; agentName: string }[]) => Promise<void>;
  executing?: boolean;
}

const nodeTypes = { agentNode: MapAgentNode, hubNode: MapHubNode, jobNode: MapJobNode };

function AgentMapInner({ projectName, agents, tasks, jobs = [], onAssign, executing = false }: AgentMapProps) {
  const [assignmentEdges, setAssignmentEdges] = useState<Edge[]>([]);

  const openJobs = jobs.filter((j) => j.status === "open");

  const { initialNodes, initialEdges } = useMemo(() => {
    const activeTasks = tasks.filter((t) => t.status === "in_progress");
    const doneTasks = tasks.filter((t) => t.status === "done");

    // Hub node in the center
    const hubNode: Node = {
      id: "hub",
      type: "hubNode",
      position: { x: 300, y: 200 },
      data: {
        label: "Hub",
        projectName,
        agentCount: agents.length,
        taskCount: tasks.length,
        activeCount: activeTasks.length,
        doneCount: doneTasks.length,
      },
    };

    // Agent nodes on the left
    const agentNodes: Node[] = agents.map((agent, i) => {
      const agentTasks = tasks.filter((t) => t.assigneeAgentId === agent.id);
      const agentActive = agentTasks.filter((t) => t.status === "in_progress");
      return {
        id: agent.id,
        type: "agentNode",
        position: { x: 20, y: 20 + i * 160 },
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

    // Job nodes on the right
    const jobNodes: Node[] = openJobs.map((job, i) => ({
      id: `job-${job.id}`,
      type: "jobNode",
      position: { x: 620, y: 20 + i * 140 },
      data: {
        label: job.title,
        jobTitle: job.title,
        priority: job.priority,
        reward: job.reward || "",
        status: job.status,
        requiredSkills: job.requiredSkills ?? [],
      },
    }));

    // Hub → agent edges
    const hubEdges: Edge[] = agents.map((agent) => {
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

    return {
      initialNodes: [hubNode, ...agentNodes, ...jobNodes],
      initialEdges: hubEdges,
    };
  }, [projectName, agents, tasks, openJobs]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([...initialEdges, ...assignmentEdges]);

  // Handle new connections (agent → job assignments)
  const onConnect = useCallback(
    (connection: Connection) => {
      // Only allow connections from agents to jobs
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return;
      if (sourceNode.type !== "agentNode" || targetNode.type !== "jobNode") return;

      // Prevent duplicate assignment to the same job
      const existingAssignment = assignmentEdges.find(
        (e) => e.target === connection.target
      );
      if (existingAssignment) return;

      const newEdge: Edge = {
        ...connection,
        id: `assign-${connection.source}-${connection.target}`,
        animated: true,
        style: { stroke: "#10b981", strokeWidth: 3 },
      } as Edge;

      setAssignmentEdges((prev) => [...prev, newEdge]);
      setEdges((eds) => addEdge({
        ...connection,
        animated: true,
        style: { stroke: "#10b981", strokeWidth: 3 },
      }, eds));
    },
    [nodes, assignmentEdges, setEdges]
  );

  // Compute assignments from edges
  const assignments = useMemo(() => {
    return assignmentEdges
      .map((edge) => {
        const agentId = edge.source;
        const jobId = edge.target?.replace("job-", "") || "";
        const agent = agents.find((a) => a.id === agentId);
        const job = openJobs.find((j) => j.id === jobId);
        if (!agent || !job) return null;
        return { jobId: job.id, agentId: agent.id, jobTitle: job.title, agentName: agent.name };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [assignmentEdges, agents, openJobs]);

  const totalCost = useMemo(() => {
    return assignments.reduce((sum, a) => {
      const job = openJobs.find((j) => j.id === a.jobId);
      const reward = parseFloat((job?.reward || "0").replace(/[^0-9.]/g, ""));
      return sum + (isNaN(reward) ? 0 : reward);
    }, 0);
  }, [assignments, openJobs]);

  const handleClearAssignments = () => {
    setAssignmentEdges([]);
    setEdges(initialEdges);
  };

  const handleExecute = async () => {
    if (onAssign && assignments.length > 0) {
      await onAssign(assignments);
      setAssignmentEdges([]);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-border overflow-hidden bg-card">
      <div className="h-[500px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: "#10b981", strokeWidth: 3 },
          }}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-muted"
        >
          <Background color="#d4d4d4" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === "hubNode") return "#f59e0b";
              if (node.type === "jobNode") return "#10b981";
              return "#fbbf24";
            }}
          />
        </ReactFlow>
      </div>

      {/* Assignment Summary Bar */}
      <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Assignments: </span>
            <span className="font-semibold">{assignments.length}</span>
          </div>
          {totalCost > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">Total Cost: </span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {totalCost.toLocaleString()} HBAR
              </span>
            </div>
          )}
          {assignments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {assignments.map((a) => (
                <Badge key={a.jobId} variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                  {a.agentName} → {a.jobTitle}
                </Badge>
              ))}
            </div>
          )}
          {assignments.length === 0 && openJobs.length > 0 && (
            <Badge className="bg-muted text-muted-foreground text-xs">
              Draw connections from agents to jobs to assign
            </Badge>
          )}
          {openJobs.length === 0 && (
            <Badge className="bg-muted text-muted-foreground text-xs">
              No open jobs to assign
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {assignments.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAssignments}
              disabled={executing}
            >
              Clear
            </Button>
          )}
          <Button
            onClick={handleExecute}
            disabled={assignments.length === 0 || executing || !onAssign}
            className="bg-amber-600 hover:bg-amber-700 text-black disabled:opacity-50"
          >
            {executing
              ? "Executing..."
              : `Execute Swarm${assignments.length > 0 ? ` (${assignments.length} jobs)` : ""}`}
          </Button>
        </div>
      </div>
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
