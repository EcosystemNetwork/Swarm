/**
 * Metaplex Mod — NFT minting, collections, and metadata on Solana via Metaplex.
 *
 * Child add-on that requires the Solana mod. Renders as a nested tab inside the
 * Solana page. Contains tools, workflows, examples, and agent skills.
 * Imported by skills.ts (registry) and the /solana page (Metaplex tab).
 */
import type { ModManifest, ModTool, ModWorkflow, ModExample, ModAgentSkill } from "./skills";

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

export const METAPLEX_TOOLS: ModTool[] = [
    {
        id: "metaplex-mint",
        name: "NFT Minting",
        description:
            "Mint NFTs on Solana using Metaplex standards. Supports single mints, editions, and programmable NFTs with metadata URI.",
        icon: "Sparkles",
        category: "NFT",
        status: "active",
        usageExample: `// Mint an NFT with Metaplex JS SDK
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount } from "@metaplex-foundation/umi";

const mint = generateSigner(umi);
await createNft(umi, {
  mint,
  name: "Agent Identity #001",
  uri: "https://arweave.net/metadata.json",
  sellerFeeBasisPoints: percentAmount(5),
}).sendAndConfirm(umi);`,
    },
    {
        id: "metaplex-collections",
        name: "Collection Manager",
        description:
            "Create and manage NFT collections. Group agent identity NFTs, set collection metadata, and verify collection membership.",
        icon: "Layers",
        category: "NFT",
        status: "active",
        usageExample: `// Create a collection NFT
const collectionMint = generateSigner(umi);
await createNft(umi, {
  mint: collectionMint,
  name: "Swarm Agents",
  uri: "https://arweave.net/collection-metadata.json",
  sellerFeeBasisPoints: percentAmount(0),
  isCollection: true,
}).sendAndConfirm(umi);`,
    },
    {
        id: "metaplex-metadata",
        name: "Metadata Editor",
        description:
            "Update on-chain metadata for existing NFTs. Change name, description, image URI, attributes, and royalty settings.",
        icon: "FileEdit",
        category: "NFT",
        status: "active",
        usageExample: `// Update NFT metadata
import { updateV1 } from "@metaplex-foundation/mpl-token-metadata";

await updateV1(umi, {
  mint: nftMint.publicKey,
  data: {
    name: "Agent Identity #001 — Updated",
    uri: "https://arweave.net/updated-metadata.json",
  },
}).sendAndConfirm(umi);`,
    },
    {
        id: "metaplex-assets",
        name: "Asset Viewer",
        description:
            "Browse owned NFTs, view metadata, images, attributes, and collection info. Search by collection, creator, or attribute.",
        icon: "Image",
        category: "NFT",
        status: "active",
        usageExample: `// Fetch all NFTs owned by a wallet
import { fetchAllDigitalAssetByOwner } from "@metaplex-foundation/mpl-token-metadata";

const assets = await fetchAllDigitalAssetByOwner(umi, owner);
for (const asset of assets) {
  console.log(asset.metadata.name, asset.metadata.uri);
}`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Workflows
// ═══════════════════════════════════════════════════════════════

export const METAPLEX_WORKFLOWS: ModWorkflow[] = [
    {
        id: "mint-agent-identity",
        name: "Mint Agent Identity NFT",
        icon: "🤖",
        description:
            "Create an NFT representing an agent's on-chain identity. Links agent name, ASN, skills, and avatar to a Solana NFT for verifiable identity.",
        steps: [
            "Connect Solana wallet",
            "Select agent to mint identity for",
            "Upload avatar and metadata to Arweave/IPFS",
            "Mint NFT with agent metadata (name, ASN, skills)",
            "Verify collection membership if collection exists",
            "Link NFT mint address to agent profile",
        ],
        estimatedTime: "~2 minutes",
        tags: ["metaplex", "nft", "identity", "agents"],
    },
    {
        id: "create-agent-collection",
        name: "Create Agent Collection",
        icon: "📁",
        description:
            "Set up an NFT collection for your organization's agents. All agent identity NFTs will be verified members of this collection.",
        steps: [
            "Connect wallet with SOL balance",
            "Define collection name, description, and image",
            "Upload collection metadata",
            "Mint collection NFT",
            "Set collection as org default for agent identities",
        ],
        estimatedTime: "~1 minute",
        tags: ["metaplex", "nft", "collection", "setup"],
    },
];

// ═══════════════════════════════════════════════════════════════
// Agent Skills
// ═══════════════════════════════════════════════════════════════

export const METAPLEX_AGENT_SKILLS: ModAgentSkill[] = [
    {
        id: "metaplex.mint_nft",
        name: "Mint NFT",
        type: "skill",
        description: "Mint a new NFT on Solana using Metaplex standards.",
        invocation: 'metaplex.mintNft({ name, uri, collection?, royaltyBps? })',
        exampleInput: '{ "name": "Agent #001", "uri": "https://arweave.net/meta.json" }',
        exampleOutput: '{ "mint": "Nft1...", "signature": "5Kz..." }',
    },
    {
        id: "metaplex.update_metadata",
        name: "Update Metadata",
        type: "skill",
        description: "Update the on-chain metadata of an existing NFT.",
        invocation: "metaplex.updateMetadata({ mint, name?, uri? })",
        exampleInput: '{ "mint": "Nft1...", "name": "Agent #001 v2" }',
        exampleOutput: '{ "signature": "4Tx..." }',
    },
    {
        id: "metaplex.get_assets",
        name: "List Owned Assets",
        type: "skill",
        description: "List all NFTs owned by a wallet address with metadata.",
        invocation: "metaplex.getAssets({ owner })",
        exampleInput: '{ "owner": "9WzD..." }',
        exampleOutput: '{ "assets": [{ "mint": "Nft1...", "name": "Agent #001", "uri": "..." }] }',
    },
    {
        id: "metaplex.create_collection",
        name: "Create Collection",
        type: "skill",
        description: "Create a new NFT collection for grouping related assets.",
        invocation: "metaplex.createCollection({ name, uri })",
        exampleInput: '{ "name": "Swarm Agents", "uri": "https://arweave.net/collection.json" }',
        exampleOutput: '{ "collectionMint": "Col1...", "signature": "3Ab..." }',
    },
];

// ═══════════════════════════════════════════════════════════════
// Examples
// ═══════════════════════════════════════════════════════════════

export const METAPLEX_EXAMPLES: ModExample[] = [
    {
        id: "mint-nft-example",
        name: "Mint an NFT with Metaplex",
        icon: "Sparkles",
        description: "Create a new NFT on Solana using the Metaplex JS SDK (Umi framework).",
        language: "typescript",
        tags: ["metaplex", "nft", "mint", "solana"],
        codeSnippet: `import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount } from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";

// Set up Umi with wallet
const umi = createUmi("https://api.devnet.solana.com")
  .use(walletAdapterIdentity(wallet));

// Generate a new mint address
const mint = generateSigner(umi);

// Mint the NFT
const { signature } = await createNft(umi, {
  mint,
  name: "Agent Identity #001",
  uri: "https://arweave.net/agent-metadata.json",
  sellerFeeBasisPoints: percentAmount(5),
}).sendAndConfirm(umi);

console.log("NFT minted:", mint.publicKey);
console.log("Signature:", signature);`,
    },
    {
        id: "read-collection-example",
        name: "Read Collection Metadata",
        icon: "BookOpen",
        description: "Fetch and display all NFTs in a Metaplex collection.",
        language: "typescript",
        tags: ["metaplex", "nft", "collection", "read"],
        codeSnippet: `import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fetchAllDigitalAssetByOwner,
  fetchDigitalAsset,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";

const umi = createUmi("https://api.mainnet-beta.solana.com");
const owner = publicKey("WalletAddressHere...");

// Fetch all NFTs owned by wallet
const assets = await fetchAllDigitalAssetByOwner(umi, owner);

for (const asset of assets) {
  const { name, uri, symbol } = asset.metadata;
  console.log(\`\${name} (\${symbol})\`);
  console.log(\`  URI: \${uri}\`);
  console.log(\`  Mint: \${asset.publicKey}\`);

  // Check if it belongs to a collection
  if (asset.metadata.collection?.value) {
    console.log(\`  Collection: \${asset.metadata.collection.value.key}\`);
    console.log(\`  Verified: \${asset.metadata.collection.value.verified}\`);
  }
}`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Manifest
// ═══════════════════════════════════════════════════════════════

export const METAPLEX_MANIFEST: ModManifest = {
    tools: METAPLEX_TOOLS,
    workflows: METAPLEX_WORKFLOWS,
    examples: METAPLEX_EXAMPLES,
    agentSkills: METAPLEX_AGENT_SKILLS,
};
