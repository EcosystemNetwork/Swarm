/**
 * POST /api/v1/metaplex/mint
 *
 * Mint a Metaplex NFT representing an agent's on-chain identity on Solana devnet.
 * Uses the platform keypair (SOLANA_PLATFORM_KEY) as the payer and mint authority.
 * Metadata is served via the public API route /api/v1/metaplex/metadata/[agentId].
 *
 * Body: { agentId, orgId, recipientAddress }
 * Returns: { mintAddress, signature, metadataUri, agentId }
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import { getAgent, updateAgent, type Agent } from "@/lib/firestore";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, createNft } from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";
import bs58 from "bs58";

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Check if an address is an EVM hex address (0x-prefixed). */
function isEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Check if an address is a valid Solana base58 address. */
function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

/** Create a Umi instance configured with the platform keypair. */
function createPlatformUmi() {
  const secretKeyBase58 = process.env.SOLANA_PLATFORM_KEY;
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  if (!secretKeyBase58) {
    throw new Error("SOLANA_PLATFORM_KEY is not configured");
  }

  const secretKeyBytes = bs58.decode(secretKeyBase58);
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
  umi.use(keypairIdentity(umiKeypair));

  return umi;
}

// ═══════════════════════════════════════════════════════════════
// Route
// ═══════════════════════════════════════════════════════════════

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

  // 2. Auth — caller must be a member of the org
  const auth = await requireOrgMember(request, orgId);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status || 403 },
    );
  }

  // 3. Validate recipient address — accept Solana (base58) or EVM (0x) addresses.
  //    EVM addresses: NFT is held by the platform wallet on-chain, EVM address recorded in metadata.
  //    Solana addresses: NFT goes directly to the provided Solana wallet.
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

    // 5. Build metadata URI — served by the public API route
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";
    const protocol = appDomain.startsWith("localhost") ? "http" : "https";
    const metadataUri = `${protocol}://${appDomain}/api/v1/metaplex/metadata/${agentId}`;

    // 6. Mint NFT via Metaplex / Umi
    const umi = createPlatformUmi();
    const mint = generateSigner(umi);

    // If recipient is an EVM address, mint to the platform wallet (Solana NFTs
    // require a Solana public key as token owner). The EVM address is recorded
    // in the on-chain metadata attributes for ownership tracking.
    const platformPublicKey = umi.identity.publicKey;
    const tokenOwner = recipientIsSolana
      ? umiPublicKey(recipientAddress)
      : platformPublicKey;

    const { signature } = await createNft(umi, {
      mint,
      name: agent.name.slice(0, 32),
      symbol: "SWARM",
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(0),
      tokenOwner,
    }).sendAndConfirm(umi);

    const mintAddress = mint.publicKey.toString();
    const signatureStr = bs58.encode(signature);

    // 7. Update agent in Firestore
    await updateAgent(agentId, {
      nftMintAddress: mintAddress,
      nftMintedAt: new Date(),
      ...(recipientIsEvm ? { nftOwnerEvmAddress: recipientAddress } : {}),
    } as Partial<Agent>);

    // 8. Success
    return Response.json({
      mintAddress,
      signature: signatureStr,
      metadataUri,
      agentId,
      tokenOwner: tokenOwner.toString(),
      custodial: recipientIsEvm,
    });
  } catch (err) {
    console.error("Metaplex mint error:", err);
    const message = err instanceof Error ? err.message : "Mint failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
