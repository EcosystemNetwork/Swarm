/** Office2D — Isometric 2D floor plan with agent desks, rooms, and status indicators */
"use client";

import { useState, useRef, useCallback } from "react";
import { useOffice } from "./office-store";
import { STATUS_COLORS, DEFAULT_LAYOUT } from "./types";
import type { VisualAgent, DeskSlot, RoomConfig, AgentVisualStatus } from "./types";

const CANVAS_W = 920;
const CANVAS_H = 580;

/** Status icon mapping */
const STATUS_ICON: Record<AgentVisualStatus, string> = {
  idle: "💤",
  active: "💻",
  thinking: "🤔",
  tool_calling: "🔧",
  speaking: "💬",
  error: "⚠️",
  blocked: "🚧",
  offline: "⚪",
  spawning: "✨",
};

export function Office2D() {
  const { state, dispatch } = useOffice();
  const { agents, layout, collaborationLinks, selectedAgentId } = state;
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const agentList = Array.from(agents.values());
  const deskAgentMap = new Map<string, VisualAgent>();
  for (const a of agentList) {
    const deskIndex = agentList.indexOf(a);
    const desk = layout.desks[deskIndex];
    if (desk) deskAgentMap.set(desk.id, a);
  }

  const selectAgent = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_AGENT", id });
  }, [dispatch]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(2, z - e.deltaY * 0.001)));
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border bg-card" onWheel={handleWheel}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-full h-auto"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
      >
        {/* Background */}
        <defs>
          <pattern id="office-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(217, 33%, 14%)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={CANVAS_W} height={CANVAS_H} fill="hsl(222, 84%, 5%)" />
        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#office-grid)" />

        {/* Rooms */}
        {layout.rooms.map((room) => (
          <RoomSvg key={room.id} room={room} />
        ))}

        {/* Collaboration lines */}
        {collaborationLinks.map((link, i) => {
          const source = agents.get(link.sourceId);
          const target = agents.get(link.targetId);
          if (!source || !target) return null;
          return (
            <line
              key={i}
              x1={source.position.x + 40}
              y1={source.position.y + 30}
              x2={target.position.x + 40}
              y2={target.position.y + 30}
              stroke="#3b82f6"
              strokeWidth={1 + link.strength * 2}
              strokeDasharray="6 4"
              opacity={0.4 + link.strength * 0.4}
            />
          );
        })}

        {/* Desks */}
        {layout.desks.map((desk, i) => {
          const agent = agentList[i];
          return (
            <DeskSvg
              key={desk.id}
              desk={desk}
              agent={agent || null}
              selected={agent?.id === selectedAgentId}
              hovered={agent?.id === hoveredAgent}
              onHover={(id) => setHoveredAgent(id)}
              onSelect={(id) => selectAgent(id)}
            />
          );
        })}

        {/* Queue zone */}
        <g transform="translate(30, 490)">
          <rect width="200" height="50" rx="4" fill="hsl(217, 33%, 10%)" stroke="hsl(217, 33%, 18%)" strokeWidth="1" />
          <text x="100" y="18" textAnchor="middle" fill="hsl(215, 20%, 55%)" fontSize="9" fontWeight="500">
            QUEUE / INBOX
          </text>
          <text x="100" y="36" textAnchor="middle" fill="hsl(215, 20%, 45%)" fontSize="11">
            {agentList.filter(a => !a.currentTask && a.status !== "offline").length} idle
          </text>
        </g>
      </svg>

      {/* Hover tooltip */}
      {hoveredAgent && (
        <AgentTooltip agent={agents.get(hoveredAgent)!} />
      )}
    </div>
  );
}

function RoomSvg({ room }: { room: RoomConfig }) {
  const colors: Record<string, { bg: string; border: string }> = {
    meeting: { bg: "rgba(59, 130, 246, 0.06)", border: "rgba(59, 130, 246, 0.2)" },
    break: { bg: "rgba(34, 197, 94, 0.04)", border: "rgba(34, 197, 94, 0.15)" },
    server: { bg: "rgba(6, 182, 212, 0.04)", border: "rgba(6, 182, 212, 0.15)" },
    error_bay: { bg: "rgba(239, 68, 68, 0.06)", border: "rgba(239, 68, 68, 0.2)" },
  };
  const c = colors[room.type] || colors.meeting;

  return (
    <g>
      <rect
        x={room.position.x}
        y={room.position.y}
        width={room.width}
        height={room.height}
        rx="4"
        fill={c.bg}
        stroke={c.border}
        strokeWidth="1"
        strokeDasharray={room.type === "error_bay" ? "4 3" : "none"}
      />
      <text
        x={room.position.x + room.width / 2}
        y={room.position.y + 16}
        textAnchor="middle"
        fill="hsl(215, 20%, 50%)"
        fontSize="9"
        fontWeight="500"
      >
        {room.label.toUpperCase()}
      </text>
    </g>
  );
}

function DeskSvg({
  desk,
  agent,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  desk: DeskSlot;
  agent: VisualAgent | null;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const { x, y } = desk.position;
  const statusColor = agent ? STATUS_COLORS[agent.status] : "#374151";
  const icon = agent ? STATUS_ICON[agent.status] : "";

  return (
    <g
      className="cursor-pointer"
      onMouseEnter={() => agent && onHover(agent.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => agent && onSelect(agent.id)}
    >
      {/* Desk surface */}
      <rect
        x={x}
        y={y}
        width={80}
        height={56}
        rx="4"
        fill={selected ? "rgba(251, 191, 36, 0.08)" : hovered ? "rgba(255, 255, 255, 0.04)" : "hsl(222, 50%, 8%)"}
        stroke={selected ? "#fbbf24" : hovered ? "hsl(217, 33%, 25%)" : "hsl(217, 33%, 15%)"}
        strokeWidth={selected ? 2 : 1}
      />

      {/* Monitor */}
      <rect x={x + 25} y={y + 6} width={30} height={20} rx="2" fill="hsl(222, 50%, 12%)" stroke="hsl(217, 33%, 22%)" strokeWidth="0.5" />

      {/* Status ring */}
      {agent && (
        <circle
          cx={x + 40}
          cy={y + 42}
          r={8}
          fill="none"
          stroke={statusColor}
          strokeWidth={selected ? 2.5 : 1.5}
          opacity={agent.status === "offline" ? 0.3 : 0.8}
        >
          {(agent.status === "active" || agent.status === "thinking") && (
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
          )}
          {agent.status === "error" && (
            <animate attributeName="r" values="8;10;8" dur="1s" repeatCount="indefinite" />
          )}
        </circle>
      )}

      {/* Agent avatar indicator */}
      {agent && agent.status !== "offline" && (
        <text x={x + 40} y={y + 46} textAnchor="middle" fontSize="10">
          {icon}
        </text>
      )}

      {/* Name label */}
      <text
        x={x + 40}
        y={y + 56 + 12}
        textAnchor="middle"
        fill={agent ? "hsl(210, 40%, 85%)" : "hsl(215, 20%, 35%)"}
        fontSize="8"
        fontWeight={agent ? "500" : "400"}
      >
        {agent ? truncate(agent.name, 12) : "Empty"}
      </text>
    </g>
  );
}

function AgentTooltip({ agent }: { agent: VisualAgent }) {
  const color = STATUS_COLORS[agent.status];
  return (
    <div className="absolute top-2 left-2 bg-popover/95 backdrop-blur border border-border rounded-md p-3 shadow-lg z-20 max-w-[220px] pointer-events-none">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium">{agent.name}</span>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Status: <span className="capitalize" style={{ color }}>{agent.status}</span></p>
        {agent.currentTask && <p>Task: {truncate(agent.currentTask, 40)}</p>}
        {agent.model && <p>Model: {agent.model}</p>}
        <p>Zone: {agent.zone.replace("_", " ")}</p>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}
