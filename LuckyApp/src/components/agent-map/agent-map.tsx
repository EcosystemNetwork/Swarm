/** Agent Map Canvas — React Flow graph visualization of agents, hub, and job nodes with connections. */
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

export interface DispatchPayload {
  prompt: string;
  priority: "low" | "medium" | "high";
  reward: string;
  agentIds: string[];
}

interface AgentMapProps {
  projectName: string;
  agents: Agent[];
  tasks: Task[];
  jobs?: Job[];
  onAssign?: (assignments: { jobId: string; agentId: string; jobTitle: string; agentName: string }[]) => Promise<void>;
  onDispatch?: (payload: DispatchPayload) => Promise<void>;
  executing?: boolean;
}

const nodeTypes = { agentNode: MapAgentNode, hubNode: MapHubNode, jobNode: MapJobNode };

function AgentMapInner({ projectName, agents, tasks, jobs = [], onAssign, onDispatch, executing = false }: AgentMapProps) {
  const [assignmentEdges, setAssignmentEdges] = useState<Edge[]>([]);

  // Quick dispatch state
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchPrompt, setDispatchPrompt] = useState("");
  const [dispatchPriority, setDispatchPriority] = useState<"low" | "medium" | "high">("medium");
  const [dispatchReward, setDispatchReward] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);

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
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return;
      if (sourceNode.type !== "agentNode" || targetNode.type !== "jobNode") return;

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

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllAgents = () => {
    if (selectedAgentIds.size === agents.length) {
      setSelectedAgentIds(new Set());
    } else {
      setSelectedAgentIds(new Set(agents.map((a) => a.id)));
    }
  };

  const handleDispatch = async () => {
    if (!onDispatch || !dispatchPrompt.trim() || selectedAgentIds.size === 0) return;
    try {
      setDispatching(true);
      await onDispatch({
        prompt: dispatchPrompt.trim(),
        priority: dispatchPriority,
        reward: dispatchReward.trim(),
        agentIds: [...selectedAgentIds],
      });
      // Reset form
      setDispatchPrompt("");
      setDispatchPriority("medium");
      setDispatchReward("");
      setSelectedAgentIds(new Set());
      setDispatchOpen(false);
    } catch (err) {
      console.error("Dispatch failed:", err);
    } finally {
      setDispatching(false);
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
          {openJobs.length === 0 && !dispatchOpen && (
            <Badge className="bg-muted text-muted-foreground text-xs">
              No open jobs — use Quick Dispatch below to create one
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

      {/* ═══════════════ Quick Dispatch Panel ═══════════════ */}
      <div className="border-t border-border">
        <button
          onClick={() => setDispatchOpen(!dispatchOpen)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-base">🚀</span>
            Quick Dispatch — Create Job & Assign Agents
          </span>
          <span className={`transition-transform ${dispatchOpen ? "rotate-180" : ""}`}>▼</span>
        </button>

        {dispatchOpen && (
          <div className="px-4 pb-4 space-y-4 bg-muted/30">
            {/* Prompt */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Job Prompt — What should the agents do?
              </label>
              <textarea
                value={dispatchPrompt}
                onChange={(e) => setDispatchPrompt(e.target.value)}
                placeholder="e.g. Research the top 10 DeFi protocols by TVL and create a comparison report with risk analysis..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 placeholder:text-muted-foreground/50"
                disabled={dispatching}
              />
            </div>

            {/* Priority + Reward row */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
                <div className="flex gap-1.5">
                  {(["low", "medium", "high"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setDispatchPriority(p)}
                      disabled={dispatching}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${dispatchPriority === p
                          ? p === "high"
                            ? "bg-orange-500/15 border-orange-500/40 text-orange-500"
                            : p === "medium"
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                              : "bg-muted border-border text-foreground"
                          : "border-border/50 text-muted-foreground hover:border-border"
                        }`}
                    >
                      {p === "high" ? "🔥 " : p === "medium" ? "⚡ " : ""}
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-40">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Reward (HBAR)</label>
                <input
                  type="text"
                  value={dispatchReward}
                  onChange={(e) => setDispatchReward(e.target.value)}
                  placeholder="Optional"
                  disabled={dispatching}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Agent Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Select Agents ({selectedAgentIds.size}/{agents.length})
                </label>
                <button
                  onClick={selectAllAgents}
                  disabled={dispatching}
                  className="text-[11px] text-amber-500 hover:text-amber-400 transition-colors"
                >
                  {selectedAgentIds.size === agents.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No agents assigned to this project yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {agents.map((agent) => {
                    const selected = selectedAgentIds.has(agent.id);
                    const isOnline = agent.status === "online";
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgent(agent.id)}
                        disabled={dispatching}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${selected
                            ? "border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500/30"
                            : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                          }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" : "bg-red-400"
                          }`} />
                        <span className="truncate font-medium">{agent.name}</span>
                        {selected && <span className="ml-auto text-amber-500">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dispatch button */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div className="text-xs text-muted-foreground">
                {selectedAgentIds.size > 0 && dispatchPrompt.trim() && (
                  <span>
                    Will create 1 job and assign {selectedAgentIds.size} agent{selectedAgentIds.size > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDispatchOpen(false)}
                  disabled={dispatching}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDispatch}
                  disabled={dispatching || !dispatchPrompt.trim() || selectedAgentIds.size === 0 || !onDispatch}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-black font-semibold px-6"
                >
                  {dispatching ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⚙️</span> Dispatching...
                    </span>
                  ) : (
                    <span>🚀 Dispatch</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
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
