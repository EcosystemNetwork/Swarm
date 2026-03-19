/**
 * POST /api/mods/gemini/execute — Execute a Gemini action plan
 *
 * If computerId is provided, executes on a real cloud desktop via the Compute pipeline.
 * Otherwise falls back to mock execution (demo mode).
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { executeModActions, mockExecuteActions } from "@/lib/mods/compute-bridge";
import { createModSession, endModSession } from "@/lib/mods/firestore";
import type { PlannedAction, ModRunEvent } from "@/lib/mods/types";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const { actions, sessionId, computerId } = body as {
    actions: PlannedAction[];
    sessionId?: string;
    computerId?: string;
  };

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return Response.json({ error: "actions array is required" }, { status: 400 });
  }

  if (actions.length > 20) {
    return Response.json({ error: "Maximum 20 actions per execution" }, { status: 400 });
  }

  // Create a mod session for persistence
  const modSessionId = await createModSession({
    modId: "gemini-live-agent",
    userId: wallet,
    computerId: computerId || undefined,
  });

  const sid = sessionId || modSessionId;

  try {
    let results: { action: PlannedAction; status: "success" | "failed" | "skipped"; message: string; durationMs?: number; data?: Record<string, unknown> }[];
    let summary: string;

    if (computerId) {
      // Real execution on cloud desktop
      const execution = await executeModActions({
        computerId,
        actions,
        actorId: wallet,
        modId: "gemini-live-agent",
      });
      results = execution.results;
      summary = execution.summary;
    } else {
      // Demo mode — mock execution
      results = mockExecuteActions(actions);
      summary = `${results.length} of ${results.length} actions simulated (demo mode)`;
    }

    const events: ModRunEvent[] = results.map((r, i) => ({
      modId: "gemini-live-agent",
      sessionId: sid,
      step: i + 1,
      type: r.status === "success" ? "execute" : "error",
      label: r.message || r.action.description,
      payload: { action: r.action, result: r.status },
      createdAt: new Date().toISOString(),
    }));

    events.push({
      modId: "gemini-live-agent",
      sessionId: sid,
      step: results.length + 1,
      type: "complete",
      label: `Executed ${results.filter((r) => r.status === "success").length}/${results.length} actions`,
      createdAt: new Date().toISOString(),
    });

    await endModSession(modSessionId, summary);

    return Response.json({
      ok: true,
      result: {
        planId: sid,
        results,
        summary,
        events,
        live: !!computerId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Execution failed";
    await endModSession(modSessionId, `Error: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
