'use client';

import { useCallback, useRef, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Agent } from '@/lib/firestore';
import { validateWorkflow } from '@/lib/swarm-workflow';
import { nodeTypes } from './nodes';
import { NodePalette } from './node-palette';
import { PriceSummary } from './price-summary';

interface SwarmCanvasProps {
  agents: Agent[];
}

let nodeId = 0;
const getNodeId = () => `swarm_node_${nodeId++}`;

function SwarmCanvasInner({ agents }: SwarmCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReturnType<typeof Object> | null>(null);
  const [executing, setExecuting] = useState(false);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({
        ...connection,
        animated: true,
        style: { stroke: '#d97706', strokeWidth: 2 },
      }, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type');
      const dataString = event.dataTransfer.getData('application/reactflow-data');

      if (!type || !reactFlowInstance) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const position = (reactFlowInstance as any).screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const data = JSON.parse(dataString);

      const newNode: Node = {
        id: getNodeId(),
        type,
        position,
        data,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  const validation = useMemo(
    () => validateWorkflow(nodes, edges),
    [nodes, edges]
  );

  const agentNodeCount = nodes.filter(n => n.type === 'agent').length;

  const handleExecute = async () => {
    if (!validation.isValid) return;
    setExecuting(true);
    // Future: serialize workflow to Firestore, trigger backend execution
    await new Promise(resolve => setTimeout(resolve, 2000));
    setExecuting(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)] rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className="flex flex-1 min-h-0">
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: '#d97706', strokeWidth: 2 },
            }}
            fitView
            className="bg-gray-50"
          >
            <Background color="#d4d4d4" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'trigger') return '#f59e0b';
                if (node.type === 'output') return '#10b981';
                return '#fbbf24';
              }}
            />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="bg-white/90 border border-gray-200 rounded-lg px-6 py-4 text-center shadow-sm mt-20">
                  <p className="text-gray-600 font-medium">
                    Drag nodes from the palette to build your swarm workflow
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Start with a Trigger, add Agents, and end with an Output
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        <NodePalette agents={agents} />
      </div>

      <PriceSummary
        validation={validation}
        agentCount={agentNodeCount}
        onExecute={handleExecute}
        executing={executing}
      />
    </div>
  );
}

export function SwarmCanvas({ agents }: SwarmCanvasProps) {
  return (
    <ReactFlowProvider>
      <SwarmCanvasInner agents={agents} />
    </ReactFlowProvider>
  );
}
