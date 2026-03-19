/**
 * Gemini Live Agent Mod — Types
 */

import type { PlannedAction, ModRunEvent } from "../types";

/** Response from the /analyze endpoint */
export interface GeminiAnalysis {
  summary: string;
  elements: UIElement[];
  suggestedAction: string;
  confidence: number;
}

/** A UI element detected by Gemini */
export interface UIElement {
  label: string;
  type: "button" | "input" | "link" | "text" | "image" | "menu" | "other";
  description: string;
  interactable: boolean;
}

/** Response from the /plan endpoint */
export interface GeminiPlan {
  task: string;
  reasoning: string;
  actions: PlannedAction[];
  estimatedSteps: number;
}

/** Response from the /execute endpoint */
export interface GeminiExecutionResult {
  planId: string;
  results: {
    action: PlannedAction;
    status: "success" | "failed" | "skipped";
    message?: string;
  }[];
  summary: string;
  events: ModRunEvent[];
}

/** Gemini mod settings */
export interface GeminiSettings {
  apiKey: string;
  model: string;
  projectId?: string;
  maxActionsPerPlan: number;
  autoExecute: boolean;
}
