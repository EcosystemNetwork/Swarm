/** OpenClaw Office Sim — Shared type definitions */

/* ═══════════════════════════════════════
   Agent States & Zones
   ═══════════════════════════════════════ */

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

export type CameraMode = "orbit" | "follow" | "cinematic";

export type ViewMode = "2d" | "3d" | "background";

export type PanelType = "agent-detail" | "task-board" | "cost-metrics" | null;

/** Visual severity tier driven by utilization */
export type StressTier = "normal" | "busy" | "stressed" | "overloaded";

/* ═══════════════════════════════════════
   Core Interfaces
   ═══════════════════════════════════════ */

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
  // Enriched fields
  agentType: string | null;
  capabilities: string[];
  bio: string | null;
  asn: string | null;
  /** Department / team membership */
  department: string | null;
  /** 0.0 – 1.0 utilization metric for visual severity */
  utilization: number;
  /** Derived stress tier from utilization */
  stressTier: StressTier;
  // Custom avatar (populated from agentAvatars collection)
  modelUrl?: string;
  spriteUrl?: string;
  /** Animated sprite sheet URL (4-direction × 6-frame walk cycle) */
  spriteSheetUrl?: string;
  animationUrls?: Record<string, string>;
}

export interface CollaborationLink {
  sourceId: string;
  targetId: string;
  strength: number; // 0-1
  lastActivityAt: number;
}

/** An animated delivery between two agents */
export interface DeliveryAnimation {
  id: string;
  sourceId: string;
  targetId: string;
  progress: number; // 0-1
  type: "message" | "task" | "data";
  createdAt: number;
}

/** A particle effect in the 2D scene */
export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0-1 remaining
  maxLife: number;
  color: string;
  size: number;
  type: "spark" | "smoke" | "work" | "error";
}

export interface FilterState {
  statusFilter: AgentVisualStatus | "all";
  searchQuery: string;
}

export interface OfficeActivityEvent {
  timestamp: number;
  agentId: string;
  agentName: string;
  type: "status_change" | "error" | "recovery" | "spawn" | "despawn" | "task_start" | "task_complete";
  description: string;
}

/* ═══════════════════════════════════════
   Department Types
   ═══════════════════════════════════════ */

export type DepartmentId =
  | "engineering"
  | "design"
  | "operations"
  | "qa"
  | "research"
  | "security"
  | "unassigned";

export const DEPARTMENT_LABELS: Record<DepartmentId, string> = {
  engineering: "Engineering",
  design: "Design",
  operations: "Operations",
  qa: "QA",
  research: "Research",
  security: "Security",
  unassigned: "General",
};

/* ═══════════════════════════════════════
   Office Layout
   ═══════════════════════════════════════ */

export interface OfficeLayout {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  desks: DeskSlot[];
  rooms: RoomConfig[];
}

export interface DeskSlot {
  id: string;
  position: Position;
  assignedAgentId: string | null;
  /** Department this desk belongs to (for department-grouped layouts) */
  department?: DepartmentId;
}

export interface RoomConfig {
  id: string;
  type: "meeting" | "server" | "break" | "error_bay";
  position: Position;
  width: number;
  height: number;
  label: string;
}

/** Break room seat with orientation */
export interface BreakSpot {
  position: Position;
  facing: "up" | "down" | "left" | "right";
  furniture?: "sofa" | "table" | "counter";
}

export const BREAK_SPOTS: BreakSpot[] = [
  { position: { x: 20, y: 20 }, facing: "down", furniture: "sofa" },
  { position: { x: 60, y: 20 }, facing: "down", furniture: "sofa" },
  { position: { x: 100, y: 20 }, facing: "down" },
  { position: { x: 20, y: 60 }, facing: "right", furniture: "table" },
  { position: { x: 100, y: 60 }, facing: "left", furniture: "table" },
  { position: { x: 20, y: 90 }, facing: "up", furniture: "counter" },
  { position: { x: 60, y: 90 }, facing: "up" },
  { position: { x: 100, y: 90 }, facing: "up" },
];

/* ═══════════════════════════════════════
   Status Visual Mappings
   ═══════════════════════════════════════ */

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

export const STATUS_LABELS: Record<AgentVisualStatus, string> = {
  idle: "Idle",
  active: "Active",
  thinking: "Thinking",
  tool_calling: "Tool Call",
  speaking: "Speaking",
  error: "Error",
  blocked: "Blocked",
  offline: "Offline",
  spawning: "Spawning",
};

export const STATUS_ICONS: Record<AgentVisualStatus, string> = {
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

/** Map utilization value (0-1) to visual stress tier */
export function getStressTier(utilization: number): StressTier {
  if (utilization >= 1.0) return "overloaded";
  if (utilization >= 0.8) return "stressed";
  if (utilization >= 0.5) return "busy";
  return "normal";
}

/** Colors per stress tier for visual escalation */
export const STRESS_COLORS: Record<StressTier, { primary: string; glow: string; text: string }> = {
  normal: { primary: "#22c55e", glow: "rgba(34, 197, 94, 0.3)", text: "#86efac" },
  busy: { primary: "#eab308", glow: "rgba(234, 179, 8, 0.3)", text: "#fde047" },
  stressed: { primary: "#f97316", glow: "rgba(249, 115, 22, 0.4)", text: "#fdba74" },
  overloaded: { primary: "#ef4444", glow: "rgba(239, 68, 68, 0.5)", text: "#fca5a5" },
};

/** Icons per stress tier */
export const STRESS_ICONS: Record<StressTier, string> = {
  normal: "",
  busy: "💦",
  stressed: "😰",
  overloaded: "😵",
};

/* ═══════════════════════════════════════
   Dynamic Layout Builder
   ═══════════════════════════════════════ */

const DESK_W = 80;
const DESK_H = 56;
const DESK_GAP_X = 20;
const DESK_GAP_Y = 30;
const ROOM_PADDING = 30;
const DESKS_PER_ROW = 4;
const RIGHT_PANEL_W = 220;
const MARGIN = 30;

/**
 * Dynamically compute an office layout based on agent count.
 * Desks scale to fit; rooms are placed on the right.
 */
export function computeDynamicLayout(agentCount: number): OfficeLayout {
  const deskCount = Math.max(agentCount, 4); // min 4 desks
  const rows = Math.ceil(deskCount / DESKS_PER_ROW);
  const cols = Math.min(deskCount, DESKS_PER_ROW);

  const deskAreaW = cols * DESK_W + (cols - 1) * DESK_GAP_X;
  const deskAreaH = rows * (DESK_H + DESK_GAP_Y);
  const deskStartX = MARGIN;
  const deskStartY = MARGIN + 80; // header room

  const desks: DeskSlot[] = [];
  for (let i = 0; i < deskCount; i++) {
    const row = Math.floor(i / DESKS_PER_ROW);
    const col = i % DESKS_PER_ROW;
    desks.push({
      id: `desk-${i + 1}`,
      position: {
        x: deskStartX + col * (DESK_W + DESK_GAP_X),
        y: deskStartY + row * (DESK_H + DESK_GAP_Y),
      },
      assignedAgentId: null,
    });
  }

  const roomX = deskStartX + deskAreaW + ROOM_PADDING + 20;
  const canvasW = roomX + RIGHT_PANEL_W + MARGIN;
  const minH = deskStartY + deskAreaH + 100;

  const rooms: RoomConfig[] = [
    {
      id: "meeting-a",
      type: "meeting",
      position: { x: roomX, y: deskStartY },
      width: RIGHT_PANEL_W - 20,
      height: 140,
      label: "Meeting Room",
    },
    {
      id: "break-room",
      type: "break",
      position: { x: roomX, y: deskStartY + 160 },
      width: RIGHT_PANEL_W - 20,
      height: 120,
      label: "Break Room",
    },
    {
      id: "error-bay",
      type: "error_bay",
      position: { x: roomX, y: deskStartY + 300 },
      width: RIGHT_PANEL_W - 20,
      height: 80,
      label: "Error Bay",
    },
  ];

  const canvasH = Math.max(minH, deskStartY + 300 + 80 + MARGIN);

  return {
    id: "dynamic",
    name: `Dynamic (${deskCount} desks)`,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    desks,
    rooms,
  };
}

/* ═══════════════════════════════════════
   Legacy Static Templates
   ═══════════════════════════════════════ */

export const DEFAULT_LAYOUT: OfficeLayout = {
  id: "startup-loft",
  name: "Startup Loft",
  canvasWidth: 920,
  canvasHeight: 580,
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

export const CORPORATE_LAYOUT: OfficeLayout = {
  id: "corporate-floor",
  name: "Corporate Floor",
  canvasWidth: 1100,
  canvasHeight: 700,
  desks: [
    { id: "desk-c1", position: { x: 60, y: 160 }, assignedAgentId: null },
    { id: "desk-c2", position: { x: 210, y: 160 }, assignedAgentId: null },
    { id: "desk-c3", position: { x: 360, y: 160 }, assignedAgentId: null },
    { id: "desk-c4", position: { x: 510, y: 160 }, assignedAgentId: null },
    { id: "desk-c5", position: { x: 60, y: 310 }, assignedAgentId: null },
    { id: "desk-c6", position: { x: 210, y: 310 }, assignedAgentId: null },
    { id: "desk-c7", position: { x: 360, y: 310 }, assignedAgentId: null },
    { id: "desk-c8", position: { x: 510, y: 310 }, assignedAgentId: null },
    { id: "desk-c9", position: { x: 60, y: 460 }, assignedAgentId: null },
    { id: "desk-c10", position: { x: 210, y: 460 }, assignedAgentId: null },
    { id: "desk-c11", position: { x: 360, y: 460 }, assignedAgentId: null },
    { id: "desk-c12", position: { x: 510, y: 460 }, assignedAgentId: null },
  ],
  rooms: [
    { id: "meeting-1", type: "meeting", position: { x: 700, y: 50 }, width: 180, height: 140, label: "Meeting Room" },
    { id: "meeting-2", type: "meeting", position: { x: 700, y: 220 }, width: 180, height: 140, label: "War Room" },
    { id: "server-room", type: "server", position: { x: 700, y: 390 }, width: 180, height: 120, label: "Server Room" },
    { id: "break-room", type: "break", position: { x: 700, y: 540 }, width: 180, height: 100, label: "Break Room" },
    { id: "error-bay", type: "error_bay", position: { x: 60, y: 600 }, width: 300, height: 70, label: "Error Bay" },
  ],
};

export const LAYOUT_TEMPLATES: OfficeLayout[] = [DEFAULT_LAYOUT, CORPORATE_LAYOUT];
