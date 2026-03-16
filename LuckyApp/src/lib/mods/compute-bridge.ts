/**
 * Mod ↔ Compute Bridge
 *
 * Maps PlannedAction (from Gemini/Nova AI planners) to Compute ActionEnvelopes
 * and executes them sequentially on a real cloud desktop via the provider pipeline.
 *
 * Falls back to mock execution when no computerId is provided (demo mode).
 */

import type { ActionType } from "../compute/types";
import type { PlannedAction } from "./types";
import { buildActionEnvelope, executeComputeAction } from "../compute/actions";
import { startComputeSession, endComputeSession } from "../compute/sessions";
import { getComputer } from "../compute/firestore";

// ═══════════════════════════════════════════════════════════════
// Action Mapping
// ═══════════════════════════════════════════════════════════════

interface MappedAction {
  actionType: ActionType;
  payload: Record<string, unknown>;
}

/**
 * Parse "x,y" or "(x, y)" coordinate strings from a PlannedAction target.
 * Returns null if no coordinates found.
 */
function parseCoordinates(target?: string): { x: number; y: number } | null {
  if (!target) return null;
  // Match patterns like "123,456", "(123, 456)", "x:123 y:456"
  const commaMatch = target.match(/\(?(\d+)\s*,\s*(\d+)\)?/);
  if (commaMatch) return { x: parseInt(commaMatch[1]), y: parseInt(commaMatch[2]) };
  const xyMatch = target.match(/x\s*[:=]\s*(\d+).*y\s*[:=]\s*(\d+)/i);
  if (xyMatch) return { x: parseInt(xyMatch[1]), y: parseInt(xyMatch[2]) };
  return null;
}

/**
 * Map a PlannedAction (mod format) to a Compute ActionEnvelope payload.
 */
export function mapPlannedAction(action: PlannedAction): MappedAction {
  switch (action.type) {
    case "click": {
      const coords = parseCoordinates(action.target);
      return {
        actionType: "click",
        payload: coords
          ? { x: coords.x, y: coords.y }
          : { description: action.target || action.description },
      };
    }

    case "type":
      return {
        actionType: "type",
        payload: { text: action.value || "" },
      };

    case "scroll": {
      const direction = action.value?.toLowerCase().includes("up") ? "up" : "down";
      const amountMatch = action.value?.match(/(\d+)/);
      return {
        actionType: "scroll",
        payload: {
          direction,
          amount: amountMatch ? parseInt(amountMatch[1]) : 3,
        },
      };
    }

    case "navigate":
      // Open URL in the desktop browser via xdg-open
      return {
        actionType: "bash",
        payload: { command: `xdg-open "${action.value || action.target || ""}"` },
      };

    case "wait": {
      const ms = parseInt(action.value || "1000") || 1000;
      return {
        actionType: "wait",
        payload: { ms: Math.min(ms, 30000) }, // cap at 30s
      };
    }

    case "screenshot":
      return {
        actionType: "screenshot",
        payload: {},
      };

    case "bash":
      return {
        actionType: "bash",
        payload: { command: action.value || "" },
      };

    default:
      return {
        actionType: "bash",
        payload: { command: `echo "Unknown action type: ${action.type}"` },
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// Execution Bridge
// ═══════════════════════════════════════════════════════════════

export interface ModActionResult {
  action: PlannedAction;
  status: "success" | "failed" | "skipped";
  message: string;
  durationMs: number;
  data?: Record<string, unknown>;
}

export interface ModExecutionResult {
  sessionId: string;
  computeSessionId: string | null;
  results: ModActionResult[];
  summary: string;
  durationMs: number;
}

/**
 * Execute a list of PlannedActions on a real cloud desktop.
 *
 * Creates a compute session, executes actions sequentially,
 * and ends the session when complete. If an action fails,
 * remaining actions are marked as "skipped".
 */
export async function executeModActions(opts: {
  computerId: string;
  actions: PlannedAction[];
  actorId: string;
  modId: string;
}): Promise<ModExecutionResult> {
  const { computerId, actions, actorId, modId } = opts;
  const startTime = Date.now();

  // Verify computer exists and is running
  const computer = await getComputer(computerId);
  if (!computer) throw new Error("Computer not found");
  if (computer.status !== "running") {
    throw new Error(`Computer is not running (status: ${computer.status})`);
  }

  // Create a compute session for this mod execution
  const computeSessionId = await startComputeSession(
    computerId,
    computer.workspaceId,
    "agent",
    null,
    modId as "claude" | "openai" | "gemini" | "generic" | null,
  );

  const results: ModActionResult[] = [];
  let failed = false;

  for (const action of actions) {
    // Skip remaining actions after a failure
    if (failed) {
      results.push({
        action,
        status: "skipped",
        message: "Skipped due to prior failure",
        durationMs: 0,
      });
      continue;
    }

    const mapped = mapPlannedAction(action);
    const envelope = buildActionEnvelope(
      mapped.actionType,
      computerId,
      computeSessionId,
      { type: "model", id: modId },
      mapped.payload,
    );

    try {
      const { result } = await executeComputeAction(envelope);
      results.push({
        action,
        status: result.success ? "success" : "failed",
        message: result.success
          ? `${action.description} — completed`
          : result.error || "Action failed",
        durationMs: result.durationMs,
        data: result.data,
      });

      if (!result.success) {
        failed = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Execution error";
      results.push({
        action,
        status: "failed",
        message: msg,
        durationMs: 0,
      });
      failed = true;
    }
  }

  // End the compute session (triggers billing)
  try {
    await endComputeSession(computeSessionId);
  } catch {
    // Don't fail the whole execution if session end fails
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const totalDuration = Date.now() - startTime;

  return {
    sessionId: `mod_${Date.now()}`,
    computeSessionId,
    results,
    summary: `${successCount} of ${actions.length} actions completed successfully`,
    durationMs: totalDuration,
  };
}

// ═══════════════════════════════════════════════════════════════
// Mock Fallback (demo mode — no computer selected)
// ═══════════════════════════════════════════════════════════════

/**
 * Mock execution when no computer is available.
 * Returns simulated success for all actions.
 */
export function mockExecuteActions(actions: PlannedAction[]): ModActionResult[] {
  return actions.map((action, i) => ({
    action,
    status: "success" as const,
    message: `Step ${i + 1}: ${action.description} — simulated`,
    durationMs: 50,
  }));
}
