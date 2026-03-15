/**
 * Shared Solana / Metaplex helpers used across API routes.
 * Provides platform Umi instance, deterministic agent keypair derivation,
 * and address format validators.
 */
import crypto from "crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity } from "@metaplex-foundation/umi";
import bs58 from "bs58";

/** Create a Umi instance configured with the platform keypair. */
export function createPlatformUmi() {
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

/** Get the platform wallet's public key (base58). */
export function getPlatformPublicKey(): string {
  const secretKeyBase58 = process.env.SOLANA_PLATFORM_KEY;
  if (!secretKeyBase58) throw new Error("SOLANA_PLATFORM_KEY is not configured");

  const secretKeyBytes = bs58.decode(secretKeyBase58);
  const publicKeyBytes = secretKeyBytes.slice(32);
  return new PublicKey(publicKeyBytes).toBase58();
}

/**
 * Derive a deterministic Solana keypair for an agent.
 * Uses SHA-256(SOLANA_PLATFORM_KEY + ':' + agentId) as the 32-byte seed.
 * This is reproducible — the same agentId always yields the same keypair.
 */
export function deriveAgentKeypair(agentId: string): Keypair {
  const platformKeyBase58 = process.env.SOLANA_PLATFORM_KEY;
  if (!platformKeyBase58) throw new Error("SOLANA_PLATFORM_KEY is not configured");

  const seed = crypto
    .createHash("sha256")
    .update(`${platformKeyBase58}:${agentId}`)
    .digest(); // 32 bytes
  return Keypair.fromSeed(seed);
}

/** Check if an address is an EVM hex address (0x-prefixed). */
export function isEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Check if an address is a valid Solana base58 address. */
export function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

/** Build the metadata URI for an agent NFT. */
export function buildMetadataUri(agentId: string): string {
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";
  const protocol = appDomain.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${appDomain}/api/v1/metaplex/metadata/${agentId}`;
}

/** Build the metadata URI for an org collection. */
export function buildCollectionMetadataUri(orgId: string): string {
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";
  const protocol = appDomain.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${appDomain}/api/v1/metaplex/metadata/collection/${orgId}`;
}
