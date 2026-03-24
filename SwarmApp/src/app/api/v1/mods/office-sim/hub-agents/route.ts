/**
 * GET /api/v1/mods/office-sim/hub-agents?orgId=ORG_ID
 *
 * Fetches live agent status from the Swarm hub (GET /agents/online)
 * and merges with Firestore agent metadata for the org.
 *
 * Returns agents with accurate online/offline status from the hub,
 * enriched with Firestore metadata (name, model, type, capabilities, bio).
 *
 * Falls back to Firestore-only data if hub is unreachable.
 */

import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { getAgentsByOrg } from "@/lib/firestore";

const HUB_URL = process.env.SWARM_HUB_URL || "https://swarmprotocol.fun";

interface HubOnlineAgent {
  agentId: string;
  agentName: string;
  agentType: string;
  connections: number;
}

export async function GET(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    // Fetch hub online agents + Firestore agents in parallel
    const [hubResult, firestoreAgents] = await Promise.all([
      fetchHubOnline(),
      getAgentsByOrg(orgId),
    ]);

    const hubOnlineMap = new Map<string, HubOnlineAgent>();
    if (hubResult) {
      for (const a of hubResult) {
        hubOnlineMap.set(a.agentId, a);
      }
    }

    // Merge: Firestore metadata + hub online status
    const agents = firestoreAgents.map((agent) => {
      const hubInfo = hubOnlineMap.get(agent.id);
      return {
        id: agent.id,
        name: agent.name || hubInfo?.agentName || agent.id,
        status: hubInfo ? "online" : "offline",
        type: hubInfo?.agentType || agent.type,
        capabilities: agent.capabilities,
        bio: agent.bio,
        asn: agent.asn,
        description: agent.description,
        reportedSkills: agent.reportedSkills,
        connections: hubInfo?.connections || 0,
      };
    });

    return Response.json({
      ok: true,
      agents,
      hubConnected: hubResult !== null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch agents" },
      { status: 500 },
    );
  }
}

async function fetchHubOnline(): Promise<HubOnlineAgent[] | null> {
  try {
    const res = await fetch(`${HUB_URL}/agents/online`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.agents || []) as HubOnlineAgent[];
  } catch {
    return null;
  }
}
