/**
 * POST /api/v1/metaplex/collection
 *
 * Create a Metaplex NFT collection for an organization on Solana devnet.
 * Uses the platform keypair as payer and update authority.
 * Agent identity NFTs can then be minted as members of this collection.
 *
 * Body: { orgId }
 * Returns: { collectionMint, signature, metadataUri }
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import {
  getOrganization,
  updateOrganization,
  type Organization,
} from "@/lib/firestore";
import { createPlatformUmi, buildCollectionMetadataUri } from "@/lib/solana-keys";
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount } from "@metaplex-foundation/umi";
import bs58 from "bs58";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId } = body as { orgId?: string };
  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  const auth = await requireOrgMember(request, orgId);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status || 403 });
  }

  try {
    const org = await getOrganization(orgId);
    if (!org) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    if (org.metaplexCollectionMint) {
      return Response.json(
        {
          error: "Collection already exists",
          existingMint: org.metaplexCollectionMint,
        },
        { status: 409 },
      );
    }

    const metadataUri = buildCollectionMetadataUri(orgId);
    const umi = createPlatformUmi();
    const collectionMint = generateSigner(umi);

    const { signature } = await createNft(umi, {
      mint: collectionMint,
      name: org.name.slice(0, 32),
      symbol: "SWARM",
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(0),
      isCollection: true,
    }).sendAndConfirm(umi);

    const collectionMintAddress = collectionMint.publicKey.toString();
    const signatureStr = bs58.encode(signature);

    await updateOrganization(orgId, {
      metaplexCollectionMint: collectionMintAddress,
    } as Partial<Organization>);

    return Response.json({
      collectionMint: collectionMintAddress,
      signature: signatureStr,
      metadataUri,
    });
  } catch (err) {
    console.error("Collection creation error:", err);
    const message = err instanceof Error ? err.message : "Collection creation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
