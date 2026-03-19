/**
 * POST /api/v1/metaplex/update
 *
 * Update on-chain metadata for an agent's existing Metaplex NFT.
 * Refreshes the on-chain name and metadata URI pointer.
 * The URI itself serves dynamic data from Firestore, so this ensures
 * on-chain explorers show the latest agent name.
 *
 * Body: { agentId, orgId }
 * Returns: { signature, agentId, metadataUri }
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import { getAgent } from "@/lib/firestore";
import { createPlatformUmi, buildMetadataUri } from "@/lib/solana-keys";
import {
  updateV1,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, orgId } = body as { agentId?: string; orgId?: string };

  if (!agentId || !orgId) {
    return Response.json(
      { error: "agentId and orgId are required" },
      { status: 400 },
    );
  }

  const auth = await requireOrgMember(request, orgId);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status || 403 });
  }

  try {
    const agent = await getAgent(agentId);
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }
    if (agent.orgId !== orgId) {
      return Response.json(
        { error: "Agent does not belong to this organization" },
        { status: 403 },
      );
    }
    if (!agent.nftMintAddress) {
      return Response.json(
        { error: "Agent does not have a minted NFT" },
        { status: 400 },
      );
    }

    const metadataUri = buildMetadataUri(agentId);
    const umi = createPlatformUmi();
    const mintPubkey = umiPublicKey(agent.nftMintAddress);
    const metadata = findMetadataPda(umi, { mint: mintPubkey });

    const { signature } = await updateV1(umi, {
      mint: mintPubkey,
      metadata,
      data: {
        name: agent.name.slice(0, 32),
        symbol: "SWARM",
        uri: metadataUri,
        sellerFeeBasisPoints: 0,
        creators: null,
      },
    }).sendAndConfirm(umi);

    const signatureStr = bs58.encode(signature);

    return Response.json({
      signature: signatureStr,
      agentId,
      metadataUri,
    });
  } catch (err) {
    console.error("Metadata update error:", err);
    const message = err instanceof Error ? err.message : "Metadata update failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
