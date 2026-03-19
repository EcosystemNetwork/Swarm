/**
 * Shared Mod Types — Common event schema for all Swarm mods
 */

/** Unified run event used by all mods */
export interface ModRunEvent {
  modId: "gemini-live-agent" | "amazon-nova-operator";
  sessionId: string;
  step: number;
  type: "analyze" | "plan" | "execute" | "complete" | "error";
  label: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

/** A structured action from an AI planner */
export interface PlannedAction {
  type: "click" | "type" | "scroll" | "navigate" | "wait" | "screenshot" | "bash";
  target?: string;
  value?: string;
  description: string;
  confidence?: number;
}

/** Result of executing a single action */
export interface ActionResult {
  action: PlannedAction;
  status: "success" | "failed" | "skipped";
  message?: string;
  durationMs?: number;
}

/** Session state shared across mod panels */
export interface ModSession {
  id: string;
  modId: string;
  status: "idle" | "analyzing" | "planning" | "executing" | "complete" | "error";
  task?: string;
  events: ModRunEvent[];
  createdAt: string;
}
