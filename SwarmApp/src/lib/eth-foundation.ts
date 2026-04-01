/**
 * Ethereum Foundation Mod — Community & Network Public Goods
 *
 * ETH wallet auth, ETH/ERC-20 payments, agent treasury, spending policy, bounties,
 * smart contract deployment, and ESP-aligned public goods tooling on Ethereum.
 *
 * Hackathon track: PL Genesis — Ethereum Foundation Community/Network
 * Entry point: Wallet connect → fund/pay/approve → build public goods
 *
 * Ethereum uses:
 *   - ECDSA secp256k1 + keccak256 for signatures
 *   - 18 decimal places (wei) for ETH amounts
 *   - Solidity smart contract language
 *   - EIP-1193 / wagmi / viem for frontend wallet integration
 */
import type { ModManifest, ModTool, ModWorkflow, ModExample, ModAgentSkill } from "./skills";

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

export const ETH_FOUNDATION_TOOLS: ModTool[] = [
    {
        id: "eth-wallet-connect",
        name: "Wallet Connect",
        description:
            "Connect MetaMask, WalletConnect, Coinbase Wallet, or any EIP-1193 wallet. Binds an Ethereum address to a Swarm org or agent. Mandatory first step for all ETH payment flows.",
        icon: "Wallet",
        category: "Wallet",
        status: "active",
        usageExample: `// Wallet connection via wagmi/viem
import { createWalletClient, custom } from "viem";
import { mainnet, sepolia } from "viem/chains";

const client = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});
const [address] = await client.requestAddresses();
console.log("Connected:", address);`,
    },
    {
        id: "eth-balance",
        name: "ETH Balance Reader",
        description:
            "Read ETH balance for any Ethereum address. Returns balance in wei with 18 decimal precision.",
        icon: "Eye",
        category: "Wallet",
        status: "active",
        usageExample: `// Query ETH balance via viem
import { createPublicClient, http, formatEther } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({ chain: sepolia, transport: http() });
const balance = await client.getBalance({ address: "0x..." });
console.log("Balance:", formatEther(balance), "ETH");`,
    },
    {
        id: "eth-send-payment",
        name: "Send ETH",
        description:
            "Send ETH to any Ethereum address. Policy-checked before broadcast. Supports memo field for task attribution via tx data.",
        icon: "Send",
        category: "Payments",
        status: "active",
        usageExample: `// Send ETH via viem
import { parseEther } from "viem";

const hash = await walletClient.sendTransaction({
  to: recipientAddress,
  value: parseEther("0.1"),
  data: encodeMemo("Task #42 payment"),
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Confirmed in block:", receipt.blockNumber);`,
    },
    {
        id: "eth-erc20-balances",
        name: "ERC-20 Token Balances",
        description:
            "List all ERC-20 token balances for an Ethereum address. Supports ETH, USDC, USDT, DAI, and any custom ERC-20 contract.",
        icon: "Coins",
        category: "Tokens",
        status: "active",
        usageExample: `// Query ERC-20 balance
const balance = await publicClient.readContract({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [address],
});`,
    },
    {
        id: "eth-nft-holdings",
        name: "NFT Holdings",
        description:
            "Fetch ERC-721 and ERC-1155 NFTs owned by an Ethereum address. Can be used for access gating and reputation badges.",
        icon: "Image",
        category: "NFTs",
        status: "active",
        usageExample: `// Query ERC-721 balance
const count = await publicClient.readContract({
  address: nftContractAddress,
  abi: erc721Abi,
  functionName: "balanceOf",
  args: [ownerAddress],
});`,
    },
    {
        id: "eth-staking",
        name: "ETH Staking",
        description:
            "Stake ETH via Lido, Rocket Pool, or native beacon chain deposits. Track staking rewards and validator performance.",
        icon: "TrendingUp",
        category: "DeFi",
        status: "active",
        usageExample: `// Stake via Lido stETH
const hash = await walletClient.sendTransaction({
  to: LIDO_STETH_ADDRESS,
  value: parseEther("1.0"),
  data: encodeFunctionData({
    abi: lidoAbi,
    functionName: "submit",
    args: [referralAddress],
  }),
});`,
    },
    {
        id: "eth-ens",
        name: "ENS Resolution",
        description:
            "Resolve ENS names to addresses and reverse-resolve addresses to ENS names. Supports subdomains and text records for agent identity.",
        icon: "Globe",
        category: "Identity",
        status: "active",
        usageExample: `// Resolve ENS
const address = await publicClient.getEnsAddress({ name: "vitalik.eth" });
const name = await publicClient.getEnsName({ address: "0xd8dA..." });
const avatar = await publicClient.getEnsAvatar({ name: "vitalik.eth" });`,
    },
    {
        id: "eth-policy-check",
        name: "Spending Policy",
        description:
            "Policy-gated payment controls: per-tx caps, daily/monthly limits, address allowlists, approval queues, and kill switch. Same battle-tested model as Flow and TON Treasury.",
        icon: "Shield",
        category: "Policy",
        status: "active",
        usageExample: `// Check payment against org policy
const result = await checkEthPolicy({
  orgId: "org-123",
  toAddress: "0x1234...",
  amount: parseEther("1.0").toString(),
});
if (!result.allowed) {
  console.log("Blocked:", result.reason);
} else if (result.requiresApproval) {
  console.log("Requires human approval");
}`,
    },
    {
        id: "eth-bounty-board",
        name: "Bounty Board",
        description:
            "Post task bounties with ETH rewards. Agents claim, submit proof, admin approves, ETH released. Platform fee on payout (configurable bps). Designed for ESP-style public goods work.",
        icon: "Trophy",
        category: "Bounties",
        status: "active",
        usageExample: `// Post a bounty
const bounty = await createEthBounty({
  orgId: "org-123",
  title: "Build open-source EIP library",
  description: "Create a TypeScript SDK for parsing and validating EIPs",
  amount: parseEther("0.5").toString(),
  token: "ETH",
  tokenSymbol: "ETH",
  funderAddress: "0x1234...",
  status: "open",
  tags: ["public-goods", "tooling"],
  postedBy: "admin@org",
});`,
    },
    {
        id: "eth-deploy-contract",
        name: "Deploy Contract",
        description:
            "Deploy Solidity contracts on Ethereum mainnet or Sepolia testnet. Supports ERC-20, ERC-721, ERC-1155, governance contracts, and custom public goods infrastructure.",
        icon: "Rocket",
        category: "Deploy",
        status: "active",
        usageExample: `// Deploy a Solidity contract via viem
const hash = await walletClient.deployContract({
  abi: contractAbi,
  bytecode: contractBytecode,
  args: [constructorArg1, constructorArg2],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Deployed at:", receipt.contractAddress);`,
    },
    {
        id: "eth-public-goods",
        name: "Public Goods Tracker",
        description:
            "Track and report on public goods contributions aligned with Ethereum Foundation ESP priorities. Log open-source commits, grant milestones, and community impact metrics.",
        icon: "Heart",
        category: "Community",
        status: "active",
        usageExample: `// Log a public goods contribution
await logPublicGoodsContribution({
  orgId, agentId,
  type: "open_source_commit",
  repo: "github.com/org/public-sdk",
  description: "Added EIP-4844 blob parsing support",
  impactScore: 15,
});`,
    },
    {
        id: "eth-governance",
        name: "Governance Participation",
        description:
            "Participate in on-chain governance: create proposals, delegate votes, and track governance activity across Ethereum DAOs (Governor, Snapshot, Tally).",
        icon: "Vote",
        category: "Governance",
        status: "active",
        usageExample: `// Delegate votes
const hash = await walletClient.writeContract({
  address: governanceTokenAddress,
  abi: erc20VotesAbi,
  functionName: "delegate",
  args: [delegateAddress],
});`,
    },
    {
        id: "eth-asn-identity",
        name: "ASN Identity on Ethereum",
        description:
            "Link Agent Social Numbers (ASN-SWM-YYYY-HHHH-HHHH-CC) to Ethereum blockchain. Cross-chain identity that syncs reputation between Hedera, Flow, and Ethereum.",
        icon: "Fingerprint",
        category: "Identity",
        status: "active",
        usageExample: `// Link ASN to Ethereum
const record = await ensureEthASNRecord(asn, orgId, agentId);
await linkEthWallet(asn, "0x1234...", "sepolia", true);
// Reputation events automatically update ASN scores across chains`,
    },
    {
        id: "eth-reputation-engine",
        name: "Reputation Engine",
        description:
            "ASN-linked reputation scoring on Ethereum. Credit (300-900) and trust (0-100) scores updated by task completion, bounties, public goods contributions, and governance participation. Tiers: Bronze > Silver > Gold > Platinum > Diamond.",
        icon: "Star",
        category: "Reputation",
        status: "active",
        usageExample: `// Record a reputation event
await recordReputationEvent({
  orgId, agentId, asn, event: "public_goods_contribution",
  creditDelta: +20, trustDelta: +10,
  newCreditScore: 720, newTrustScore: 60,
  reason: "Shipped open-source EIP parser library",
});`,
    },
    {
        id: "eth-dex-swap",
        name: "DEX Token Swap",
        description:
            "Swap tokens on Uniswap V3. Supports ETH, USDC, DAI, WETH, and any ERC-20. Configurable slippage tolerance and deadline.",
        icon: "RefreshCw",
        category: "DeFi",
        status: "active",
        usageExample: `const quote = await createSwapQuote({
  dex: "uniswap-v3", tokenInSymbol: "ETH", tokenOutSymbol: "USDC",
  amountIn: parseEther("1.0").toString(), slippageBps: 50,
});`,
    },
    {
        id: "eth-l2-bridge",
        name: "L2 Bridge",
        description:
            "Bridge assets between Ethereum L1 and L2s (Optimism, Arbitrum, Base, Starknet). Move ETH, ERC-20s, and NFTs across execution layers.",
        icon: "GitBranch",
        category: "Bridge",
        status: "active",
        usageExample: `const tx = await createBridgeTransaction({
  direction: "l1_to_l2", targetL2: "base",
  tokenSymbol: "ETH", amount: parseEther("0.5").toString(),
  fromAddress: "0x1234...", toAddress: "0x5678...",
});`,
    },
    // ── ERC-8004: Agent Registry & Trust Infrastructure ──
    {
        id: "erc8004-register-agent",
        name: "ERC-8004 Agent Registry",
        description:
            "Register autonomous agents as on-chain entities via ERC-8004 (EIP-8004). Each agent gets a unique tokenId (ERC-721), linked to an operator wallet. The registry stores agent metadata URI, capability manifest, and creation timestamp. Agents become first-class economic actors with verifiable identity.",
        icon: "Fingerprint",
        category: "ERC-8004",
        status: "active",
        usageExample: `// Register agent via ERC-8004 Agent Registry
import { encodeFunctionData } from "viem";

const hash = await walletClient.writeContract({
  address: ERC8004_REGISTRY_ADDRESS,
  abi: agentRegistryAbi,
  functionName: "registerAgent",
  args: [operatorAddress, metadataURI],
  // metadataURI → IPFS CID pointing to agent.json manifest
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
// Extract tokenId from Transfer event
const tokenId = receipt.logs[0].topics[3];
console.log("Agent registered, tokenId:", tokenId);`,
    },
    {
        id: "erc8004-reputation-registry",
        name: "ERC-8004 Reputation Registry",
        description:
            "Read and write agent reputation scores via the ERC-8004 Reputation Registry. Tracks task completions, bounty payouts, dispute outcomes, and peer attestations. Reputation is composable — other contracts and agents can query trust levels before transacting.",
        icon: "Star",
        category: "ERC-8004",
        status: "active",
        usageExample: `// Query agent reputation
const rep = await publicClient.readContract({
  address: ERC8004_REPUTATION_ADDRESS,
  abi: reputationRegistryAbi,
  functionName: "getReputation",
  args: [agentTokenId],
});
console.log("Score:", rep.score, "Total tasks:", rep.taskCount);

// Update reputation after task completion
await walletClient.writeContract({
  address: ERC8004_REPUTATION_ADDRESS,
  abi: reputationRegistryAbi,
  functionName: "recordCompletion",
  args: [agentTokenId, taskId, score],
});`,
    },
    {
        id: "erc8004-validation-registry",
        name: "ERC-8004 Validation Registry",
        description:
            "Third-party validation of agent capabilities via ERC-8004 Validation Registry. Validators attest to agent skills, audit completions, and safety certifications. Agents with more validations rank higher in trust-gated marketplaces.",
        icon: "ShieldCheck",
        category: "ERC-8004",
        status: "active",
        usageExample: `// Validate an agent's capability
await walletClient.writeContract({
  address: ERC8004_VALIDATION_ADDRESS,
  abi: validationRegistryAbi,
  functionName: "validate",
  args: [agentTokenId, capabilityHash, expiresAt],
});

// Check if agent has a specific validation
const isValid = await publicClient.readContract({
  address: ERC8004_VALIDATION_ADDRESS,
  abi: validationRegistryAbi,
  functionName: "isValidated",
  args: [agentTokenId, capabilityHash],
});`,
    },
    {
        id: "erc8004-trust-gating",
        name: "ERC-8004 Trust-Gated Transactions",
        description:
            "Gate agent-to-agent transactions by on-chain trust scores. Before an agent transacts, delegates, or collaborates, it queries the ERC-8004 Reputation Registry and only proceeds if the counterparty meets minimum trust thresholds. Prevents Sybil attacks and low-quality agent interactions.",
        icon: "Shield",
        category: "ERC-8004",
        status: "active",
        usageExample: `// Trust-gated task delegation
const rep = await getAgentReputation(counterpartyTokenId);
if (rep.score < MIN_TRUST_THRESHOLD) {
  throw new Error("Agent does not meet trust requirements");
}
// Proceed with delegation
await delegateTask(counterpartyTokenId, taskPayload);`,
    },
    {
        id: "erc8004-agent-manifest",
        name: "Agent Capability Manifest",
        description:
            "Machine-readable agent.json manifest per DevSpot Agent Compatibility spec. Includes agent name, operator wallet, ERC-8004 identity (tokenId), supported tools, tech stacks, compute constraints, and task categories. Stored on IPFS/Storacha, referenced by on-chain metadataURI.",
        icon: "FileText",
        category: "ERC-8004",
        status: "active",
        usageExample: `// Generate agent.json manifest
const manifest = {
  name: "Atlas",
  operator: operatorWallet,
  erc8004TokenId: 42,
  supportedTools: ["code_gen", "github", "blockchain_tx"],
  techStacks: ["typescript", "solidity", "python"],
  computeConstraints: { maxTokens: 100000, maxCostUsd: 5.0 },
  taskCategories: ["defi", "public-goods", "governance"],
};
const cid = await uploadToStoracha(JSON.stringify(manifest));`,
    },
    {
        id: "erc8004-execution-logs",
        name: "Structured Execution Logs",
        description:
            "Produce structured agent_log.json showing autonomous decisions, tool calls, retries, failures, and outputs. Required for 'Agent Only: Let the agent cook' bounty. Logs are CID-anchored for verifiable provenance.",
        icon: "FileText",
        category: "ERC-8004",
        status: "active",
        usageExample: `// Structured execution log entry
const logEntry = {
  timestamp: Date.now(),
  phase: "execute",
  decision: "Deploying ERC-20 contract for bounty payout",
  toolCalls: [{ tool: "eth-deploy-contract", args: { abi, bytecode } }],
  result: { success: true, contractAddress: "0x..." },
  gasUsed: "0.002 ETH",
  budgetRemaining: "0.48 ETH",
};
executionLog.push(logEntry);`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Workflows
// ═══════════════════════════════════════════════════════════════

export const ETH_FOUNDATION_WORKFLOWS: ModWorkflow[] = [
    {
        id: "eth-agent-payment",
        name: "Agent Payment Pipeline",
        icon: "Send",
        tags: ["payment", "policy", "audit"],
        description: "End-to-end agent payment: connect wallet → policy check → tx → audit",
        steps: [
            "Connect Ethereum wallet via EIP-1193 provider",
            "Verify wallet ownership (SIWE — Sign-In with Ethereum)",
            "Check spending policy (per-tx cap, daily limit, allowlist)",
            "If within policy: broadcast transaction",
            "Wait for transaction confirmation (~12 sec finality)",
            "Log audit entry with tx hash",
            "Update payment status to 'executed'",
        ],
    },
    {
        id: "eth-bounty-lifecycle",
        name: "Bounty Lifecycle",
        icon: "Trophy",
        tags: ["bounty", "escrow", "agents"],
        description: "Full bounty flow from posting to ETH release",
        steps: [
            "Admin posts bounty with ETH reward amount",
            "Agent claims bounty (status → claimed)",
            "Agent submits deliverable proof (CID, URL, or text)",
            "Admin reviews and approves/rejects",
            "On approval: calculate platform fee (configurable bps)",
            "Broadcast ETH transfer to claimer (net of fee)",
            "Update bounty with tx hash and resolved status",
        ],
    },
    {
        id: "eth-public-goods-pipeline",
        name: "Public Goods Pipeline",
        icon: "Heart",
        tags: ["public-goods", "esp", "grants"],
        description: "Track and fund Ethereum public goods aligned with ESP priorities",
        steps: [
            "Identify public goods gap from ESP Wishlist/RFP",
            "Create bounty with ETH reward for open-source deliverable",
            "Agent builds and submits proof (GitHub commit, CID, demo)",
            "Community review and governance vote",
            "Release ETH reward to contributor",
            "Log contribution to public goods tracker",
            "Update agent reputation with public goods credit",
        ],
    },
    {
        id: "eth-governance-pipeline",
        name: "Governance Participation",
        icon: "Vote",
        tags: ["governance", "dao", "voting"],
        description: "On-chain governance: delegate, propose, vote, execute",
        steps: [
            "Connect wallet and verify token holdings",
            "Delegate voting power (self or to representative)",
            "Create or review governance proposal",
            "Cast vote during voting period",
            "Track proposal status through to execution",
            "Log governance participation for reputation scoring",
        ],
    },
    {
        id: "eth-defi-pipeline",
        name: "DeFi Pipeline",
        icon: "TrendingUp",
        tags: ["defi", "swap", "staking"],
        description: "Ethereum DeFi operations: swap, stake, and earn",
        steps: [
            "Connect wallet",
            "Query token balances (ETH + ERC-20s)",
            "Execute swap on Uniswap V3",
            "Or stake ETH via Lido/Rocket Pool",
            "Monitor positions and rewards",
            "Optionally bridge assets to L2 for lower gas",
        ],
    },
    // ── ERC-8004 Workflows ──
    {
        id: "erc8004-agent-registration",
        name: "ERC-8004 Agent Registration",
        icon: "Fingerprint",
        tags: ["erc-8004", "identity", "agent", "on-chain"],
        description: "Full agent identity lifecycle: generate manifest, register on-chain, link ASN",
        steps: [
            "Generate agent.json capability manifest",
            "Upload manifest to Storacha/IPFS → get CID",
            "Call registerAgent(operatorAddress, metadataURI) on ERC-8004 Registry",
            "Extract tokenId from Transfer event",
            "Link tokenId to ASN record (cross-chain identity)",
            "Initialize reputation in Reputation Registry",
            "Store ERC-8004 identity in Firestore agent record",
        ],
    },
    {
        id: "erc8004-trust-gated-delegation",
        name: "Trust-Gated Task Delegation",
        icon: "Shield",
        tags: ["erc-8004", "trust", "delegation", "multi-agent"],
        description: "Delegate tasks only to agents meeting trust thresholds via ERC-8004",
        steps: [
            "Receive task requiring delegation",
            "Query ERC-8004 Reputation Registry for candidate agents",
            "Filter candidates by minimum trust score threshold",
            "Check Validation Registry for required capability attestations",
            "Select highest-trust agent meeting all criteria",
            "Execute trust-gated delegation with on-chain audit trail",
            "On completion: update reputation scores for both parties",
        ],
    },
    {
        id: "erc8004-autonomous-agent-loop",
        name: "Autonomous Agent Execution Loop",
        icon: "Bot",
        tags: ["erc-8004", "autonomous", "agent-cook", "bounty"],
        description: "End-to-end autonomous agent: discover → plan → execute → verify → submit (Agent Only bounty)",
        steps: [
            "Discover problem/task from hackathon challenges or bounty board",
            "Plan solution with task decomposition and tool selection",
            "Execute using real tools (GitHub, blockchain, APIs)",
            "Self-correct on errors with retry logic and guardrails",
            "Verify output quality and validate transaction parameters",
            "Produce structured execution logs (agent_log.json)",
            "Submit result with CID-anchored provenance",
            "Update ERC-8004 reputation on completion",
        ],
    },
];

// ═══════════════════════════════════════════════════════════════
// Examples
// ═══════════════════════════════════════════════════════════════

export const ETH_FOUNDATION_EXAMPLES: ModExample[] = [
    {
        id: "eth-send-payment-example",
        name: "Send 0.1 ETH to an agent",
        description: "Policy check → within limits → broadcast tx → audit log → confirm",
        icon: "Send",
        tags: ["payment", "eth"],
        codeSnippet: `await sendEth("0x1234...", "0.1");`,
        language: "typescript",
    },
    {
        id: "eth-post-bounty-example",
        name: "Post a 0.5 ETH bounty",
        description: "Create bounty with ETH reward — agents can claim and submit work",
        icon: "Trophy",
        tags: ["bounty", "agents"],
        codeSnippet: `await createEthBounty({ title: "Build EIP parser", amount: parseEther("0.5").toString(), ... });`,
        language: "typescript",
    },
    {
        id: "eth-deploy-example",
        name: "Deploy a Solidity Contract",
        description: "Deploy ERC-20 or governance contract on Sepolia testnet",
        icon: "Rocket",
        tags: ["deploy", "solidity"],
        codeSnippet: `await deployContract({ abi, bytecode, args: [name, symbol, supply] });`,
        language: "typescript",
    },
    {
        id: "eth-public-goods-example",
        name: "Log public goods contribution",
        description: "Track open-source work aligned with ESP priorities",
        icon: "Heart",
        tags: ["public-goods", "esp"],
        codeSnippet: `await logPublicGoodsContribution({ type: "open_source_commit", repo: "...", impactScore: 15 });`,
        language: "typescript",
    },
];

// ═══════════════════════════════════════════════════════════════
// Agent Skills
// ═══════════════════════════════════════════════════════════════

export const ETH_FOUNDATION_AGENT_SKILLS: ModAgentSkill[] = [
    {
        id: "eth-treasury-manager",
        name: "ETH Treasury Manager",
        description: "Manages ETH payments, policies, and bounties for agent operations",
        type: "skill",
        invocation: "eth_treasury",
        exampleInput: "Send 0.1 ETH to agent Atlas for completing public goods task #42",
        exampleOutput: "Payment created (id: pay_abc123), status: ready, within policy limits",
    },
    {
        id: "eth-public-goods-agent",
        name: "Public Goods Agent",
        description: "Identifies and tracks Ethereum public goods opportunities from ESP Wishlists and community needs",
        type: "skill",
        invocation: "eth_public_goods",
        exampleInput: "Find open ESP RFPs related to developer tooling",
        exampleOutput: "Found 3 active RFPs: EIP parser SDK, Gas estimation library, ABI decoder improvements",
    },
    {
        id: "eth-erc8004-agent-identity",
        name: "ERC-8004 Agent Identity Manager",
        description: "Registers and manages agent identities using ERC-8004 Agent Registry. Creates on-chain agent records with operator wallets, capability manifests, and trust signals.",
        type: "skill",
        invocation: "erc8004_identity",
        exampleInput: "Register agent Atlas with ERC-8004 identity on Sepolia",
        exampleOutput: "Agent registered: tokenId #42, operator 0xABC..., registry tx 0xDEF..., trust score initialized at 50",
    },
    {
        id: "eth-erc8004-trust-evaluator",
        name: "ERC-8004 Trust Evaluator",
        description: "Evaluates agent trust using ERC-8004 reputation and validation registries. Reads on-chain trust signals to gate agent-to-agent transactions and task delegation.",
        type: "skill",
        invocation: "erc8004_trust",
        exampleInput: "Evaluate trust for agent 0x1234 before delegating DeFi task",
        exampleOutput: "Trust score: 78/100, reputation: Gold tier, 15 validations, 0 disputes — safe to delegate",
    },
];

// ═══════════════════════════════════════════════════════════════
// Manifest
// ═══════════════════════════════════════════════════════════════

export const ETH_FOUNDATION_MANIFEST: ModManifest = {
    tools: ETH_FOUNDATION_TOOLS,
    workflows: ETH_FOUNDATION_WORKFLOWS,
    examples: ETH_FOUNDATION_EXAMPLES,
    agentSkills: ETH_FOUNDATION_AGENT_SKILLS,
};
