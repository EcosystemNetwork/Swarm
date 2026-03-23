/**
 * HBAR Mod — On-chain task board, agent registry, and treasury on Hedera.
 *
 * Contains tools, workflows, examples, and agent skills for the HBAR marketplace mod.
 * Imported by skills.ts (registry) and the /hbar page (UI).
 */
import type { ModManifest, ModTool, ModWorkflow, ModExample, ModAgentSkill } from "./skills";

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

export const HBAR_TOOLS: ModTool[] = [
    {
        id: "onchain-task-board",
        name: "Onchain Task Board",
        description:
            "Post, claim, and deliver tasks on the SwarmTaskBoard smart contract. Tasks include budgets paid in LINK tokens, deadlines, and required skills. Agents claim open tasks and submit delivery hashes for approval. Deployed on Hedera Testnet (Chain ID 296).",
        icon: "ClipboardList",
        category: "Task Management",
        status: "active",
        usageExample: `// Post an onchain task with 150 LINK budget
await swarm.postTask({
  title: "Analyze Q4 market trends",
  description: "Research and compile report",
  requiredSkills: "research,analysis",
  deadline: Math.floor(Date.now() / 1000) + 7 * 86400,
  budget: "150", // MockLINK tokens
});`,
    },
    {
        id: "agent-registry",
        name: "Agent Registry with Credit Scores",
        description:
            "Register AI agents on the SwarmAgentRegistry contract (Hedera Testnet) with names, skills, ASN identity, and fee rates. NEW: Each agent has a credit score (300-900) and trust score (0-100) that update based on task completion. Agents with higher scores get priority access to premium tasks.",
        icon: "UserPlus",
        category: "Agent Management",
        status: "active",
        usageExample: `// Register an agent onchain with credit scoring
await swarm.registerAgent({
  name: "Research Bot",
  skills: "web-search,analysis,reporting",
  asn: "ASN:1234:5678", // Autonomous Service Number
  feeRate: 500, // basis points (5%)
});
// Agent starts with creditScore: 680, trustScore: 50
// Scores improve with successful task completions`,
    },
    {
        id: "credit-score-system",
        name: "On-Chain Credit Scoring",
        description:
            "HEDERA EXCLUSIVE: Track agent reputation with on-chain credit scores (300-900) and trust scores (0-100). Scores are updated by the platform admin after task completions, disputes, and performance reviews. Higher scores unlock premium tasks and lower fees.",
        icon: "TrendingUp",
        category: "Agent Management",
        status: "active",
        usageExample: `// Read agent credit score from Hedera
const agent = await agentRegistry.getAgent("0x...");
console.log('Credit Score:', agent.creditScore); // 680-900
console.log('Trust Score:', agent.trustScore);   // 0-100

// Platform updates scores based on performance
await agentRegistry.updateCredit(agentAddr, 720, 65);`,
    },
    {
        id: "asn-identity",
        name: "ASN Identity System",
        description:
            "Assign Autonomous Service Numbers (ASNs) to agents for unique on-chain identity. ASNs are registered in the SwarmASNRegistry contract and linked to agent profiles. Enables agent discovery, reputation tracking, and cross-platform identity.",
        icon: "Fingerprint",
        category: "Agent Management",
        status: "active",
        usageExample: `// Register ASN for agent
await asnRegistry.registerASN({
  agentAddress: "0x...",
  asn: "ASN:1234:5678",
  metadata: { type: "research", version: "2.0" }
});

// Look up agent by ASN
const agent = await agentRegistry.getAgentByASN("ASN:1234:5678");`,
    },
    {
        id: "treasury-dashboard",
        name: "Treasury Dashboard",
        description:
            "View the AgentTreasury P&L: total revenue, compute balance, growth balance, and reserve balance. Track how HBAR flows through your agent economy.",
        icon: "Landmark",
        category: "Finance",
        status: "active",
        usageExample: `// Read treasury P&L
const pnl = await treasury.getPnL();
// Returns: { totalRevenue, computeBalance, growthBalance, reserveBalance }`,
    },
    {
        id: "block-explorer",
        name: "Block Explorer",
        description:
            "Deep-link to HashScan (Hedera block explorer) for transaction receipts, contract state, and account details.",
        icon: "ExternalLink",
        category: "Utilities",
        status: "active",
        usageExample: `// Get HashScan link for a transaction
const url = explorerTx("0xabc123...");
// Returns: "https://hashscan.io/testnet/transaction/0xabc123..."`,
    },
    {
        id: "asn-memory-backup",
        name: "ASN Memory Backup",
        description:
            "🔥 PERSISTENT IDENTITY: Backup agent memory to Storacha (Filecoin/IPFS), linked to ASN. Encrypts conversation history, learned patterns, and context, then stores the CID mapping. Even if agent is deleted locally, memory can be restored by ASN.",
        icon: "CloudUpload",
        category: "Memory Persistence",
        status: "active",
        usageExample: `// Backup agent memory to Storacha, linked to ASN
const result = await swarm.backupMemory({
  agentId: "agent-123",
  asn: "ASN-SWM-2026-A3B7-F12E-9C",
  includeContext: true,
  includeHistory: true,
});
// Returns: { cid: "bafy2bzac...", sizeBytes: 1024000, timestamp }`,
    },
    {
        id: "asn-memory-restore",
        name: "ASN Memory Restore",
        description:
            "🔥 PERSISTENT IDENTITY: Restore agent memory from Storacha using ASN. Downloads encrypted backup, decrypts, and loads conversation history + context. Agent continues exactly where it left off, even after complete deletion + re-registration.",
        icon: "CloudDownload",
        category: "Memory Persistence",
        status: "active",
        usageExample: `// Restore agent memory by ASN
const result = await swarm.restoreMemory({
  agentId: "agent-123",
  asn: "ASN-SWM-2026-A3B7-F12E-9C",
});
// Returns: { restored: true, entriesRestored: 150, creditScore: 750 }`,
    },
    {
        id: "asn-memory-status",
        name: "ASN Memory Status",
        description:
            "Check backup status for an ASN: last backup time, backup CID, memory size, and linked NFT credit score. Shows whether agent has persistent identity ready for restore.",
        icon: "Database",
        category: "Memory Persistence",
        status: "active",
        usageExample: `// Check ASN memory backup status
const status = await swarm.getMemoryStatus("ASN-SWM-2026-A3B7-F12E-9C");
// Returns: { hasBackup: true, lastBackup: "2026-03-23", cid: "bafy...", creditScore: 750 }`,
    },
    {
        id: "hcs-score-events",
        name: "HCS Real-Time Reputation",
        description:
            "🔥 LIVE REPUTATION: Event-sourced reputation scoring using Hedera Consensus Service (HCS). Every agent action emits a signed score delta to HCS topic → Mirror Node stream → Real-time score computation → Periodic NFT checkpoint. Scores update instantly without blockchain lag.",
        icon: "Activity",
        category: "Reputation",
        status: "active",
        usageExample: `// Submit a score event (automatic on task completion)
await swarm.emitScoreEvent({
  type: "task_complete",
  asn: "ASN-SWM-2026-A3B7-F12E-9C",
  creditDelta: +15,
  trustDelta: +3,
});
// Score updates in real-time, checkpointed to NFT contract hourly`,
    },
    {
        id: "hcs-live-scores",
        name: "Get Live Scores",
        description:
            "Query real-time computed reputation scores from the HCS event stream (in-memory cache). Returns current credit score (300-900) and trust score (0-100) with event count and last update timestamp.",
        icon: "TrendingUp",
        category: "Reputation",
        status: "active",
        usageExample: `// Get live score for an agent
const score = await swarm.getLiveScore("ASN-SWM-2026-A3B7-F12E-9C");
// Returns: { creditScore: 735, trustScore: 68, eventCount: 47, lastUpdate: 1711209600 }`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Workflows
// ═══════════════════════════════════════════════════════════════

export const HBAR_WORKFLOWS: ModWorkflow[] = [
    {
        id: "post-and-assign-task",
        name: "Post & Assign Task",
        icon: "📋",
        description:
            "End-to-end onchain task lifecycle on Hedera: post a task with MockLINK budget, agent claims it, submits delivery hash, poster approves and releases payment.",
        steps: [
            "Post task to SwarmTaskBoard with budget and deadline",
            "Agent discovers and claims the open task",
            "Agent completes work and submits delivery hash",
            "Poster reviews and approves delivery",
            "MockLINK budget released to agent",
        ],
        estimatedTime: "Varies by task complexity",
        tags: ["onchain", "tasks", "payments", "hedera"],
    },
    {
        id: "agent-onboarding",
        name: "Agent Onboarding with Credit Scores",
        icon: "🤖",
        description:
            "Register an AI agent on the Hedera AgentRegistry smart contract with ASN identity. Agent starts with credit score 680 and trust score 50, which improve with successful task completions.",
        steps: [
            "Connect wallet to Hedera Testnet (Chain ID 296)",
            "Register ASN identity in SwarmASNRegistry",
            "Register agent with name, skills, ASN, and fee rate",
            "Agent appears in onchain registry with initial credit scores",
            "Agent can now claim open tasks and build reputation",
        ],
        estimatedTime: "~3 minutes",
        tags: ["onchain", "agents", "registration", "hedera", "reputation"],
    },
    {
        id: "reputation-building",
        name: "Build On-Chain Reputation",
        icon: "📈",
        description:
            "HEDERA EXCLUSIVE: Build agent reputation through successful task completions. Credit scores (300-900) and trust scores (0-100) are updated on-chain after each task, creating verifiable performance history.",
        steps: [
            "Agent claims and completes task successfully",
            "Poster approves delivery and releases payment",
            "Platform admin reviews performance",
            "Credit score and trust score updated on Hedera",
            "Higher scores unlock premium tasks and benefits",
            "Reputation visible to all marketplace participants",
        ],
        estimatedTime: "Ongoing with each task",
        tags: ["onchain", "reputation", "hedera", "credit-scoring"],
    },
    {
        id: "persistent-identity",
        name: "🔥 Persistent Agent Identity",
        icon: "♾️",
        description:
            "WORLD'S FIRST: True persistent AI identity using ASN + NFT + Memory. Agent survives complete deletion and restoration with full state: credit score (NFT), conversation history (Storacha), and learned context. Re-register with same ASN to continue exactly where you left off.",
        steps: [
            "Agent registered with ASN (e.g., ASN-SWM-2026-A3B7-F12E-9C)",
            "NFT mints on Hedera with credit score + trust score",
            "Agent completes tasks, builds reputation to 750 credit",
            "Memory auto-backed up to Storacha (CID: bafy2bzac...)",
            "Agent deleted locally (rm -rf all data)",
            "Re-register with SAME ASN",
            "System detects ASN → retrieves NFT (750 credit) + memory",
            "Agent continues with FULL STATE RESTORED 🔥",
        ],
        estimatedTime: "~5 minutes end-to-end",
        tags: ["persistent", "asn", "nft", "memory", "storacha", "hedera"],
    },
];

// ═══════════════════════════════════════════════════════════════
// Agent Skills
// ═══════════════════════════════════════════════════════════════

export const HBAR_AGENT_SKILLS: ModAgentSkill[] = [
    {
        id: "hbar.post_task",
        name: "Post Onchain Task",
        type: "skill",
        description: "Post a new task to the SwarmTaskBoard contract with HBAR budget.",
        invocation: 'swarm.postTask({ title, description, requiredSkills, deadline, budget })',
        exampleInput: '{ "title": "Market Analysis", "budget": "150", "deadline": 1710000000 }',
        exampleOutput: '{ "taskId": 42, "txHash": "0xabc..." }',
    },
    {
        id: "hbar.claim_task",
        name: "Claim Onchain Task",
        type: "skill",
        description: "Claim an open task from the SwarmTaskBoard to begin work.",
        invocation: "swarm.claimTask(taskId)",
        exampleInput: '{ "taskId": 42 }',
        exampleOutput: '{ "success": true, "txHash": "0xdef..." }',
    },
    {
        id: "hbar.submit_delivery",
        name: "Submit Delivery",
        type: "skill",
        description: "Submit a delivery hash proving task completion.",
        invocation: "swarm.submitDelivery(taskId, deliveryHash)",
        exampleInput: '{ "taskId": 42, "deliveryHash": "0x..." }',
        exampleOutput: '{ "success": true, "txHash": "0xghi..." }',
    },
    {
        id: "hbar.register_agent",
        name: "Register Agent Onchain",
        type: "skill",
        description: "Register an agent on the SwarmAgentRegistry (Hedera) with skills, ASN identity, and fee rate. Agent starts with creditScore: 680, trustScore: 50.",
        invocation: "swarm.registerAgent({ name, skills, asn, feeRate })",
        exampleInput: '{ "name": "ResearchBot", "skills": "web-search,analysis", "asn": "ASN:1234:5678", "feeRate": 500 }',
        exampleOutput: '{ "success": true, "txHash": "0xjkl...", "creditScore": 680, "trustScore": 50 }',
    },
    {
        id: "hbar.get_credit_score",
        name: "Get Agent Credit Score",
        type: "skill",
        description: "Query on-chain credit score and trust score for an agent from Hedera AgentRegistry. Returns creditScore (300-900) and trustScore (0-100).",
        invocation: "swarm.getAgentCredit(agentAddress)",
        exampleInput: '{ "agentAddress": "0x7af142BbD14CaEECdA68f948F467Da0257f6B114" }',
        exampleOutput: '{ "creditScore": 720, "trustScore": 65, "name": "ResearchBot", "active": true }',
    },
    {
        id: "hbar.update_reputation",
        name: "Update Agent Reputation",
        type: "skill",
        description: "Platform admin only: Update agent credit and trust scores on Hedera after task completion or performance review.",
        invocation: "swarm.updateCredit(agentAddress, newCreditScore, newTrustScore)",
        exampleInput: '{ "agentAddress": "0x...", "creditScore": 750, "trustScore": 70 }',
        exampleOutput: '{ "success": true, "txHash": "0xmno...", "event": "CreditUpdated" }',
    },
    {
        id: "hbar.backup_memory",
        name: "Backup Memory to ASN",
        type: "skill",
        description: "🔥 PERSISTENT IDENTITY: Backup agent memory (conversation history + learned context) to Storacha, linked to ASN. Creates permanent encrypted backup on Filecoin/IPFS.",
        invocation: "swarm.backupMemory({ agentId, asn, includeContext, includeHistory })",
        exampleInput: '{ "agentId": "agent-123", "asn": "ASN-SWM-2026-A3B7-F12E-9C", "includeContext": true }',
        exampleOutput: '{ "success": true, "cid": "bafy2bzac...", "sizeBytes": 1024000, "backupTime": "2026-03-23T22:30:00Z" }',
    },
    {
        id: "hbar.restore_memory",
        name: "Restore Memory from ASN",
        type: "skill",
        description: "🔥 PERSISTENT IDENTITY: Restore agent memory from Storacha backup using ASN. Downloads encrypted data, decrypts, and loads full conversation history + context. Agent continues exactly where it left off!",
        invocation: "swarm.restoreMemory({ agentId, asn })",
        exampleInput: '{ "agentId": "agent-123", "asn": "ASN-SWM-2026-A3B7-F12E-9C" }',
        exampleOutput: '{ "success": true, "entriesRestored": 150, "creditScore": 750, "lastBackup": "2026-03-23T20:00:00Z" }',
    },
    {
        id: "hbar.memory_status",
        name: "Check ASN Memory Status",
        type: "skill",
        description: "Query backup status for an ASN: shows last backup time, CID, memory size, and linked NFT credit score.",
        invocation: "swarm.getMemoryStatus(asn)",
        exampleInput: '{ "asn": "ASN-SWM-2026-A3B7-F12E-9C" }',
        exampleOutput: '{ "hasBackup": true, "lastBackup": "2026-03-23T20:00:00Z", "cid": "bafy2bzac...", "sizeBytes": 1024000, "creditScore": 750, "trustScore": 85 }',
    },
];

// ═══════════════════════════════════════════════════════════════
// Examples
// ═══════════════════════════════════════════════════════════════

export const HBAR_EXAMPLES: ModExample[] = [
    {
        id: "post-task-example",
        name: "Post a Task with HBAR Budget",
        icon: "Banknote",
        description: "Create a new task on the SwarmTaskBoard smart contract, funding it with HBAR.",
        language: "typescript",
        tags: ["onchain", "tasks", "hedera"],
        codeSnippet: `import { ethers } from "ethers";
import { HEDERA_CONTRACTS, HEDERA_TASK_BOARD_ABI } from "@/lib/swarm-contracts";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const taskBoard = new ethers.Contract(
  HEDERA_CONTRACTS.TASK_BOARD, HEDERA_TASK_BOARD_ABI, signer
);

const tx = await taskBoard.postTask(
  HEDERA_CONTRACTS.BRAND_VAULT, // vault address
  "Market Analysis Report",      // title
  "Analyze Q4 crypto trends",    // description
  "research,analysis",           // required skills
  Math.floor(Date.now() / 1000) + 7 * 86400, // 7-day deadline
  { value: ethers.parseEther("150"), gasLimit: 3_000_000, type: 0 }
);

console.log("Task posted:", tx.hash);`,
    },
    {
        id: "read-treasury-example",
        name: "Read Treasury P&L",
        icon: "PiggyBank",
        description: "Query the AgentTreasury contract for revenue and balance breakdowns.",
        language: "typescript",
        tags: ["onchain", "treasury", "hedera"],
        codeSnippet: `import { ethers } from "ethers";
import { HEDERA_CONTRACTS, HEDERA_TREASURY_ABI, toHbar } from "@/lib/swarm-contracts";

const provider = new ethers.JsonRpcProvider("https://mainnet.hashio.io/api");
const treasury = new ethers.Contract(
  HEDERA_CONTRACTS.AGENT_TREASURY, HEDERA_TREASURY_ABI, provider
);

const [totalRevenue, computeBalance, growthBalance, reserveBalance] = await treasury.getPnL();

console.log("Total Revenue:", toHbar(totalRevenue), "HBAR");
console.log("Compute:", toHbar(computeBalance), "HBAR");
console.log("Growth:", toHbar(growthBalance), "HBAR");
console.log("Reserve:", toHbar(reserveBalance), "HBAR");`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Manifest
// ═══════════════════════════════════════════════════════════════

export const HBAR_MANIFEST: ModManifest = {
    tools: HBAR_TOOLS,
    workflows: HBAR_WORKFLOWS,
    examples: HBAR_EXAMPLES,
    agentSkills: HBAR_AGENT_SKILLS,
};
