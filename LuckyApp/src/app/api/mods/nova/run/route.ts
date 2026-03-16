/**
 * POST /api/mods/nova/run — Execute a Nova workflow plan
 *
 * If computerId is provided, executes on a real cloud desktop via the Compute pipeline.
 * Otherwise falls back to mock execution (demo mode).
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { executeModActions, mockExecuteActions } from "@/lib/mods/compute-bridge";
import { createModSession, endModSession, addModRunLog } from "@/lib/mods/firestore";
import type { NovaWorkflowStep } from "@/lib/mods/nova/types";
import type { ModRunEvent } from "@/lib/mods/types";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const { workflowId, steps, computerId } = body as {
    workflowId: string;
    steps: NovaWorkflowStep[];
    computerId?: string;
  };

  if (!workflowId || !steps || !Array.isArray(steps) || steps.length === 0) {
    return Response.json({ error: "workflowId and steps are required" }, { status: 400 });
  }

  if (steps.length > 20) {
    return Response.json({ error: "Maximum 20 steps per workflow" }, { status: 400 });
  }

  // Create a mod session
  const modSessionId = await createModSession({
    modId: "amazon-nova-operator",
    userId: wallet,
    task: steps[0]?.action.description,
    computerId: computerId || undefined,
  });

  const startTime = Date.now();

  try {
    // Extract PlannedActions from workflow steps
    const plannedActions = steps.map((s) => s.action);
    let executedSteps: NovaWorkflowStep[];
    let statusLabel: "success" | "partial" | "failed";

    if (computerId) {
      // Real execution on cloud desktop
      const execution = await executeModActions({
        computerId,
        actions: plannedActions,
        actorId: wallet,
        modId: "amazon-nova-operator",
      });

      // Map results back to NovaWorkflowStep format
      executedSteps = steps.map((step, i) => {
        const result = execution.results[i];
        return {
          ...step,
          status: result
            ? (result.status as NovaWorkflowStep["status"])
            : "skipped",
          startedAt: new Date().toISOString(),
          completedAt: new Date(Date.now() + (result?.durationMs || 0)).toISOString(),
          output: result?.message || step.action.description,
        };
      });

      const successCount = executedSteps.filter((s) => s.status === "success").length;
      statusLabel = successCount === executedSteps.length ? "success" : successCount > 0 ? "partial" : "failed";
    } else {
      // Demo mode — mock execution
      const mockResults = mockExecuteActions(plannedActions);
      executedSteps = steps.map((step, i) => ({
        ...step,
        status: (mockResults[i]?.status || "success") as NovaWorkflowStep["status"],
        startedAt: new Date().toISOString(),
        completedAt: new Date(Date.now() + 50).toISOString(),
        output: `Simulated: ${step.action.description}`,
      }));
      statusLabel = "success";
    }

    const durationMs = Date.now() - startTime;
    const successCount = executedSteps.filter((s) => s.status === "success").length;

    const events: ModRunEvent[] = executedSteps.map((s) => ({
      modId: "amazon-nova-operator" as const,
      sessionId: workflowId,
      step: s.step,
      type: s.status === "success" ? "execute" as const : "error" as const,
      label: s.output || s.action.description,
      payload: { action: s.action, status: s.status },
      createdAt: s.completedAt || new Date().toISOString(),
    }));

    events.push({
      modId: "amazon-nova-operator",
      sessionId: workflowId,
      step: executedSteps.length + 1,
      type: "complete",
      label: `Workflow ${statusLabel}: ${successCount}/${executedSteps.length} steps completed`,
      createdAt: new Date().toISOString(),
    });

    const summary = `${successCount} of ${executedSteps.length} steps completed successfully`;
    await endModSession(modSessionId, summary);

    // Persist run log to Firestore
    await addModRunLog({
      modId: "amazon-nova-operator",
      userId: wallet,
      sessionId: modSessionId,
      goal: steps[0]?.action.description || workflowId,
      status: statusLabel,
      stepCount: executedSteps.length,
      durationMs,
      computerId: computerId || undefined,
    });

    return Response.json({
      ok: true,
      result: {
        workflowId,
        status: statusLabel,
        steps: executedSteps,
        summary,
        events,
        durationMs,
        live: !!computerId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Execution failed";
    await endModSession(modSessionId, `Error: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
