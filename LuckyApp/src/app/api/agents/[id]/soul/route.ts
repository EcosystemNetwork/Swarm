/**
 * GET /api/agents/:id/soul
 * PUT /api/agents/:id/soul
 *
 * Manage SOUL configuration for an agent.
 */

import { NextRequest } from "next/server";
import { getAgentSOUL, updateAgentSOUL, getDefaultSOUL } from "@/lib/soul";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Agent } from "@/lib/firestore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  try {
    const soulConfig = await getAgentSOUL(agentId);

    if (!soulConfig) {
      // Generate default SOUL
      const agentDoc = await getDoc(doc(db, "agents", agentId));
      if (!agentDoc.exists()) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }

      const agent = { id: agentDoc.id, ...agentDoc.data() } as Agent;
      const defaultSOUL = getDefaultSOUL(agent.name, agent.type);

      return Response.json({
        ok: true,
        soulConfig: defaultSOUL,
        isDefault: true,
      });
    }

    return Response.json({
      ok: true,
      soulConfig,
      isDefault: false,
    });
  } catch (err) {
    console.error("Get SOUL error:", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to get SOUL configuration",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, soulConfig } = body;

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  if (!soulConfig || typeof soulConfig !== "string") {
    return Response.json(
      { error: "soulConfig (YAML string) is required" },
      { status: 400 }
    );
  }

  try {
    await updateAgentSOUL(orgId as string, agentId, soulConfig as string);

    return Response.json({
      ok: true,
      message: "SOUL configuration updated successfully",
    });
  } catch (err) {
    console.error("Update SOUL error:", err);
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update SOUL configuration",
      },
      { status: 500 }
    );
  }
}
