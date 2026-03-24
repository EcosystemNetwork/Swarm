/** OpenClaw Office Sim — Shared type definitions */

export type AgentVisualStatus =
  | "idle"
  | "active"
  | "thinking"
  | "tool_calling"
  | "speaking"
  | "error"
  | "blocked"
  | "offline"
  | "spawning";

export type AgentZone =
  | "desk"
  | "meeting"
  | "server"
  | "break"
  | "corridor"
  | "error_bay";

export interface Position {
  x: number;
  y: number;
}

export interface VisualAgent {
  id: string;
  name: string;
  status: AgentVisualStatus;
  position: Position;
  targetPosition: Position;
  zone: AgentZone;
  currentTask: string | null;
  speechBubble: string | null;
  parentAgentId: string | null;
  childAgentIds: string[];
  lastActiveAt: number;
  toolCallCount: number;
  model: string | null;
}

export interface CollaborationLink {
  sourceId: string;
  targetId: string;
  strength: number; // 0-1
  lastActivityAt: number;
}

export type ViewMode = "2d" | "3d" | "background";
export type PanelType = "agent-detail" | "task-board" | "cost-metrics" | null;

export interface OfficeLayout {
  id: string;
  name: string;
  desks: DeskSlot[];
  rooms: RoomConfig[];
}

export interface DeskSlot {
  id: string;
  position: Position;
  assignedAgentId: string | null;
}

export interface RoomConfig {
  id: string;
  type: "meeting" | "server" | "break" | "error_bay";
  position: Position;
  width: number;
  height: number;
  label: string;
}

/** Status color mappings */
export const STATUS_COLORS: Record<AgentVisualStatus, string> = {
  idle: "#6b7280",
  active: "#22c55e",
  thinking: "#eab308",
  tool_calling: "#06b6d4",
  speaking: "#e5e7eb",
  error: "#ef4444",
  blocked: "#f59e0b",
  offline: "#374151",
  spawning: "#06b6d4",
};

/** Default floor plan */
export const DEFAULT_LAYOUT: OfficeLayout = {
  id: "startup-loft",
  name: "Startup Loft",
  desks: [
    { id: "desk-1", position: { x: 80, y: 200 }, assignedAgentId: null },
    { id: "desk-2", position: { x: 240, y: 200 }, assignedAgentId: null },
    { id: "desk-3", position: { x: 400, y: 200 }, assignedAgentId: null },
    { id: "desk-4", position: { x: 560, y: 200 }, assignedAgentId: null },
    { id: "desk-5", position: { x: 80, y: 360 }, assignedAgentId: null },
    { id: "desk-6", position: { x: 240, y: 360 }, assignedAgentId: null },
    { id: "desk-7", position: { x: 400, y: 360 }, assignedAgentId: null },
    { id: "desk-8", position: { x: 560, y: 360 }, assignedAgentId: null },
  ],
  rooms: [
    { id: "meeting-a", type: "meeting", position: { x: 680, y: 60 }, width: 200, height: 160, label: "Meeting Room A" },
    { id: "break-room", type: "break", position: { x: 680, y: 280 }, width: 200, height: 120, label: "Break Room" },
    { id: "error-bay", type: "error_bay", position: { x: 680, y: 440 }, width: 200, height: 100, label: "Error Bay" },
  ],
};
