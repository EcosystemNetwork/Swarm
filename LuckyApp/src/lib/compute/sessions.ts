/**
 * Swarm Compute — Session Management
 */

import type { ControllerType, ModelKey } from "./types";
import { createSession, endSession, getSession, getSessions as getSessionsDb } from "./firestore";
import { estimateHourlyCost } from "./billing";
import { getComputer } from "./firestore";

export async function startComputeSession(
  computerId: string,
  workspaceId: string,
  controllerType: ControllerType,
  userId: string | null,
  modelKey?: ModelKey | null,
): Promise<string> {
  return createSession({
    computerId,
    workspaceId,
    controllerType,
    userId,
    modelKey: modelKey || null,
    recordingUrl: null,
  });
}

export async function endComputeSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.endedAt) return;

  const durationMs = session.startedAt
    ? Date.now() - session.startedAt.getTime()
    : 0;
  const hours = durationMs / (1000 * 60 * 60);

  const computer = await getComputer(session.computerId);
  const costPerHour = computer ? estimateHourlyCost(computer.sizeKey) : 8;

  await endSession(sessionId, {
    totalActions: session.totalActions,
    totalScreenshots: session.totalScreenshots,
    estimatedCostCents: Math.ceil(hours * costPerHour),
  });
}

export async function getActiveSessions(workspaceId: string): Promise<number> {
  const sessions = await getSessionsDb({ workspaceId, limit: 200 });
  return sessions.filter((s) => !s.endedAt).length;
}
