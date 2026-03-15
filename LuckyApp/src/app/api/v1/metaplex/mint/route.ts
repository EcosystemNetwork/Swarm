/**
 * POST /api/v1/metaplex/mint
 *
 * Mint a Metaplex NFT representing an agent's on-chain identity on Solana devnet.
 * Uses the platform keypair (SOLANA_PLATFORM_KEY) as the payer and mint authority.
 * Metadata JSON is uploaded to Firebase Storage.
 *
 * Body: { agentId, orgId, recipientAddress }
 * Returns: { mintAddress, signature, metadataUri, agentId }
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import { getAgent, updateAgent, type Agent } from "@/lib/firestore";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

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

/** Build Metaplex-standard metadata JSON from an agent record. */
function buildNftMetadata(agent: Agent) {
  return {
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
      ...(agent.reportedSkills || []).map((s) => ({
        trait_type: "Skill",
        value: s.name,
      })),
    ],
  };
}

/** Upload metadata JSON to Firebase Storage and return the public download URL. */
async function uploadMetadata(
  agentId: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  const jsonBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
  const storageRef = ref(storage, `nft-metadata/${agentId}.json`);
  await uploadBytes(storageRef, jsonBuffer, { contentType: "application/json" });
  return getDownloadURL(storageRef);
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

  // 3. Validate recipient looks like a Solana address (base58, 32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recipientAddress)) {
    return Response.json(
      { error: "Invalid Solana wallet address" },
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

    // 5. Build & upload metadata
    const metadata = buildNftMetadata(agent);
    const metadataUri = await uploadMetadata(agentId, metadata);

    // 6. Mint NFT via Metaplex / Umi
    const umi = createPlatformUmi();
    const mint = generateSigner(umi);

    const { signature } = await createNft(umi, {
      mint,
      name: agent.name.slice(0, 32),
      symbol: "SWARM",
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(0),
      tokenOwner: umiPublicKey(recipientAddress),
    }).sendAndConfirm(umi);

    const mintAddress = mint.publicKey.toString();
    const signatureStr = bs58.encode(signature);

    // 7. Update agent in Firestore
    await updateAgent(agentId, {
      nftMintAddress: mintAddress,
      nftMintedAt: new Date(),
    } as Partial<Agent>);

    // 8. Success
    return Response.json({
      mintAddress,
      signature: signatureStr,
      metadataUri,
      agentId,
    });
  } catch (err) {
    console.error("Metaplex mint error:", err);
    const message = err instanceof Error ? err.message : "Mint failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
