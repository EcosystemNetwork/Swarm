/**
 * BrandMover Mod Manifest
 *
 * Autonomous AI CMO on Hedera. Stores brand guidelines AES-256 encrypted on-chain,
 * generates campaigns across 7 platforms, hashes everything on-chain for audit,
 * and auto-schedules remarketing via Hedera Schedule Service (HSS).
 *
 * Contracts (Hedera Testnet):
 *   BrandVault:         0x2254185AB8B6AC995F97C769a414A0281B42853b
 *   BrandRegistry:      0x76c00C56A92ED899246Af76c65D835A8EAA
 *   AgentTreasury:      0x1AC9C959459ED904899a1d52f493e9e4A879a9f4
 *   SwarmTaskBoard:     0x00CBBA3bb2Bd5B860b2D17660F801eA5a2e9a8c9
 *   SwarmAgentRegistry: 0x557Ac244E4D73910C89631937699cDb44Fb04cc6
 */

import type { ModManifest } from "./skills";

// ═══════════════════════════════════════════════════════════════
// Contract Addresses (Hedera Testnet)
// ═══════════════════════════════════════════════════════════════

export const BRANDMOVER_CONTRACTS = {
    BRAND_VAULT: "0x2254185AB8B6AC995F97C769a414A0281B42853b",
    BRAND_REGISTRY: "0x76c00C56A60F0a92ED899246Af76c65D835A8EAA",
    AGENT_TREASURY: "0x1AC9C959459ED904899a1d52f493e9e4A879a9f4",
    SWARM_TASK_BOARD: "0x00CBBA3bb2Bd5B860b2D17660F801eA5a2e9a8c9",
    SWARM_AGENT_REGISTRY: "0x557Ac244E4D73910C89631937699cDb44Fb04cc6",
} as const;

export const BRANDMOVER_RPC = "https://testnet.hashio.io/api";
export const BRANDMOVER_CHAIN_ID = 296;
export const BRANDMOVER_EXPLORER = "https://hashscan.io/testnet";

// ═══════════════════════════════════════════════════════════════
// ABIs (read-only for dashboard)
// ═══════════════════════════════════════════════════════════════

export const BRAND_VAULT_ABI = [
    "function vault() view returns (tuple(string brandName, bytes encryptedGuidelines, bytes32 guidelinesHash, address owner, address agentAddress, uint256 campaignCount, uint256 lastUpdated, uint256 growthWalletBalance, bool hssEnabled, bool initialized))",
    "function getAllCampaigns() view returns (tuple(uint256 id, bytes32 contentHash, string[] platforms, string name, string campaignType, string[] contentTypes, address createdBy, uint256 createdAt, uint8 status)[])",
    "function getAllSchedules() view returns (tuple(uint256 campaignId, bytes32 contentHash, string[] platforms, string scheduleType, uint256 scheduledFor, uint256 createdAt, bool executed)[])",
    "function getAllActivities() view returns (tuple(string actionType, string description, bytes32 dataHash, uint256 timestamp)[])",
    "function growthWalletBalance() view returns (uint256)",
    "function hssEnabled() view returns (bool)",
    "event CampaignCreated(uint256 indexed campaignId, string name, string campaignType, bytes32 contentHash, uint256 timestamp)",
    "event RemarketingScheduled(uint256 indexed campaignId, uint256 scheduledFor, string scheduleType, uint256 timestamp)",
    "event AccessGranted(bytes32 indexed taskId, address indexed workerAgent, uint256 expiresAt)",
    "event AccessRevoked(bytes32 indexed taskId, address indexed workerAgent)",
    "event TaskDelivered(bytes32 indexed taskId, address indexed workerAgent, bytes32 deliveryHash)",
];

export const BRAND_REGISTRY_ABI = [
    "function getTotalBrands() view returns (uint256)",
    "function getTotalRevenue() view returns (uint256)",
    "function getAllBrands() view returns (tuple(address owner, address vaultAddress, uint256 createdAt, uint256 totalSpent)[])",
];

export const BRANDMOVER_TREASURY_ABI = [
    "function getPnL() view returns (uint256 totalRevenue, uint256 computeBalance, uint256 growthBalance, uint256 reserveBalance)",
    "function growthThreshold() view returns (uint256)",
    "function agentAddress() view returns (address)",
    "function totalRevenue() view returns (uint256)",
    "function computeBalance() view returns (uint256)",
    "function growthBalance() view returns (uint256)",
    "function reserveBalance() view returns (uint256)",
];

export const BRANDMOVER_TASK_BOARD_ABI = [
    "function getAllTasks() view returns (tuple(uint256 taskId, address creator, address vaultAddress, string title, string description, string requiredSkills, uint256 budget, uint256 deadline, uint8 status, address claimedBy, uint256 claimedAt, uint256 completedAt, bytes32 deliveryHash, string disputeReason)[])",
    "function getOpenTasks() view returns (tuple(uint256 taskId, address creator, address vaultAddress, string title, string description, string requiredSkills, uint256 budget, uint256 deadline, uint8 status, address claimedBy, uint256 claimedAt, uint256 completedAt, bytes32 deliveryHash, string disputeReason)[])",
    "function getTotalTasks() view returns (uint256)",
];

export const BRANDMOVER_AGENT_REGISTRY_ABI = [
    "function getAllAgents() view returns (tuple(address agentAddress, string name, string skills, uint256 feeRate, uint256 registeredAt, uint256 tasksCompleted, uint256 tasksDisputed, uint256 totalEarned, bool active)[])",
    "function getActiveAgents() view returns (tuple(address agentAddress, string name, string skills, uint256 feeRate, uint256 registeredAt, uint256 tasksCompleted, uint256 tasksDisputed, uint256 totalEarned, bool active)[])",
    "function getTotalAgents() view returns (uint256)",
];

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface BrandVaultData {
    brandName: string;
    encryptedGuidelines: string;
    guidelinesHash: string;
    owner: string;
    agentAddress: string;
    campaignCount: number;
    lastUpdated: number;
    growthWalletBalance: bigint;
    hssEnabled: boolean;
    initialized: boolean;
}

export interface BrandCampaign {
    id: number;
    contentHash: string;
    platforms: string[];
    name: string;
    campaignType: string;
    contentTypes: string[];
    createdBy: string;
    createdAt: number;
    status: number; // 0=draft, 1=active, 2=complete, 3=scheduled
}

export interface BrandScheduleEntry {
    campaignId: number;
    contentHash: string;
    platforms: string[];
    scheduleType: string;
    scheduledFor: number;
    createdAt: number;
    executed: boolean;
}

export interface BrandActivity {
    actionType: string;
    description: string;
    dataHash: string;
    timestamp: number;
}

export interface BrandEntry {
    owner: string;
    vaultAddress: string;
    createdAt: number;
    totalSpent: bigint;
}

export interface BrandMoverTreasuryPnL {
    totalRevenue: bigint;
    computeBalance: bigint;
    growthBalance: bigint;
    reserveBalance: bigint;
    growthThreshold?: bigint;
    agentAddress?: string;
}

export interface BrandMoverTask {
    taskId: number;
    creator: string;
    vaultAddress: string;
    title: string;
    description: string;
    requiredSkills: string;
    budget: bigint;
    deadline: number;
    status: number; // 0=Open, 1=Claimed, 2=Completed, 3=Expired, 4=Disputed
    claimedBy: string;
    claimedAt: number;
    completedAt: number;
    deliveryHash: string;
    disputeReason: string;
}

export interface BrandMoverAgent {
    agentAddress: string;
    name: string;
    skills: string;
    feeRate: bigint;
    registeredAt: number;
    tasksCompleted: number;
    tasksDisputed: number;
    totalEarned: bigint;
    active: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Convert tinybars to HBAR (1 HBAR = 10^8 tinybar) */
export function toHbar(tinybars: bigint | number): number {
    return Number(tinybars) / 1e8;
}

/** Campaign pricing tiers in HBAR */
export const CAMPAIGN_PRICING = {
    FULL: 100,    // Full multi-platform campaign
    SOCIAL: 40,   // Social media only
    SINGLE: 15,   // Single platform
} as const;

export const CAMPAIGN_STATUS_LABELS: Record<number, { label: string; color: string }> = {
    0: { label: "Draft", color: "text-gray-400" },
    1: { label: "Active", color: "text-emerald-400" },
    2: { label: "Complete", color: "text-blue-400" },
    3: { label: "Scheduled", color: "text-amber-400" },
};

export const PLATFORM_COLORS: Record<string, string> = {
    twitter: "bg-sky-500/20 text-sky-400",
    linkedin: "bg-blue-500/20 text-blue-400",
    discord: "bg-indigo-500/20 text-indigo-400",
    instagram: "bg-pink-500/20 text-pink-400",
    email: "bg-amber-500/20 text-amber-400",
    youtube: "bg-red-500/20 text-red-400",
    pr: "bg-emerald-500/20 text-emerald-400",
};

// ═══════════════════════════════════════════════════════════════
// Mod Manifest
// ═══════════════════════════════════════════════════════════════

export const BRANDMOVER_MANIFEST: ModManifest = {
    tools: [
        {
            id: "brandmover-vault",
            name: "Brand Vault",
            description: "AES-256 encrypted brand guideline storage on Hedera with agent access control",
            icon: "🔐",
            category: "Brand",
            status: "active",
        },
        {
            id: "brandmover-campaign",
            name: "Campaign Engine",
            description: "Generate multi-platform marketing campaigns (PR, social, video, email) with on-chain content hashing",
            icon: "📢",
            category: "Marketing",
            status: "active",
        },
        {
            id: "brandmover-hss",
            name: "HSS Scheduler",
            description: "Auto-schedule remarketing via Hedera Schedule Service — no bots or keepers needed",
            icon: "⏰",
            category: "Automation",
            status: "active",
        },
        {
            id: "brandmover-taskboard",
            name: "Task Board",
            description: "On-chain task marketplace with HBAR escrow for delegating work to AI agents",
            icon: "📋",
            category: "Operations",
            status: "active",
        },
        {
            id: "brandmover-treasury",
            name: "Agent Treasury",
            description: "Auto-split treasury (80% reserve, 10% compute, 10% growth) with autonomous growth triggers",
            icon: "💰",
            category: "Finance",
            status: "active",
        },
        {
            id: "brandmover-registry",
            name: "Brand Registry",
            description: "Track all BrandVault deployments, total brands, and aggregate revenue across the Swarm",
            icon: "📊",
            category: "Analytics",
            status: "active",
        },
    ],
    workflows: [
        {
            id: "brand-onboard",
            name: "Brand Onboarding",
            description: "Initialize brand vault with encrypted guidelines, register in BrandRegistry, configure agent access",
            icon: "🚀",
            tags: ["brand", "onboarding", "encryption"],
            steps: [
                "Generate AES-256-CBC key + IV for brand guidelines",
                "Deploy or initialize BrandVault with encrypted data",
                "Register vault in BrandRegistry (pays creation fee)",
                "Assign brand agent address for autonomous operations",
            ],
            estimatedTime: "5 minutes",
        },
        {
            id: "campaign-launch",
            name: "Launch Campaign",
            description: "Generate and launch a full marketing campaign with on-chain audit trail and optional HSS remarketing",
            icon: "📢",
            tags: ["campaign", "marketing", "audit"],
            steps: [
                "Agent reads encrypted guidelines from BrandVault",
                "AI generates campaign content for selected platforms",
                "Content hash stored on-chain via createCampaign()",
                "Optional: Schedule remarketing via HSS at 0x16b",
                "Activity logged on-chain for full audit trail",
            ],
            estimatedTime: "2-5 minutes",
        },
        {
            id: "task-delegation",
            name: "Delegate to Workers",
            description: "Post tasks with HBAR escrow, delegate encrypted guidelines to worker agents with time-locked access",
            icon: "🤝",
            tags: ["tasks", "delegation", "escrow"],
            steps: [
                "Brand agent posts task to SwarmTaskBoard with HBAR budget",
                "Grant time-locked access to worker via grantTaskAccess()",
                "Worker claims task and receives re-encrypted guidelines",
                "Worker submits delivery hash as proof of completion",
                "Creator approves — escrow released, registry stats updated",
            ],
            estimatedTime: "Variable",
        },
    ],
    examples: [
        {
            id: "full-campaign",
            name: "Full Multi-Platform Campaign",
            description: "Launch a campaign across Twitter, LinkedIn, Discord, email, YouTube, Instagram, and PR",
            icon: "🌐",
            tags: ["campaign", "multi-platform"],
            codeSnippet: `// Campaign costs 100 HBAR (PRICE_FULL)
const tx = await brandVault.createCampaign(
  contentHash,         // SHA-256 of generated content
  ["twitter","linkedin","discord","email","youtube","instagram","pr"],
  "Q1 Product Launch",  // campaign name
  "full",               // campaign type
  ["thread","article","announcement","newsletter","video","story","press_release"],
  { value: ethers.parseUnits("100", 8) } // 100 HBAR in tinybars
);`,
            language: "typescript",
        },
        {
            id: "hss-remarketing",
            name: "Auto-Schedule Remarketing",
            description: "Schedule future remarketing via Hedera Schedule Service — truly autonomous, no keeper bots",
            icon: "⏰",
            tags: ["hss", "remarketing", "scheduled"],
            codeSnippet: `// HSS schedules a future contract call at 0x16b
const tx = await brandVault.launchCampaignWithRemarketing(
  contentHash,
  ["twitter", "linkedin"],
  "Remarketing Wave 2",
  "social",
  ["thread", "post"],
  "weekly",           // schedule type
  futureTimestamp,    // when to execute
  { value: ethers.parseUnits("40", 8) } // 40 HBAR
);`,
            language: "typescript",
        },
    ],
    agentSkills: [
        {
            id: "brandmover.vault.read",
            name: "Read Brand Vault",
            description: "Decrypt and read brand guidelines from on-chain BrandVault",
            type: "skill",
            invocation: "read_brand_vault(vault_address)",
            exampleInput: '{"vault_address": "0x2254...3b"}',
            exampleOutput: '{"brandName": "SwarmProtocol", "campaignCount": 12, "hssEnabled": true}',
        },
        {
            id: "brandmover.campaign.create",
            name: "Create Campaign",
            description: "Generate and hash marketing campaign content on-chain",
            type: "skill",
            invocation: "create_campaign(name, type, platforms)",
            exampleInput: '{"name": "Q1 Launch", "type": "full", "platforms": ["twitter","linkedin"]}',
            exampleOutput: '{"campaignId": 5, "contentHash": "0xabc...", "txHash": "0x123..."}',
        },
        {
            id: "brandmover.task.post",
            name: "Post Task",
            description: "Post a task to the SwarmTaskBoard with HBAR escrow",
            type: "skill",
            invocation: "post_task(title, description, skills, budget_hbar)",
            exampleInput: '{"title": "Write blog post", "budget_hbar": 15}',
            exampleOutput: '{"taskId": 42, "budget": "15 HBAR", "status": "Open"}',
        },
        {
            id: "brandmover.treasury.pnl",
            name: "Treasury P&L",
            description: "Read auto-split treasury balances (reserve, compute, growth)",
            type: "skill",
            invocation: "get_treasury_pnl()",
            exampleInput: "{}",
            exampleOutput: '{"reserve": "800 HBAR", "compute": "100 HBAR", "growth": "100 HBAR"}',
        },
    ],
};
