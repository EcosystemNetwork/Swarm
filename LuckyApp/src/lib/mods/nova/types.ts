/**
 * Amazon Nova Operator Mod — Types
 */

import type { PlannedAction, ModRunEvent } from "../types";

/** A workflow step produced by Nova */
export interface NovaWorkflowStep {
  step: number;
  action: PlannedAction;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  output?: string;
}

/** Response from the /plan endpoint */
export interface NovaPlan {
  workflowId: string;
  goal: string;
  reasoning: string;
  steps: NovaWorkflowStep[];
  estimatedDurationMs: number;
}

/** Response from the /run endpoint */
export interface NovaRunResult {
  workflowId: string;
  status: "success" | "partial" | "failed";
  steps: NovaWorkflowStep[];
  summary: string;
  events: ModRunEvent[];
  durationMs: number;
}

/** A completed run for the logs endpoint */
export interface NovaRunLog {
  id: string;
  workflowId: string;
  goal: string;
  status: "success" | "partial" | "failed";
  stepCount: number;
  durationMs: number;
  createdAt: string;
}

/** Nova mod settings */
export interface NovaSettings {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  modelId: string;
  maxStepsPerWorkflow: number;
  autoRun: boolean;
}
