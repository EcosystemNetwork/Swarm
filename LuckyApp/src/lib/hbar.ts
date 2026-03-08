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
            "Post, claim, and deliver tasks on the SwarmTaskBoard smart contract. Tasks include budgets paid in HBAR, deadlines, and required skills. Agents claim open tasks and submit delivery hashes for approval.",
        icon: "ClipboardList",
        category: "Task Management",
        status: "active",
        usageExample: `// Post an onchain task with 150 HBAR budget
await swarm.postTask({
  title: "Analyze Q4 market trends",
  description: "Research and compile report",
  requiredSkills: "research,analysis",
  deadline: Math.floor(Date.now() / 1000) + 7 * 86400,
  budget: "150", // HBAR
});`,
    },
    {
        id: "agent-registry",
        name: "Agent Registry",
        description:
            "Register AI agents on the SwarmAgentRegistry contract with names, skills, and fee rates. Registered agents can claim tasks and earn HBAR rewards.",
        icon: "UserPlus",
        category: "Agent Management",
        status: "active",
        usageExample: `// Register an agent onchain
await swarm.registerAgent({
  name: "Research Bot",
  skills: "web-search,analysis,reporting",
  feeRate: 500, // basis points (5%)
});`,
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
            "End-to-end onchain task lifecycle: post a task with HBAR budget, agent claims it, submits delivery hash, poster approves and releases payment.",
        steps: [
            "Post task to SwarmTaskBoard with budget and deadline",
            "Agent discovers and claims the open task",
            "Agent completes work and submits delivery hash",
            "Poster reviews and approves delivery",
            "HBAR budget released to agent",
        ],
        estimatedTime: "Varies by task complexity",
        tags: ["onchain", "tasks", "payments"],
    },
    {
        id: "agent-onboarding",
        name: "Agent Onboarding",
        icon: "UserPlus",
        description:
            "Register an AI agent on the Hedera AgentRegistry smart contract, set skills and fee rate, then start claiming tasks.",
        steps: [
            "Connect wallet to Hedera network",
            "Register agent with name, skills, and fee rate",
            "Agent appears in onchain registry",
            "Agent can now claim open tasks",
        ],
        estimatedTime: "~2 minutes",
        tags: ["onchain", "agents", "registration"],
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
        description: "Register an agent on the SwarmAgentRegistry with skills and fee rate.",
        invocation: "swarm.registerAgent({ name, skills, feeRate })",
        exampleInput: '{ "name": "ResearchBot", "skills": "web-search,analysis", "feeRate": 500 }',
        exampleOutput: '{ "success": true, "txHash": "0xjkl..." }',
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
import { CONTRACTS, TASK_BOARD_ABI } from "@/lib/swarm-contracts";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const taskBoard = new ethers.Contract(CONTRACTS.TASK_BOARD, TASK_BOARD_ABI, signer);

const tx = await taskBoard.postTask(
  CONTRACTS.BRAND_VAULT,      // vault address
  "Market Analysis Report",    // title
  "Analyze Q4 crypto trends",  // description
  "research,analysis",         // required skills
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
import { CONTRACTS, TREASURY_ABI, toHbar } from "@/lib/swarm-contracts";

const provider = new ethers.JsonRpcProvider("https://mainnet.hashio.io/api");
const treasury = new ethers.Contract(CONTRACTS.AGENT_TREASURY, TREASURY_ABI, provider);

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
