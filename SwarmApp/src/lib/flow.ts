/**
 * Flow Mod — Consumer DeFi on Flow L1
 *
 * FCL wallet auth, FLOW/FT payments, agent treasury, spending policy, bounties,
 * and smart contract deployment (Cadence + EVM) on Flow blockchain.
 *
 * Hackathon track: PL Genesis — Flow Consumer DeFi ($10,000 bounty)
 * Entry point: FCL Discovery → wallet connect → fund/pay/approve
 *
 * Flow uses:
 *   - ECDSA_P256 + SHA3-256 for signatures
 *   - UFix64 (8 decimal places) for token amounts
 *   - Cadence smart contract language (+ EVM via chain ID 747)
 *   - FCL (Flow Client Library) for frontend wallet integration
 */
import type { ModManifest, ModTool, ModWorkflow, ModExample, ModAgentSkill } from "./skills";

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

export const FLOW_TOOLS: ModTool[] = [
    {
        id: "flow-wallet-connect",
        name: "FCL Wallet Connect",
        description:
            "Connect Blocto, Lilico, Flow Wallet, or Dapper via FCL Discovery. Binds a Flow account to a Swarm org or agent. Mandatory first step for all Flow payment flows.",
        icon: "Wallet",
        category: "Wallet",
        status: "active",
        usageExample: `// FCL wallet connection (React)
import * as fcl from "@onflow/fcl";

fcl.config()
  .put("accessNode.api", "https://rest-testnet.onflow.org")
  .put("discovery.wallet", "https://fcl-discovery.onflow.org/testnet/authn")
  .put("app.detail.title", "Swarm Protocol")
  .put("flow.network", "testnet");

// Connect — opens FCL Discovery modal
await fcl.logIn();
const user = await fcl.currentUser.snapshot();
console.log("Connected:", user.addr); // e.g. "0x1234abcd5678ef90"`,
    },
    {
        id: "flow-balance",
        name: "FLOW Balance Reader",
        description:
            "Read FLOW token balance for any Flow address via Cadence script. Returns UFix64 balance with 8 decimal precision.",
        icon: "Eye",
        category: "Wallet",
        status: "active",
        usageExample: `// Query FLOW balance via FCL script
import * as fcl from "@onflow/fcl";

const balance = await fcl.query({
  cadence: \`
    import FungibleToken from 0xFungibleToken
    import FlowToken from 0xFlowToken
    access(all) fun main(address: Address): UFix64 {
      let account = getAccount(address)
      let vaultRef = account.capabilities.borrow<&{FungibleToken.Balance}>(
        /public/flowTokenBalance
      ) ?? panic("Could not borrow balance reference")
      return vaultRef.balance
    }
  \`,
  args: (arg, t) => [arg(address, t.Address)],
});
console.log("Balance:", balance, "FLOW");`,
    },
    {
        id: "flow-send-payment",
        name: "Send FLOW",
        description:
            "Send FLOW tokens to any Flow address via Cadence transaction. Policy-checked before broadcast. Supports memo field for task attribution.",
        icon: "Send",
        category: "Payments",
        status: "active",
        usageExample: `// Send FLOW tokens via FCL transaction
const txId = await fcl.mutate({
  cadence: \`
    import FungibleToken from 0xFungibleToken
    import FlowToken from 0xFlowToken
    transaction(recipient: Address, amount: UFix64) {
      let sentVault: @{FungibleToken.Vault}
      prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
          from: /storage/flowTokenVault
        ) ?? panic("Could not borrow Flow token vault")
        self.sentVault <- vaultRef.withdraw(amount: amount)
      }
      execute {
        let receiverRef = getAccount(recipient)
          .capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
          ?? panic("Could not borrow receiver reference")
        receiverRef.deposit(from: <- self.sentVault)
      }
    }
  \`,
  args: (arg, t) => [
    arg(recipientAddress, t.Address),
    arg(amount.toFixed(8), t.UFix64),
  ],
  proposer: fcl.authz,
  payer: fcl.authz,
  authorizations: [fcl.authz],
  limit: 500,
});
const txStatus = await fcl.tx(txId).onceSealed();`,
    },
    {
        id: "flow-ft-balances",
        name: "Fungible Token Balances",
        description:
            "List all FungibleToken balances for a Flow account. Supports FLOW, USDC, FUSD, and any custom FT contract.",
        icon: "Coins",
        category: "Tokens",
        status: "active",
        usageExample: `// Query custom FT balance
const balance = await fcl.query({
  cadence: \`
    import FungibleToken from 0xFungibleToken
    import MyToken from 0xMyTokenAddress
    access(all) fun main(address: Address): UFix64 {
      let account = getAccount(address)
      let vaultRef = account.capabilities.borrow<&{FungibleToken.Balance}>(
        /public/myTokenBalance
      ) ?? panic("No vault")
      return vaultRef.balance
    }
  \`,
  args: (arg, t) => [arg(address, t.Address)],
});`,
    },
    {
        id: "flow-nft-holdings",
        name: "NFT Holdings",
        description:
            "Fetch NFT items owned by a Flow account. Supports any NonFungibleToken standard collection. Can be used for access gating.",
        icon: "Image",
        category: "NFTs",
        status: "active",
        usageExample: `// Query NFT IDs in a collection
const ids = await fcl.query({
  cadence: \`
    import NonFungibleToken from 0xNonFungibleToken
    import MyNFT from 0xMyNFTAddress
    access(all) fun main(address: Address): [UInt64] {
      let account = getAccount(address)
      let collectionRef = account.capabilities.borrow<&{NonFungibleToken.CollectionPublic}>(
        /public/myNFTCollection
      ) ?? panic("No collection")
      return collectionRef.getIDs()
    }
  \`,
  args: (arg, t) => [arg(address, t.Address)],
});`,
    },
    {
        id: "flow-staking",
        name: "FLOW Staking",
        description:
            "Delegate FLOW tokens to validators for staking rewards. Uses the native FlowStakingCollection contract for non-custodial staking.",
        icon: "TrendingUp",
        category: "DeFi",
        status: "active",
        usageExample: `// Delegate FLOW to a validator node
const txId = await fcl.mutate({
  cadence: \`
    import FlowStakingCollection from 0xFlowStakingCollection
    transaction(nodeID: String, delegatorID: UInt32, amount: UFix64) {
      let stakingCollectionRef: auth(FlowStakingCollection.CollectionOwner) &FlowStakingCollection.StakingCollection
      prepare(account: auth(BorrowValue) &Account) {
        self.stakingCollectionRef = account.storage.borrow<auth(FlowStakingCollection.CollectionOwner) &FlowStakingCollection.StakingCollection>(from: FlowStakingCollection.StakingCollectionStoragePath)
          ?? panic("Could not borrow StakingCollection")
      }
      execute {
        self.stakingCollectionRef.stakeNewTokens(nodeID: nodeID, delegatorID: delegatorID, amount: amount)
      }
    }
  \`,
  args: (arg, t) => [
    arg(nodeId, t.String),
    arg(delegatorId, t.UInt32),
    arg(amount.toFixed(8), t.UFix64),
  ],
  proposer: fcl.authz,
  payer: fcl.authz,
  authorizations: [fcl.authz],
  limit: 999,
});`,
    },
    {
        id: "flow-evm-bridge",
        name: "Flow EVM Bridge",
        description:
            "Interact with Solidity contracts on Flow EVM (chain ID 747 mainnet, 545 testnet). Deploy and call EVM contracts using standard Ethereum tooling.",
        icon: "GitBranch",
        category: "EVM",
        status: "active",
        usageExample: `// Flow EVM via ethers.js / viem
import { createPublicClient, http, defineChain } from "viem";

const flowEVM = defineChain({
  id: 747,
  name: "Flow EVM",
  nativeCurrency: { name: "Flow", symbol: "FLOW", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.evm.nodes.onflow.org"] } },
});

const client = createPublicClient({ chain: flowEVM, transport: http() });
const balance = await client.getBalance({ address: "0x..." });`,
    },
    {
        id: "flow-policy-check",
        name: "Spending Policy",
        description:
            "Policy-gated payment controls: per-tx caps, daily/monthly limits, address allowlists, approval queues, and kill switch. Same battle-tested model as TON Treasury.",
        icon: "Shield",
        category: "Policy",
        status: "active",
        usageExample: `// Check payment against org policy
const result = await checkFlowPolicy({
  orgId: "org-123",
  toAddress: "0x1234abcd",
  amount: flowToMiniFlow("10.0"), // 10 FLOW
});
if (!result.allowed) {
  console.log("Blocked:", result.reason);
} else if (result.requiresApproval) {
  console.log("Requires human approval");
}`,
    },
    {
        id: "flow-bounty-board",
        name: "Bounty Board",
        description:
            "Post task bounties with FLOW rewards. Agents claim → submit proof → admin approves → FLOW released. Platform fee on payout (configurable bps).",
        icon: "Trophy",
        category: "Bounties",
        status: "active",
        usageExample: `// Post a bounty
const bounty = await createFlowBounty({
  orgId: "org-123",
  title: "Analyze Q4 data",
  description: "Run sentiment analysis on Q4 customer reviews",
  amount: flowToMiniFlow("5.0"),
  token: "FLOW",
  tokenSymbol: "FLOW",
  funderAddress: "0x1234abcd",
  status: "open",
  tags: ["analysis", "sentiment"],
  postedBy: "admin@org",
});`,
    },
    {
        id: "flow-deploy-contract",
        name: "Deploy Contract",
        description:
            "Deploy Cadence contracts, Fungible Tokens, NFT Collections, or EVM contracts on Flow. Supports both native Cadence and Flow EVM (Solidity).",
        icon: "Rocket",
        category: "Deploy",
        status: "active",
        usageExample: `// Deploy a Cadence contract
const deployment = await createFlowDeployment({
  orgId: "org-123",
  type: "cadence_contract",
  status: "pending",
  name: "MyContract",
  description: "Custom smart contract",
  deployerAddress: "0x1234abcd",
  network: "testnet",
  contractAddress: null,
  txHash: null,
  sourceCode: cadenceCode,
  config: { type: "cadence_contract", contractName: "MyContract", sourceCode: cadenceCode, initArgs: "{}" },
  estimatedCost: estimateFlowDeployCost("cadence_contract"),
  actualCost: null,
  createdBy: "admin",
  agentId: null,
  errorMessage: null,
});`,
    },
    {
        id: "flow-asn-identity",
        name: "ASN Identity on Flow",
        description:
            "Link Agent Social Numbers (ASN-SWM-YYYY-HHHH-HHHH-CC) to Flow blockchain. Cross-chain identity that syncs reputation between Hedera and Flow.",
        icon: "Fingerprint",
        category: "Identity",
        status: "active",
        usageExample: `// Link ASN to Flow
const record = await ensureFlowASNRecord(asn, orgId, agentId);
await linkFlowWallet(asn, "0x1234abcd", "testnet", true);
// Reputation events automatically update ASN scores on both chains`,
    },
    {
        id: "flow-reputation-engine",
        name: "Reputation Engine",
        description:
            "ASN-linked reputation scoring on Flow. Credit (300-900) and trust (0-100) scores updated by task completion, bounties, staking, and CID verification. Tiers: Bronze → Silver → Gold → Platinum → Diamond.",
        icon: "Star",
        category: "Reputation",
        status: "active",
        usageExample: `// Record a reputation event
await recordReputationEvent({
  orgId, agentId, asn, event: "bounty_completed",
  creditDelta: +15, trustDelta: +5,
  newCreditScore: 695, newTrustScore: 55,
  reason: "Completed bounty: Analyze Q4 data",
});`,
    },
    {
        id: "flow-nft-badges",
        name: "Achievement NFT Badges",
        description:
            "Mint NFT achievement badges on Flow when agents hit milestones. 15 badge types across 4 rarities (common, rare, epic, legendary). Soulbound to agent ASN.",
        icon: "Award",
        category: "NFTs",
        status: "active",
        usageExample: `// Check and award badges
const newBadges = await checkAndAwardBadges(orgId, agentId, asn, {
  payments: 10, bounties: 5, stakes: 1, deploys: 0, swaps: 3,
  cidVerifications: 2, creditScore: 700,
});
// Returns: [{ badge: "ten_payments", name: "Reliable Sender", rarity: "rare" }]`,
    },
    {
        id: "flow-dex-swap",
        name: "DEX Token Swap",
        description:
            "Swap tokens on IncrementFi (Flow's leading DEX). Supports FLOW, USDC, FUSD, and custom FTs. Configurable slippage tolerance.",
        icon: "RefreshCw",
        category: "DeFi",
        status: "active",
        usageExample: `const quote = await createSwapQuote({
  dex: "incrementfi", tokenInSymbol: "FLOW", tokenOutSymbol: "USDC",
  amountIn: flowToMiniFlow("10.0"), slippageBps: 50,
});`,
    },
    {
        id: "flow-evm-bridge",
        name: "EVM Bridge",
        description:
            "Bridge assets between native Cadence VM and Flow EVM (chain 747/545). Move FLOW, FTs, and NFTs between the two execution environments.",
        icon: "GitBranch",
        category: "Bridge",
        status: "active",
        usageExample: `const tx = await createBridgeTransaction({
  direction: "cadence_to_evm", tokenSymbol: "FLOW", amount: "1000000000",
  fromAddress: "0x1234abcd", toAddress: "0xEvmAddress...",
});`,
    },
    {
        id: "flow-cid-verification",
        name: "Cross-Chain CID Verify",
        description:
            "Verify Storacha CIDs simultaneously on Flow (Cadence tx), Filecoin (storage deal), and Storacha (IPFS pin). Triple-verified provable agent outputs.",
        icon: "CheckCircle",
        category: "Verification",
        status: "active",
        usageExample: `const record = await createCidVerification({
  agentId, asn, cid: "bafy...", gatewayUrl: "https://bafy...ipfs.storacha.link/",
  contentHash: sha256hex, sizeBytes: 1024,
});
await updateCidVerification(record.id, "flow", { txHash: "...", verified: true });`,
    },
    {
        id: "flow-storacha-bridge",
        name: "Storacha × Flow",
        description:
            "Store agent artifacts on Storacha (IPFS/Filecoin) and reference CIDs on-chain via Flow. Combines decentralized storage with Flow's fast finality for verifiable agent outputs.",
        icon: "HardDrive",
        category: "Storage",
        status: "active",
        usageExample: `// Upload to Storacha, record CID on Flow
const cid = await storachaUpload(file);
// Store CID reference on-chain via Cadence
const txId = await fcl.mutate({
  cadence: \`
    transaction(cid: String, agentId: String) {
      prepare(signer: auth(Storage) &Account) {
        // Store CID reference in account storage
        log("Stored CID: ".concat(cid).concat(" for agent: ").concat(agentId))
      }
    }
  \`,
  args: (arg, t) => [arg(cid, t.String), arg(agentId, t.String)],
  proposer: fcl.authz, payer: fcl.authz, authorizations: [fcl.authz], limit: 100,
});`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Workflows
// ═══════════════════════════════════════════════════════════════

export const FLOW_WORKFLOWS: ModWorkflow[] = [
    {
        id: "flow-agent-payment",
        name: "Agent Payment Pipeline",
        icon: "Send",
        tags: ["payment", "policy", "audit"],
        description: "End-to-end agent payment: connect → policy check → tx → audit",
        steps: [
            "Connect Flow wallet via FCL Discovery",
            "Verify wallet ownership (account proof)",
            "Check spending policy (per-tx cap, daily limit, allowlist)",
            "If within policy: broadcast Cadence transaction",
            "Wait for transaction seal (2-5 sec finality)",
            "Log audit entry with tx hash",
            "Update payment status to 'executed'",
        ],
    },
    {
        id: "flow-bounty-lifecycle",
        name: "Bounty Lifecycle",
        icon: "Trophy",
        tags: ["bounty", "escrow", "agents"],
        description: "Full bounty flow from posting to FLOW release",
        steps: [
            "Admin posts bounty with FLOW reward amount",
            "Agent claims bounty (status → claimed)",
            "Agent submits deliverable proof (CID, URL, or text)",
            "Admin reviews and approves/rejects",
            "On approval: calculate platform fee (configurable bps)",
            "Broadcast FLOW transfer to claimer (net of fee)",
            "Update bounty with tx hash and resolved status",
        ],
    },
    {
        id: "flow-defi-pipeline",
        name: "Consumer DeFi Pipeline",
        icon: "TrendingUp",
        tags: ["defi", "swap", "staking"],
        description: "Flow DeFi operations: swap, stake, and earn",
        steps: [
            "Connect wallet via FCL",
            "Query token balances (FLOW + FTs)",
            "Execute swap on IncrementFi (Cadence DEX)",
            "Or delegate FLOW to validator for staking rewards",
            "Monitor positions and rewards",
            "Optionally bridge assets to Flow EVM for Solidity DeFi",
        ],
    },
    {
        id: "flow-storacha-pipeline",
        name: "Storacha + Flow Verification",
        icon: "HardDrive",
        tags: ["storacha", "ipfs", "filecoin", "verification"],
        description: "Decentralized storage with on-chain verification",
        steps: [
            "Agent generates output (report, analysis, artifact)",
            "Upload to Storacha → get CID",
            "Record CID on Flow via Cadence transaction",
            "Verifier retrieves artifact from IPFS gateway using CID",
            "Compare on-chain CID reference with retrieved content",
            "Provable, immutable agent output storage",
        ],
    },
];

// ═══════════════════════════════════════════════════════════════
// Examples
// ═══════════════════════════════════════════════════════════════

export const FLOW_EXAMPLES: ModExample[] = [
    {
        id: "flow-send-payment-example",
        name: "Send 5 FLOW to an agent",
        description: "Policy check → within limits → broadcast tx → audit log → confirm",
        icon: "Send",
        tags: ["payment", "flow"],
        codeSnippet: `await sendFlow("0x1234abcd", "5.0");`,
        language: "typescript",
    },
    {
        id: "flow-post-bounty-example",
        name: "Post a 10 FLOW bounty",
        description: "Create bounty with FLOW reward — agents can claim and submit work",
        icon: "Trophy",
        tags: ["bounty", "agents"],
        codeSnippet: `await createFlowBounty({ title: "Analyze data", amount: flowToMiniFlow("10.0"), ... });`,
        language: "typescript",
    },
    {
        id: "flow-deploy-token-example",
        name: "Deploy a Fungible Token",
        description: "Deploy Cadence FT contract on Flow testnet with configurable supply",
        icon: "Rocket",
        tags: ["deploy", "token"],
        codeSnippet: `await createFlowDeployment({ type: "fungible_token", name: "SWCR", ... });`,
        language: "typescript",
    },
    {
        id: "flow-evm-example",
        name: "Deploy Solidity on Flow EVM",
        description: "Use standard Ethereum tooling with Flow EVM RPC (chain 747/545)",
        icon: "Code",
        tags: ["evm", "solidity"],
        codeSnippet: `const client = createPublicClient({ chain: flowEVM, transport: http() });`,
        language: "typescript",
    },
];

// ═══════════════════════════════════════════════════════════════
// Agent Skills
// ═══════════════════════════════════════════════════════════════

export const FLOW_AGENT_SKILLS: ModAgentSkill[] = [
    {
        id: "flow-treasury-manager",
        name: "Flow Treasury Manager",
        description: "Manages FLOW payments, policies, and bounties for agent operations",
        type: "skill",
        invocation: "flow_treasury",
        exampleInput: "Send 5 FLOW to agent Atlas for completing task #42",
        exampleOutput: "Payment created (id: pay_abc123), status: ready, within policy limits",
    },
];

// ═══════════════════════════════════════════════════════════════
// Manifest
// ═══════════════════════════════════════════════════════════════

export const FLOW_MANIFEST: ModManifest = {
    tools: FLOW_TOOLS,
    workflows: FLOW_WORKFLOWS,
    examples: FLOW_EXAMPLES,
    agentSkills: FLOW_AGENT_SKILLS,
};
