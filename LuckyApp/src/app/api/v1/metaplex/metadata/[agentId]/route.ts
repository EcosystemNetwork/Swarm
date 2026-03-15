/**
 * GET /api/v1/metaplex/metadata/[agentId]
 *
 * Serves Metaplex-standard metadata JSON for an agent's NFT.
 * This is the URI stored on-chain in the NFT — it must be publicly accessible.
 */
import { getAgent } from "@/lib/firestore";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;

  if (!agentId) {
    return Response.json({ error: "agentId is required" }, { status: 400 });
  }

  const agent = await getAgent(agentId);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const metadata = {
    name: agent.name,
    symbol: "SWARM",
    description:
      agent.bio || agent.description || `${agent.type} agent in the Swarm protocol`,
    image:
      agent.avatarUrl ||
      `https://api.dicebear.com/9.x/bottts/svg?seed=${agent.name}-${agent.type || "agent"}`,
    external_url: "https://swarmprotocol.fun",
    attributes: [
      { trait_type: "Type", value: agent.type },
      { trait_type: "ASN", value: agent.asn || "unassigned" },
      { trait_type: "Trust Score", value: agent.trustScore ?? 0 },
      { trait_type: "Credit Score", value: agent.creditScore ?? 0 },
      { trait_type: "Status", value: agent.status },
      ...(agent.nftOwnerEvmAddress
        ? [{ trait_type: "Owner (EVM)", value: agent.nftOwnerEvmAddress }]
        : []),
      ...(agent.reportedSkills || []).map((s) => ({
        trait_type: "Skill",
        value: s.name,
      })),
    ],
  };

  return Response.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
