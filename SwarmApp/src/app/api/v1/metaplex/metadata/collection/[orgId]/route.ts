/**
 * GET /api/v1/metaplex/metadata/collection/[orgId]
 *
 * Serves Metaplex-standard metadata JSON for an organization's NFT collection.
 * Public endpoint — this is the URI stored on-chain in the collection NFT.
 */
import { getOrganization } from "@/lib/firestore";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const metadata = {
    name: org.name,
    symbol: "SWARM",
    description:
      org.description || `${org.name} agent collection on Swarm Protocol`,
    image:
      org.logoUrl ||
      `https://api.dicebear.com/9.x/shapes/svg?seed=${org.name}`,
    external_url: org.website || "https://swarmprotocol.fun",
  };

  return Response.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
