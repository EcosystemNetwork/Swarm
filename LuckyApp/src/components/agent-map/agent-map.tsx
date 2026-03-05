/** Agent Map Canvas — React Flow graph visualization of agents, hub, and job nodes with connections. */
"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MapAgentNode } from "./map-agent-node";
import { MapHubNode } from "./map-hub-node";
import { MapJobNode } from "./map-job-node";
import { createWorkflowNodeType } from "./map-workflow-node";
import { MapConditionNode, MapSwitchNode, MapMergeNode } from "./map-logic-node";
import { MapStickyNode } from "./map-sticky-node";
import { MapPromptNode } from "./map-prompt-node";
import { MapCustomEdge } from "./map-custom-edge";
import { MapContextMenu, buildCanvasMenuActions, buildNodeMenuActions } from "./map-context-menu";
import { withNodeWrapper } from "./map-node-wrapper";
import { AgentMapPalette, type DockPosition } from "./agent-map-palette";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PanelLeftClose, PanelLeftOpen, Maximize, Trash2, Play, Plus, Minus, LocateFixed, Map } from "lucide-react";

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
  currencySymbol?: string;
}

// Wrap workflow nodes with hover toolbar + execution states
const wrappedWorkflow = (key: string) => withNodeWrapper(createWorkflowNodeType(key));

const nodeTypes = {
  // Data-driven nodes (protected — no delete/duplicate)
  agentNode: MapAgentNode,
  hubNode: MapHubNode,
  jobNode: MapJobNode,
  // Prompt input
  mapPrompt: withNodeWrapper(MapPromptNode),
  // Triggers
  mapTriggerManual: wrappedWorkflow("mapTriggerManual"),
  mapTriggerWebhook: wrappedWorkflow("mapTriggerWebhook"),
  mapTriggerSchedule: wrappedWorkflow("mapTriggerSchedule"),
  mapTriggerJobComplete: wrappedWorkflow("mapTriggerJobComplete"),
  // Logic
  mapCondition: withNodeWrapper(MapConditionNode),
  mapSwitch: withNodeWrapper(MapSwitchNode),
  mapMerge: withNodeWrapper(MapMergeNode),
  // Actions
  mapHttpRequest: wrappedWorkflow("mapHttpRequest"),
  mapCodeScript: wrappedWorkflow("mapCodeScript"),
  mapDispatchJob: wrappedWorkflow("mapDispatchJob"),
  mapSendMessage: wrappedWorkflow("mapSendMessage"),
  // Flow control
  mapDelay: wrappedWorkflow("mapDelay"),
  mapLoop: wrappedWorkflow("mapLoop"),
  mapErrorHandler: wrappedWorkflow("mapErrorHandler"),
  // AI
  mapLlmCall: wrappedWorkflow("mapLlmCall"),
  mapSummarizer: wrappedWorkflow("mapSummarizer"),
  mapClassifier: wrappedWorkflow("mapClassifier"),
  // Annotations
  mapSticky: MapStickyNode,
};

const edgeTypes = {
  mapCustomEdge: MapCustomEdge,
};

let mapNodeId = 0;
const getMapNodeId = () => `map_wf_${mapNodeId++}`;

function AgentMapInner({ projectName: _projectName, agents, tasks, jobs = [], onAssign, onDispatch, executing = false, currencySymbol = "$" }: AgentMapProps) {
  void _projectName; // reserved for future use
  const [assignmentEdges, setAssignmentEdges] = useState<Edge[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [dockPosition, setDockPosition] = useState<DockPosition>("left");
  const [userWorkflowNodes, setUserWorkflowNodes] = useState<Node[]>([]);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [miniMapColor, setMiniMapColor] = useState<"default" | "mono" | "warm">("default");

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);

  const rfInstance = useReactFlow();

  // Quick dispatch state
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchPrompt, setDispatchPrompt] = useState("");
  const [dispatchPriority, setDispatchPriority] = useState<"low" | "medium" | "high">("medium");
  const [dispatchReward, setDispatchReward] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);

  const openJobs = useMemo(() => jobs.filter((j) => j.status === "open"), [jobs]);

  const { initialNodes, initialEdges } = useMemo(() => {
    // Agent nodes — left side, stacked vertically
    const agentStartX = 80;
    const agentStartY = 80;
    const agentSpacing = 100;

    const agentNodes: Node[] = agents.map((agent, i) => {
      const agentTasks = tasks.filter((t) => t.assigneeAgentId === agent.id);
      const agentActive = agentTasks.filter((t) => t.status === "in_progress");

      return {
        id: agent.id,
        type: "agentNode",
        position: { x: agentStartX, y: agentStartY + i * agentSpacing },
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
          currencySymbol,
        },
      };
    });

    // Prompt node — right side, vertically centered
    const agentBlockHeight = Math.max(0, (agents.length - 1) * agentSpacing);
    const startX = 500;
    const startY = agentStartY + agentBlockHeight / 2;

    const promptNode: Node = {
      id: "prompt-start",
      type: "mapPrompt",
      position: { x: startX, y: startY },
      data: { label: "Prompt", prompt: "" },
    };

    // Edges from each agent → prompt node
    const startEdges: Edge[] = agents.map((agent) => ({
      id: `start-${agent.id}`,
      source: agent.id,
      target: "prompt-start",
      animated: false,
      style: {
        stroke: "#d97706",
        strokeWidth: 2,
        strokeDasharray: "5 5",
      },
    }));

    return {
      initialNodes: [...agentNodes, promptNode],
      initialEdges: startEdges,
    };
  }, [agents, tasks, currencySymbol]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([...initialEdges, ...assignmentEdges]);

  // Sync nodes/edges when data changes — preserve user-dropped workflow nodes
  useEffect(() => {
    setNodes([...initialNodes, ...userWorkflowNodes]);
  }, [initialNodes, userWorkflowNodes, setNodes]);

  useEffect(() => {
    setEdges([...initialEdges, ...assignmentEdges]);
  }, [initialEdges, setEdges, assignmentEdges]);

  // Handle new connections — any node to any node
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Prevent duplicate edges
      const exists = edges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (exists) return;

      setEdges((eds) => addEdge({
        ...connection,
        animated: true,
        style: { stroke: "#d97706", strokeWidth: 2 },
      }, eds));
    },
    [edges, setEdges]
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

  // ─── Drag-and-drop from palette ───
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type");
      const rawData = event.dataTransfer.getData("application/reactflow-data");
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(rawData);
      } catch {
        data = { label: type };
      }

      const newNode: Node = {
        id: getMapNodeId(),
        type,
        position,
        data,
      };

      setUserWorkflowNodes((prev) => [...prev, newNode]);
    },
    [reactFlowInstance]
  );

  // ─── Context menu handlers ───
  const isUserNode = useCallback((nodeId: string) => nodeId.startsWith("map_wf_"), []);

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleAddSticky = useCallback((screenX: number, screenY: number) => {
    if (!reactFlowInstance) return;
    const position = reactFlowInstance.screenToFlowPosition({ x: screenX, y: screenY });
    const newNode: Node = {
      id: getMapNodeId(),
      type: "mapSticky",
      position,
      data: { label: "Note", content: "", color: "yellow", width: 200, height: 120 },
      style: { width: 200, height: 120 },
    };
    setUserWorkflowNodes((prev) => [...prev, newNode]);
  }, [reactFlowInstance]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (!isUserNode(nodeId)) return;
    setUserWorkflowNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
  }, [isUserNode, setNodes]);

  const handleDuplicateNode = useCallback((nodeId: string) => {
    if (!isUserNode(nodeId)) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const newNode: Node = {
      id: getMapNodeId(),
      type: node.type,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data },
    };
    setUserWorkflowNodes((prev) => [...prev, newNode]);
  }, [isUserNode, nodes]);

  const handleToggleDisable = useCallback((nodeId: string) => {
    setNodes((nds) => nds.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, disabled: !n.data.disabled } } : n
    ));
  }, [setNodes]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Delete selected user nodes + selected edges
      if (e.key === "Delete" || e.key === "Backspace") {
        const selectedNodes = nodes.filter((n) => n.selected && isUserNode(n.id));
        const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);

        if (selectedNodes.length > 0 || selectedEdgeIds.length > 0) {
          e.preventDefault();
          selectedNodes.forEach((n) => handleDeleteNode(n.id));
          if (selectedEdgeIds.length > 0) {
            setEdges((eds) => eds.filter((edge) => !selectedEdgeIds.includes(edge.id)));
          }
        }
      }

      // Ctrl+A — select all
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, isUserNode, handleDeleteNode, setNodes, setEdges]);

  // ─── Edge delete event listener ───
  useEffect(() => {
    const handleEdgeDelete = (e: Event) => {
      const { edgeId } = (e as CustomEvent).detail;
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      setAssignmentEdges((prev) => prev.filter((edge) => edge.id !== edgeId));
    };
    window.addEventListener("map-edge-delete", handleEdgeDelete);
    return () => window.removeEventListener("map-edge-delete", handleEdgeDelete);
  }, [setEdges]);

  // Build context menu actions
  const contextMenuActions = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.nodeId) {
      return buildNodeMenuActions({
        onDuplicate: () => handleDuplicateNode(contextMenu.nodeId!),
        onDelete: () => handleDeleteNode(contextMenu.nodeId!),
        onToggleDisable: () => handleToggleDisable(contextMenu.nodeId!),
        onCopy: () => { /* future: clipboard */ },
        isDisabled: !!nodes.find((n) => n.id === contextMenu.nodeId)?.data?.disabled,
        isProtected: !isUserNode(contextMenu.nodeId!),
      });
    }
    return buildCanvasMenuActions({
      onAddSticky: handleAddSticky,
      onSelectAll: () => setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))),
      onFitView: () => rfInstance.fitView({ duration: 300 }),
      menuX: contextMenu.x,
      menuY: contextMenu.y,
    });
  }, [contextMenu, nodes, isUserNode, handleDuplicateNode, handleDeleteNode, handleToggleDisable, handleAddSticky, setNodes, rfInstance]);

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

  const maxNodes = Math.max(agents.length, openJobs.length);
  const canvasHeight = Math.max(500, Math.min(900, 300 + maxNodes * 80));

  const isHorizontalDock = dockPosition === "top" || dockPosition === "bottom";

  // Handle dock drop zones — detect where palette was dragged
  const handleDockDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/palette-dock")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleDockDrop = useCallback((position: DockPosition) => (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/palette-dock")) {
      e.preventDefault();
      setDockPosition(position);
    }
  }, []);

  // Palette element
  const paletteEl = showPalette ? (
    <AgentMapPalette agents={agents} dockPosition={dockPosition} onDockChange={setDockPosition} />
  ) : null;

  // Canvas element
  const canvasEl = (
    <div className="flex-1 min-h-0 min-w-0 relative overflow-hidden" style={{ width: 0 }}>
      {/* Dock drop zones — visible during palette drag */}
      {showPalette && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-8 z-10 opacity-0 hover:opacity-100 transition-opacity"
            onDragOver={handleDockDragOver}
            onDrop={handleDockDrop("left")}
          >
            <div className="h-full w-1 bg-amber-500/30 rounded-r" />
          </div>
          <div
            className="absolute inset-y-0 right-0 w-8 z-10 opacity-0 hover:opacity-100 transition-opacity"
            onDragOver={handleDockDragOver}
            onDrop={handleDockDrop("right")}
          >
            <div className="h-full w-1 bg-amber-500/30 rounded-l ml-auto" />
          </div>
          <div
            className="absolute inset-x-0 top-0 h-8 z-10 opacity-0 hover:opacity-100 transition-opacity"
            onDragOver={handleDockDragOver}
            onDrop={handleDockDrop("top")}
          >
            <div className="w-full h-1 bg-amber-500/30 rounded-b" />
          </div>
          <div
            className="absolute inset-x-0 bottom-0 h-8 z-10 opacity-0 hover:opacity-100 transition-opacity"
            onDragOver={handleDockDragOver}
            onDrop={handleDockDrop("bottom")}
          >
            <div className="w-full h-1 bg-amber-500/30 rounded-t mt-auto" />
          </div>
        </>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={closeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: "mapCustomEdge",
          animated: true,
          style: { stroke: "#d97706", strokeWidth: 2 },
        }}
        edgesFocusable
        edgesReconnectable
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ maxZoom: 1.5, minZoom: 0.3 }}
        proOptions={{ hideAttribution: true }}
        className="bg-muted"
      >
        <Background variant={BackgroundVariant.Dots} color="#d4d4d4" gap={20} size={1.5} />

        {/* Custom zoom controls — styled to match theme */}
        <Panel position="bottom-left">
          <div className="flex flex-col gap-0.5 bg-card/90 backdrop-blur border border-border rounded-lg shadow-sm overflow-hidden">
            <button
              onClick={() => rfInstance.zoomIn({ duration: 200 })}
              className="p-2 hover:bg-accent transition-colors border-b border-border/50"
              title="Zoom in"
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => rfInstance.zoomOut({ duration: 200 })}
              className="p-2 hover:bg-accent transition-colors border-b border-border/50"
              title="Zoom out"
            >
              <Minus className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => rfInstance.fitView({ duration: 300 })}
              className="p-2 hover:bg-accent transition-colors"
              title="Fit view"
            >
              <LocateFixed className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </Panel>

        {/* MiniMap — hideable with color modes */}
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => {
              if (miniMapColor === "mono") return "#a0a0a0";
              if (miniMapColor === "warm") {
                if (node.type === "agentNode") return "#f59e0b";
                if (node.type === "mapSticky") return "#eab308";
                return "#fb923c";
              }
              if (node.type === "agentNode") return "#fbbf24";
              if (node.type === "mapSticky") return "#eab308";
              if (node.type === "mapPrompt" || node.type === "mapTriggerManual") return "#f59e0b";
              return "#60a5fa";
            }}
            style={{
              background: miniMapColor === "default" ? "#1e293b" : miniMapColor === "mono" ? "#18181b" : "#1c1917",
            }}
            maskColor={
              miniMapColor === "default" ? "rgba(30, 41, 59, 0.7)"
                : miniMapColor === "mono" ? "rgba(24, 24, 27, 0.7)"
                : "rgba(28, 25, 23, 0.7)"
            }
            className="!border !border-border !rounded-lg !shadow-sm"
          />
        )}

        {/* Canvas toolbar panel — top right */}
        <Panel position="top-right">
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur border border-border rounded-lg px-2 py-1.5 shadow-sm">
            <Badge variant="outline" className="text-[10px] font-medium">
              {userWorkflowNodes.length} node{userWorkflowNodes.length !== 1 ? "s" : ""}
            </Badge>
            <div className="w-px h-4 bg-border" />
            <button
              onClick={() => rfInstance.fitView({ duration: 300 })}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Fit View"
            >
              <Maximize className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {userWorkflowNodes.length > 0 && (
              <button
                onClick={() => {
                  setUserWorkflowNodes([]);
                  setNodes(initialNodes);
                }}
                className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                title="Clear workflow nodes"
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            )}
            <button
              onClick={() => {
                userWorkflowNodes.forEach((n) => {
                  rfInstance.updateNodeData(n.id, { executionState: "running" });
                });
                setTimeout(() => {
                  userWorkflowNodes.forEach((n) => {
                    rfInstance.updateNodeData(n.id, { executionState: "success" });
                  });
                  setTimeout(() => {
                    userWorkflowNodes.forEach((n) => {
                      rfInstance.updateNodeData(n.id, { executionState: "idle" });
                    });
                  }, 2000);
                }, 2000);
              }}
              className="p-1.5 rounded hover:bg-emerald-500/10 transition-colors"
              title="Run workflow (demo)"
              disabled={userWorkflowNodes.length === 0}
            >
              <Play className="w-3.5 h-3.5 text-emerald-500" />
            </button>
            <div className="w-px h-4 bg-border" />
            {/* MiniMap toggle + color */}
            <button
              onClick={() => setShowMiniMap(!showMiniMap)}
              className={`p-1.5 rounded transition-colors ${
                showMiniMap ? "bg-amber-500/10 text-amber-500" : "hover:bg-accent text-muted-foreground"
              }`}
              title={showMiniMap ? "Hide minimap" : "Show minimap"}
            >
              <Map className="w-3.5 h-3.5" />
            </button>
            {showMiniMap && (["default", "mono", "warm"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setMiniMapColor(c)}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  miniMapColor === c ? "scale-110 border-amber-500" : "border-border hover:border-muted-foreground"
                }`}
                style={{
                  background: c === "default" ? "#60a5fa" : c === "mono" ? "#888" : "#f59e0b",
                }}
                title={`${c.charAt(0).toUpperCase() + c.slice(1)} colors`}
              />
            ))}
          </div>
        </Panel>
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && (
        <MapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenuActions}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col rounded-lg border border-border overflow-hidden bg-card">
      {/* Main canvas area — flex direction changes based on dock position */}
      <div
        className={`flex min-h-0 overflow-hidden ${
          isHorizontalDock ? "flex-col" : "flex-row"
        }`}
        style={{ height: `${canvasHeight}px` }}
      >
        {(dockPosition === "left" || dockPosition === "top") && paletteEl}
        {canvasEl}
        {(dockPosition === "right" || dockPosition === "bottom") && paletteEl}
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
                {totalCost.toLocaleString()} {currencySymbol}
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
              : `Execute${assignments.length > 0 ? ` (${assignments.length} jobs)` : ""}`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPalette(!showPalette)}
            title={showPalette ? "Hide Node Palette" : "Show Node Palette"}
          >
            {showPalette ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Quick Dispatch Panel */}
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
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Reward ({currencySymbol})</label>
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
