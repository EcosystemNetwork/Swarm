/**
 * POST /api/v1/metaplex/mint
 *
 * Mint a Metaplex NFT representing an agent's on-chain identity on Solana devnet.
 * Uses the platform keypair (SOLANA_PLATFORM_KEY) as the payer and mint authority.
 * Metadata is served via the public API route /api/v1/metaplex/metadata/[agentId].
 *
 * Token owner priority:
 *   1. Agent's own Solana address (if generated via /api/v1/solana/wallet/generate)
 *   2. Provided Solana (base58) recipient address
 *   3. Platform wallet (for EVM recipients — custodial)
 *
 * If the org has a Metaplex collection, the NFT is minted as a member.
 *
 * Body: { agentId, orgId, recipientAddress }
 * Returns: { mintAddress, signature, metadataUri, agentId, tokenOwner, custodial }
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import { getAgent, updateAgent, getOrganization, type Agent } from "@/lib/firestore";
import {
  createPlatformUmi,
  isEvmAddress,
  isSolanaAddress,
  buildMetadataUri,
} from "@/lib/solana-keys";
import {
  createNft,
  verifyCollectionV1,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  percentAmount,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";
import bs58 from "bs58";

export async function POST(request: NextRequest) {
  // 1. Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, orgId, recipientAddress } = body as {
    agentId?: string;
    orgId?: string;
    recipientAddress?: string;
  };

  if (!agentId || !orgId || !recipientAddress) {
    return Response.json(
      { error: "agentId, orgId, and recipientAddress are required" },
      { status: 400 },
    );
  }

  // 2. Auth
  const auth = await requireOrgMember(request, orgId);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status || 403 },
    );
  }

  // 3. Validate recipient address
  const recipientIsEvm = isEvmAddress(recipientAddress);
  const recipientIsSolana = isSolanaAddress(recipientAddress);

  if (!recipientIsEvm && !recipientIsSolana) {
    return Response.json(
      { error: "Invalid wallet address. Provide a Solana (base58) or EVM (0x) address." },
      { status: 400 },
    );
  }

  try {
    // 4. Fetch agent & validate
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
    if (agent.nftMintAddress) {
      return Response.json(
        {
          error: "Agent already has an NFT minted",
          existingMint: agent.nftMintAddress,
        },
        { status: 409 },
      );
    }

    // 5. Build metadata URI
    const metadataUri = buildMetadataUri(agentId);

    // 6. Mint NFT via Metaplex / Umi
    const umi = createPlatformUmi();
    const mint = generateSigner(umi);

    // Token owner priority:
    // 1. Agent's own Solana address (each agent owns its own NFT)
    // 2. Provided Solana recipient address
    // 3. Platform wallet (for EVM recipients — custodial)
    const platformPublicKey = umi.identity.publicKey;
    const tokenOwner = agent.solanaAddress
      ? umiPublicKey(agent.solanaAddress)
      : recipientIsSolana
        ? umiPublicKey(recipientAddress)
        : platformPublicKey;

    // Check for org collection
    const org = await getOrganization(orgId);
    const collectionMintAddress = org?.metaplexCollectionMint;

    const { signature } = await createNft(umi, {
      mint,
      name: agent.name.slice(0, 32),
      symbol: "SWARM",
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(0),
      tokenOwner,
      collection: collectionMintAddress
        ? { key: umiPublicKey(collectionMintAddress), verified: false }
        : undefined,
    }).sendAndConfirm(umi);

    // Verify collection membership if collection exists
    if (collectionMintAddress) {
      try {
        const nftMetadata = findMetadataPda(umi, { mint: mint.publicKey });
        await verifyCollectionV1(umi, {
          metadata: nftMetadata,
          collectionMint: umiPublicKey(collectionMintAddress),
        }).sendAndConfirm(umi);
      } catch (verifyErr) {
        console.warn("Collection verification failed (NFT still minted):", verifyErr);
      }
    }

    const mintAddress = mint.publicKey.toString();
    const signatureStr = bs58.encode(signature);

    const custodial = !agent.solanaAddress && recipientIsEvm;

    // 7. Update agent in Firestore
    await updateAgent(agentId, {
      nftMintAddress: mintAddress,
      nftMintedAt: new Date(),
      ...(custodial ? { nftOwnerEvmAddress: recipientAddress } : {}),
    } as Partial<Agent>);

    // 8. Success
    return Response.json({
      mintAddress,
      signature: signatureStr,
      metadataUri,
      agentId,
      tokenOwner: tokenOwner.toString(),
      custodial,
    });
  } catch (err) {
    console.error("Metaplex mint error:", err);
    const message = err instanceof Error ? err.message : "Mint failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
