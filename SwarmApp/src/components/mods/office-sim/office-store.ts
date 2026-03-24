/** OpenClaw Office Sim — Central state store using React context + useReducer */
"use client";

import { createContext, useContext } from "react";
import type {
  VisualAgent,
  CollaborationLink,
  OfficeLayout,
  ViewMode,
  PanelType,
  AgentVisualStatus,
} from "./types";
import { DEFAULT_LAYOUT } from "./types";

export interface OfficeState {
  agents: Map<string, VisualAgent>;
  collaborationLinks: CollaborationLink[];
  layout: OfficeLayout;
  viewMode: ViewMode;
  activePanel: PanelType;
  selectedAgentId: string | null;
  connected: boolean;
  metrics: {
    activeCount: number;
    taskCount: number;
    errorCount: number;
  };
}

export type OfficeAction =
  | { type: "SET_AGENTS"; agents: VisualAgent[] }
  | { type: "UPDATE_AGENT"; id: string; patch: Partial<VisualAgent> }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "SET_PANEL"; panel: PanelType }
  | { type: "SELECT_AGENT"; id: string | null }
  | { type: "SET_CONNECTED"; connected: boolean }
  | { type: "SET_LINKS"; links: CollaborationLink[] };

export const initialState: OfficeState = {
  agents: new Map(),
  collaborationLinks: [],
  layout: DEFAULT_LAYOUT,
  viewMode: "2d",
  activePanel: null,
  selectedAgentId: null,
  connected: false,
  metrics: { activeCount: 0, taskCount: 0, errorCount: 0 },
};

export function officeReducer(state: OfficeState, action: OfficeAction): OfficeState {
  switch (action.type) {
    case "SET_AGENTS": {
      const agents = new Map<string, VisualAgent>();
      let activeCount = 0;
      let errorCount = 0;
      let taskCount = 0;
      for (const a of action.agents) {
        agents.set(a.id, a);
        if (a.status === "active" || a.status === "thinking" || a.status === "tool_calling" || a.status === "speaking") activeCount++;
        if (a.status === "error") errorCount++;
        if (a.currentTask) taskCount++;
      }
      return { ...state, agents, metrics: { activeCount, errorCount, taskCount } };
    }
    case "UPDATE_AGENT": {
      const agents = new Map(state.agents);
      const existing = agents.get(action.id);
      if (existing) agents.set(action.id, { ...existing, ...action.patch });
      return { ...state, agents };
    }
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.mode };
    case "SET_PANEL":
      return { ...state, activePanel: action.panel };
    case "SELECT_AGENT":
      return { ...state, selectedAgentId: action.id, activePanel: action.id ? "agent-detail" : null };
    case "SET_CONNECTED":
      return { ...state, connected: action.connected };
    case "SET_LINKS":
      return { ...state, collaborationLinks: action.links };
    default:
      return state;
  }
}

/** Map raw Swarm agent status to visual status */
export function mapAgentStatus(raw: string): AgentVisualStatus {
  switch (raw) {
    case "online": return "active";
    case "busy": return "thinking";
    case "error": return "error";
    case "offline": return "offline";
    default: return "idle";
  }
}

export const OfficeContext = createContext<{
  state: OfficeState;
  dispatch: React.Dispatch<OfficeAction>;
} | null>(null);

export function useOffice() {
  const ctx = useContext(OfficeContext);
  if (!ctx) throw new Error("useOffice must be used within OfficeProvider");
  return ctx;
}
