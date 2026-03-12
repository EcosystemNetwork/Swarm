/**
 * POST /api/agents/:parentId/delegate/:childId
 *
 * Delegate a task from parent agent to child agent.
 * Body: { orgId, taskId?, reason? }
 */

import { NextRequest } from "next/server";
import { delegateTask } from "@/lib/agent-hierarchy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ parentId: string; childId: string }> }
) {
  const { parentId, childId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, taskId, reason } = body;

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    const delegationId = await delegateTask(
      orgId as string,
      parentId,
      childId,
      taskId as string | undefined,
      reason as string | undefined
    );

    return Response.json({
      ok: true,
      delegationId,
      message: "Task delegated successfully",
    });
  } catch (err) {
    console.error("Delegate task error:", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delegate task",
      },
      { status: 500 }
    );
  }
}
