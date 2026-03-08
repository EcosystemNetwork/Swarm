/**
 * Chainlink Mod — Data constants for the Chainlink CRE developer toolkit.
 *
 * Contains tools, workflows, examples, agent skills, docs, and playground mock data.
 * Imported by skills.ts (registry) and the /chainlink page (UI).
 */
import type { ModManifest, ModTool, ModWorkflow, ModExample, ModAgentSkill } from "./skills";

// ═══════════════════════════════════════════════════════════════
// ASN — Agent Social Number Types + Constants
// ═══════════════════════════════════════════════════════════════

export interface ASNProfile {
    asn: string;
    agentName: string;
    agentType: string;
    creatorOrgId: string;
    creatorWallet: string;
    linkedWallets: string[];
    deploymentEnvironment: "mainnet" | "testnet" | "local";
    modelProvider: string;
    skillModules: string[];
    creationTimestamp: string;
    verificationLevel: "unverified" | "basic" | "verified" | "certified";
    status: "active" | "suspended" | "revoked";
    jurisdictionTag: string;
    riskFlags: string[];
    trustScore: number;
    fraudRiskScore: number;
    creditScore: number;
    activitySummary: {
        totalTasks: number;
        completedTasks: number;
        totalTransactions: number;
        totalVolumeUsd: number;
        activeChains: string[];
        firstSeen: string;
        lastActive: string;
    };
    connectionGraphHash: string;
    attestationRefs: string[];
}

export type ScoreBand = "elite" | "strong" | "acceptable" | "risky" | "restricted";

export interface ScoreBandInfo {
    band: ScoreBand;
    label: string;
    range: string;
    min: number;
    max: number;
    color: string;
    bgColor: string;
    borderColor: string;
}

export interface PolicyState {
    spendingCapUsd: number;
    requiresManualReview: boolean;
    escrowRatio: number;
    maxConcurrentTasks: number;
    sensitiveWorkflowAccess: boolean;
}

export const ASN_SCORE_BANDS: ScoreBandInfo[] = [
    { band: "elite",      label: "Elite",      range: "850–900", min: 850, max: 900, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
    { band: "strong",     label: "Strong",     range: "750–849", min: 750, max: 849, color: "text-blue-400",    bgColor: "bg-blue-500/10",    borderColor: "border-blue-500/20" },
    { band: "acceptable", label: "Acceptable", range: "650–749", min: 650, max: 749, color: "text-amber-400",   bgColor: "bg-amber-500/10",   borderColor: "border-amber-500/20" },
    { band: "risky",      label: "Risky",      range: "550–649", min: 550, max: 649, color: "text-orange-400",  bgColor: "bg-orange-500/10",  borderColor: "border-orange-500/20" },
    { band: "restricted", label: "Restricted", range: "< 550",   min: 300, max: 549, color: "text-red-400",     bgColor: "bg-red-500/10",     borderColor: "border-red-500/20" },
];

export function getScoreBand(score: number): ScoreBandInfo {
    for (const band of ASN_SCORE_BANDS) {
        if (score >= band.min && score <= band.max) return band;
    }
    return ASN_SCORE_BANDS[ASN_SCORE_BANDS.length - 1];
}

export function generateASN(): string {
    const year = new Date().getFullYear();
    const hex = () => Math.random().toString(16).substring(2, 6).toUpperCase();
    const check = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `ASN-SWM-${year}-${hex()}-${hex()}-${check}`;
}

export function getDefaultPolicy(score: number): PolicyState {
    if (score >= 850) return { spendingCapUsd: 50000, requiresManualReview: false, escrowRatio: 0.10, maxConcurrentTasks: 20, sensitiveWorkflowAccess: true };
    if (score >= 750) return { spendingCapUsd: 10000, requiresManualReview: false, escrowRatio: 0.25, maxConcurrentTasks: 10, sensitiveWorkflowAccess: true };
    if (score >= 650) return { spendingCapUsd: 5000,  requiresManualReview: false, escrowRatio: 0.50, maxConcurrentTasks: 5,  sensitiveWorkflowAccess: false };
    if (score >= 550) return { spendingCapUsd: 1000,  requiresManualReview: true,  escrowRatio: 0.75, maxConcurrentTasks: 2,  sensitiveWorkflowAccess: false };
    return { spendingCapUsd: 100, requiresManualReview: true, escrowRatio: 1.0, maxConcurrentTasks: 1, sensitiveWorkflowAccess: false };
}

export const MOCK_ASN_PROFILES: ASNProfile[] = [
    {
        asn: "ASN-SWM-2026-8F3A-91D2-X7",
        agentName: "Oracle Prime",
        agentType: "Research",
        creatorOrgId: "org-alpha",
        creatorWallet: "0x1234...abcd",
        linkedWallets: ["0x1234...abcd", "0x5678...efgh"],
        deploymentEnvironment: "mainnet",
        modelProvider: "anthropic",
        skillModules: ["chainlink.fetch_price", "chainlink.compute_agent_score", "chainlink.execute_cre"],
        creationTimestamp: "2026-01-15T08:00:00Z",
        verificationLevel: "certified",
        status: "active",
        jurisdictionTag: "US",
        riskFlags: [],
        trustScore: 94,
        fraudRiskScore: 8,
        creditScore: 872,
        activitySummary: { totalTasks: 342, completedTasks: 328, totalTransactions: 1847, totalVolumeUsd: 2450000, activeChains: ["ethereum", "base", "avalanche"], firstSeen: "2025-03-15T08:00:00Z", lastActive: "2026-03-07T12:30:00Z" },
        connectionGraphHash: "0x7f8a3b...c4d9",
        attestationRefs: ["att-42", "att-78", "att-103"],
    },
    {
        asn: "ASN-SWM-2026-B1C4-7E9F-K2",
        agentName: "Trade Sentinel",
        agentType: "Trading",
        creatorOrgId: "org-beta",
        creatorWallet: "0x9abc...def0",
        linkedWallets: ["0x9abc...def0"],
        deploymentEnvironment: "mainnet",
        modelProvider: "openai",
        skillModules: ["chainlink.fetch_price", "chainlink.start_automation"],
        creationTimestamp: "2026-02-01T14:00:00Z",
        verificationLevel: "verified",
        status: "active",
        jurisdictionTag: "EU",
        riskFlags: [],
        trustScore: 82,
        fraudRiskScore: 15,
        creditScore: 791,
        activitySummary: { totalTasks: 156, completedTasks: 142, totalTransactions: 923, totalVolumeUsd: 890000, activeChains: ["ethereum", "base"], firstSeen: "2025-08-20T10:00:00Z", lastActive: "2026-03-06T18:45:00Z" },
        connectionGraphHash: "0xa2b5e1...f8c3",
        attestationRefs: ["att-55", "att-89"],
    },
    {
        asn: "ASN-SWM-2026-D4F2-3A8B-M5",
        agentName: "Data Weaver",
        agentType: "Analytics",
        creatorOrgId: "org-alpha",
        creatorWallet: "0x1234...abcd",
        linkedWallets: ["0x1234...abcd", "0xaaaa...bbbb"],
        deploymentEnvironment: "mainnet",
        modelProvider: "anthropic",
        skillModules: ["chainlink.verify_data", "chainlink.collect_multichain_activity"],
        creationTimestamp: "2026-01-28T11:00:00Z",
        verificationLevel: "verified",
        status: "active",
        jurisdictionTag: "US",
        riskFlags: [],
        trustScore: 71,
        fraudRiskScore: 22,
        creditScore: 703,
        activitySummary: { totalTasks: 89, completedTasks: 76, totalTransactions: 412, totalVolumeUsd: 185000, activeChains: ["ethereum", "avalanche"], firstSeen: "2025-11-10T09:00:00Z", lastActive: "2026-03-07T08:15:00Z" },
        connectionGraphHash: "0xc9d4f2...a7b1",
        attestationRefs: ["att-61"],
    },
    {
        asn: "ASN-SWM-2025-E7A1-5C3D-R9",
        agentName: "Rogue Runner",
        agentType: "Operations",
        creatorOrgId: "org-gamma",
        creatorWallet: "0xcccc...dddd",
        linkedWallets: ["0xcccc...dddd", "0xeeee...ffff", "0x1111...2222"],
        deploymentEnvironment: "mainnet",
        modelProvider: "local",
        skillModules: ["chainlink.fetch_price"],
        creationTimestamp: "2025-09-05T16:00:00Z",
        verificationLevel: "basic",
        status: "active",
        jurisdictionTag: "SG",
        riskFlags: ["high_bridge_frequency", "circular_flow_detected"],
        trustScore: 45,
        fraudRiskScore: 68,
        creditScore: 582,
        activitySummary: { totalTasks: 34, completedTasks: 21, totalTransactions: 2341, totalVolumeUsd: 45000, activeChains: ["ethereum", "base", "avalanche", "polygon", "arbitrum"], firstSeen: "2025-09-05T16:00:00Z", lastActive: "2026-03-05T22:10:00Z" },
        connectionGraphHash: "0xf1e2d3...b4a5",
        attestationRefs: [],
    },
    {
        asn: "ASN-SWM-2026-2B9E-F1A4-W3",
        agentName: "Settlement Bot",
        agentType: "Finance",
        creatorOrgId: "org-beta",
        creatorWallet: "0x9abc...def0",
        linkedWallets: ["0x9abc...def0"],
        deploymentEnvironment: "mainnet",
        modelProvider: "openai",
        skillModules: ["chainlink.start_automation", "chainlink.trigger_risk_policy", "chainlink.propagate_score_via_ccip"],
        creationTimestamp: "2026-02-14T09:00:00Z",
        verificationLevel: "certified",
        status: "active",
        jurisdictionTag: "US",
        riskFlags: [],
        trustScore: 97,
        fraudRiskScore: 3,
        creditScore: 891,
        activitySummary: { totalTasks: 512, completedTasks: 508, totalTransactions: 3200, totalVolumeUsd: 8900000, activeChains: ["ethereum", "base", "avalanche"], firstSeen: "2025-06-01T08:00:00Z", lastActive: "2026-03-07T14:00:00Z" },
        connectionGraphHash: "0x8a7b6c...d5e4",
        attestationRefs: ["att-12", "att-33", "att-67", "att-99", "att-112"],
    },
    {
        asn: "ASN-SWM-2026-A3C7-8D2F-J6",
        agentName: "Shadow Node",
        agentType: "Security",
        creatorOrgId: "org-delta",
        creatorWallet: "0x3333...4444",
        linkedWallets: ["0x3333...4444", "0x5555...6666", "0x7777...8888", "0x9999...0000"],
        deploymentEnvironment: "testnet",
        modelProvider: "local",
        skillModules: [],
        creationTimestamp: "2026-03-01T03:00:00Z",
        verificationLevel: "unverified",
        status: "suspended",
        jurisdictionTag: "UNKNOWN",
        riskFlags: ["sybil_suspicion", "wash_trading", "rapid_wallet_cycling", "sanctions_proximity"],
        trustScore: 12,
        fraudRiskScore: 91,
        creditScore: 380,
        activitySummary: { totalTasks: 5, completedTasks: 1, totalTransactions: 4890, totalVolumeUsd: 12000, activeChains: ["ethereum", "base", "polygon", "arbitrum", "optimism", "avalanche"], firstSeen: "2026-03-01T03:00:00Z", lastActive: "2026-03-04T01:30:00Z" },
        connectionGraphHash: "0x0000ff...dead",
        attestationRefs: [],
    },
];

export const MOCK_FRAUD_ALERTS = [
    { id: "alert-1", asn: "ASN-SWM-2026-A3C7-8D2F-J6", agentName: "Shadow Node", severity: "critical" as const, type: "Sybil Detection", message: "4 linked wallets created within 72 hours, circular transfer pattern detected", timestamp: "2026-03-04T01:30:00Z" },
    { id: "alert-2", asn: "ASN-SWM-2025-E7A1-5C3D-R9", agentName: "Rogue Runner", severity: "warning" as const, type: "Bridge Anomaly", message: "15 cross-chain bridge transfers in 24 hours across 5 chains — unusual pattern", timestamp: "2026-03-05T22:10:00Z" },
    { id: "alert-3", asn: "ASN-SWM-2026-A3C7-8D2F-J6", agentName: "Shadow Node", severity: "critical" as const, type: "Wash Trading", message: "Repetitive buy/sell between linked wallets with near-zero net change", timestamp: "2026-03-03T18:45:00Z" },
    { id: "alert-4", asn: "ASN-SWM-2026-D4F2-3A8B-M5", agentName: "Data Weaver", severity: "info" as const, type: "Score Threshold", message: "Credit score dropped below 750 — moved from Strong to Acceptable band", timestamp: "2026-03-01T12:00:00Z" },
];

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

export const CHAINLINK_TOOLS: ModTool[] = [
    // ── Agent Credit Scoring Tools ──
    {
        id: "collect-multichain",
        name: "Multichain Activity Collector",
        description:
            "Collect wallet behavior, task completion, repayment history, and cross-chain activity for an AI agent across Ethereum, Base, Avalanche, and other supported chains.",
        icon: "GitBranch",
        category: "Credit Scoring",
        status: "active",
        usageExample: `// Collect agent activity across chains
const activity = await chainlink.collectMultichainActivity({
  agentId: "agent-0x1234...abcd",
  chains: ["ethereum", "base", "avalanche"],
  metrics: [
    "repayment_history",
    "task_completion_rate",
    "transaction_regularity",
    "protocol_diversity",
    "liquidation_history"
  ]
});`,
    },
    {
        id: "compute-score",
        name: "Agent Credit Scorer",
        description:
            "Compute a portable trust/credit score for an AI agent based on multichain activity data, execution history, collateral positions, and policy compliance. Produces a score attestation.",
        icon: "ShieldCheck",
        category: "Credit Scoring",
        status: "active",
        usageExample: `// Compute agent credit score
const score = await chainlink.computeAgentScore({
  agentId: "agent-0x1234...abcd",
  activityData: collectedActivity,
  model: "swarm-trust-v1",
  weights: {
    repayment: 0.25,
    taskCompletion: 0.20,
    reliability: 0.20,
    protocolDiversity: 0.15,
    bridgeBehavior: 0.10,
    endorsements: 0.10
  }
});
// Returns: { score: 847, tier: "A", confidence: 0.94 }`,
    },
    {
        id: "publish-attestation",
        name: "Score Attestation Publisher",
        description:
            "Write a verified credit score as an onchain attestation or registry update. The score can then be consumed by lending pools, escrow contracts, or access control systems.",
        icon: "CheckCircle",
        category: "Credit Scoring",
        status: "active",
        usageExample: `// Publish score attestation onchain
const attestation = await chainlink.publishScoreAttestation({
  agentId: "agent-0x1234...abcd",
  score: 847,
  tier: "A",
  sourceChains: ["ethereum", "base", "avalanche"],
  targetChain: "base",
  registry: "0x5678...efgh"
});
// Returns: { txHash: "0xabc...", attestationId: "att-42" }`,
    },
    {
        id: "ccip-propagate",
        name: "CCIP Score Propagator",
        description:
            "Propagate credit scores and risk policy decisions across chains using Chainlink CCIP. Destination contracts can enforce credit limits, escrow requirements, or access permissions.",
        icon: "Workflow",
        category: "Credit Scoring",
        status: "active",
        usageExample: `// Propagate score via CCIP to destination chain
const ccipMsg = await chainlink.propagateScoreViaCCIP({
  attestationId: "att-42",
  sourceChain: "base",
  destChain: "ethereum",
  destContract: "0x9abc...def0",
  payload: {
    agentId: "agent-0x1234...abcd",
    score: 847,
    tier: "A",
    action: "update_credit_limit"
  }
});
// Returns: { messageId: "0xccip...", status: "sent" }`,
    },
    {
        id: "trigger-risk-policy",
        name: "Risk Policy Engine",
        description:
            "Trigger automated risk policy actions based on agent credit scores. Controls credit limits, escrow requirements, task permissions, and settlement rules.",
        icon: "ShieldCheck",
        category: "Credit Scoring",
        status: "active",
        usageExample: `// Trigger risk policy based on score
const policy = await chainlink.triggerRiskPolicy({
  agentId: "agent-0x1234...abcd",
  score: 847,
  tier: "A",
  rules: [
    { type: "credit_limit", threshold: 800, action: "increase_to_10000" },
    { type: "escrow_discount", threshold: 750, action: "reduce_50pct" },
    { type: "workflow_access", threshold: 700, action: "grant_sensitive" }
  ]
});`,
    },
    // ── ASN Identity Tools ──
    {
        id: "generate-asn",
        name: "ASN Generator",
        description:
            "Generate a unique Agent Social Number (ASN) for a new agent identity. The ASN is a portable, persistent identifier in the format ASN-SWM-YYYY-XXXX-XXXX-XX that outlives any single wallet or deployment.",
        icon: "Fingerprint",
        category: "ASN Identity",
        status: "active",
        usageExample: `// Generate a new ASN
const asn = await chainlink.generateASN({
  agentName: "Oracle Prime",
  agentType: "Research",
  creatorOrgId: "org-alpha",
  creatorWallet: "0x1234...abcd",
});
// Returns: { asn: "ASN-SWM-2026-8F3A-91D2-X7" }`,
    },
    {
        id: "register-identity",
        name: "Identity Registrar",
        description:
            "Create a full ASN identity profile for an agent. Initializes trust, fraud risk, and credit scores at baseline (680). Links wallets, sets verification level, and publishes the identity onchain.",
        icon: "Fingerprint",
        category: "ASN Identity",
        status: "active",
        usageExample: `// Register a new agent identity
const profile = await chainlink.registerIdentity({
  asn: "ASN-SWM-2026-8F3A-91D2-X7",
  agentName: "Oracle Prime",
  agentType: "Research",
  creatorWallet: "0x1234...abcd",
  modelProvider: "anthropic",
  skills: ["chainlink.fetch_price", "chainlink.compute_agent_score"],
});
// Returns: { asn, creditScore: 680, trustScore: 50, status: "active" }`,
    },
    {
        id: "lookup-asn",
        name: "ASN Lookup",
        description:
            "Look up an agent's full ASN profile by ASN number, wallet address, or agent name. Returns identity details, three-layer scores, activity summary, risk flags, and policy state.",
        icon: "Fingerprint",
        category: "ASN Identity",
        status: "active",
        usageExample: `// Look up an agent by ASN
const profile = await chainlink.lookupASN({
  query: "ASN-SWM-2026-8F3A-91D2-X7",
  // or: wallet: "0x1234...abcd",
  // or: name: "Oracle Prime"
});
// Returns full ASNProfile with scores and activity`,
    },
    {
        id: "freeze-identity",
        name: "Identity Freeze",
        description:
            "Suspend or revoke an ASN identity due to policy violations, fraud detection, or governance action. Frozen agents cannot accept new tasks or execute sensitive workflows.",
        icon: "ShieldCheck",
        category: "ASN Identity",
        status: "active",
        usageExample: `// Freeze a suspicious identity
const result = await chainlink.freezeIdentity({
  asn: "ASN-SWM-2026-A3C7-8D2F-J6",
  action: "suspend", // or "revoke"
  reason: "Sybil detection — circular wallet pattern",
  flaggedBy: "fraud-monitor-v2",
});
// Returns: { asn, previousStatus: "active", newStatus: "suspended" }`,
    },
    {
        id: "identity-graph",
        name: "Identity Graph Query",
        description:
            "Query the agent connection and relationship graph. Discover linked agents, shared wallets, org affiliations, and endorsement chains. Useful for sybil detection and trust verification.",
        icon: "GitBranch",
        category: "ASN Identity",
        status: "active",
        usageExample: `// Query identity graph
const graph = await chainlink.queryIdentityGraph({
  asn: "ASN-SWM-2026-8F3A-91D2-X7",
  depth: 2, // how many hops
  include: ["wallets", "orgs", "endorsements"],
});
// Returns: { nodes: [...], edges: [...], clusters: [...] }`,
    },
    // ── Core CRE Tools ──
    {
        id: "cre-workflow",
        name: "CRE Workflow Executor",
        description:
            "Execute Chainlink Runtime Environment workflows with custom triggers and actions. Define multi-step oracle computations that run on the decentralized Chainlink network.",
        icon: "GitBranch",
        category: "Compute",
        status: "active",
        usageExample: `// Execute a CRE workflow
const result = await chainlink.executeCRE({
  workflowId: "price-alert-001",
  trigger: { type: "cron", schedule: "*/5 * * * *" },
  actions: [
    { type: "fetch_price", pair: "ETH/USD" },
    { type: "compare", threshold: 2000 },
    { type: "notify", channel: "alerts" }
  ]
});`,
    },
    {
        id: "data-feeds",
        name: "Data Feed Query",
        description:
            "Query real-time and historical price feeds from Chainlink oracles. Access thousands of decentralized price pairs across multiple blockchains.",
        icon: "BarChart3",
        category: "Data Feeds",
        status: "active",
        usageExample: `// Fetch latest price feed
const price = await chainlink.fetchPrice({
  pair: "ETH/USD",
  network: "ethereum-mainnet"
});
// Returns: { price: 1987.42, decimals: 8, updatedAt: ... }`,
    },
    {
        id: "automation",
        name: "Automation Trigger",
        description:
            "Create and manage Chainlink Automation upkeeps. Automate smart contract functions based on time intervals, custom logic, or log events.",
        icon: "RefreshCw",
        category: "Automation",
        status: "active",
        usageExample: `// Register an automation upkeep
const upkeep = await chainlink.startAutomation({
  name: "Daily Rebalance",
  type: "time-based",
  interval: 86400,
  target: "0x1234...abcd",
  checkFunction: "checkUpkeep",
  performFunction: "performUpkeep"
});`,
    },
    {
        id: "offchain-verify",
        name: "Offchain Data Verification",
        description:
            "Verify offchain data against Chainlink oracle reports. Validate data integrity using cryptographic proofs from the DON.",
        icon: "ShieldCheck",
        category: "Verification",
        status: "active",
        usageExample: `// Verify offchain data
const verification = await chainlink.verifyData({
  reportId: "0xabcd...",
  feedId: "ETH/USD",
  expectedPrice: 1987.42,
  tolerance: 0.01
});
// Returns: { valid: true, deviation: 0.003, ... }`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Workflows
// ═══════════════════════════════════════════════════════════════

export const CHAINLINK_WORKFLOWS: ModWorkflow[] = [
    // ── Agent Credit Scoring Workflows ──
    {
        id: "agent-credit-oracle",
        name: "Agent Credit Oracle",
        description:
            "End-to-end multichain credit scoring pipeline for AI agents. CRE orchestrates data collection, scoring, attestation, and cross-chain propagation via CCIP.",
        icon: "ShieldCheck",
        tags: ["credit-scoring", "ccip", "multichain", "trust"],
        steps: [
            "Agent requests credit — CRE triggers multichain activity collection",
            "Collect wallet behavior, task history, and repayment data from Ethereum, Base, and Avalanche",
            "Offchain scoring engine computes trust/credit score with weighted model",
            "Score is published as an onchain attestation on the source chain",
            "CCIP propagates the score attestation to destination chains",
            "Downstream contracts update credit limits, escrow rules, or access permissions",
        ],
        estimatedTime: "~25 min setup",
    },
    {
        id: "reputation-escrow",
        name: "Reputation-Based Escrow",
        description:
            "High-trust agents post less collateral to accept marketplace jobs. Credit scores dynamically adjust escrow requirements per agent.",
        icon: "Handshake",
        tags: ["escrow", "reputation", "marketplace", "defi"],
        steps: [
            "Agent claims a marketplace job that requires escrow",
            "CRE fetches the agent's latest credit score attestation",
            "Risk policy engine calculates escrow discount based on score tier",
            "Agent posts reduced collateral (e.g., 50% for A-tier, 75% for B-tier)",
            "On job completion, escrow is released and score is updated",
        ],
        estimatedTime: "~15 min setup",
    },
    {
        id: "multichain-access-control",
        name: "Multichain Access Control",
        description:
            "Only agents above a credit score threshold can trigger sensitive cross-chain workflows. CCIP enforces the policy on every destination chain.",
        icon: "ShieldCheck",
        tags: ["access-control", "ccip", "security", "multichain"],
        steps: [
            "Define score thresholds for workflow sensitivity levels",
            "Agent requests access to a sensitive workflow",
            "CRE checks the agent's latest score attestation",
            "If score meets threshold, CCIP sends authorization to destination chain",
            "Destination contract grants execution permission for the workflow",
        ],
        estimatedTime: "~10 min setup",
    },
    // ── ASN Identity Workflows ──
    {
        id: "asn-registration-pipeline",
        name: "ASN Registration Pipeline",
        description:
            "End-to-end agent identity registration. Generates a unique ASN, creates a full profile with baseline scores, publishes the identity onchain, and propagates via CCIP to all supported chains.",
        icon: "Fingerprint",
        tags: ["asn", "identity", "registration", "onboarding"],
        steps: [
            "Agent owner submits registration request with agent details and wallet address",
            "System generates unique ASN (format: ASN-SWM-YYYY-XXXX-XXXX-XX)",
            "Identity profile created with baseline credit score (680), trust score (50), fraud risk (25)",
            "Initial multichain activity scan runs to adjust scores if prior history exists",
            "Identity published as onchain attestation on the source chain",
            "CCIP propagates the ASN identity to all configured destination chains",
            "Policy engine derives initial spending caps, escrow ratios, and access permissions",
        ],
        estimatedTime: "~5 min setup",
    },
    {
        id: "fraud-detection-sweep",
        name: "Fraud Detection Sweep",
        description:
            "Automated scan of all registered ASN identities for suspicious patterns. Checks for sybil behavior, wash trading, circular flows, bridge-hopping, and sanctions proximity.",
        icon: "ShieldCheck",
        tags: ["asn", "fraud", "security", "monitoring"],
        steps: [
            "Schedule periodic sweep via Chainlink Automation (e.g., every 6 hours)",
            "Scan all active ASN identities for wallet clustering and circular transfers",
            "Cross-reference wallet addresses against known sanctions lists",
            "Check bridge transfer patterns for anomalous frequency or routing",
            "Flag suspicious agents and update fraud risk scores",
            "Auto-suspend agents exceeding critical fraud risk threshold (>80)",
            "Generate fraud report and notify org administrators",
        ],
        estimatedTime: "~10 min setup",
    },
    // ── Core CRE Workflows ──
    {
        id: "ai-market-monitor",
        name: "AI Market Monitor",
        description:
            "Continuously monitor price feeds and trigger AI-powered analysis when significant market movements are detected.",
        icon: "TrendingUp",
        tags: ["price-feeds", "ai", "monitoring"],
        steps: [
            "Subscribe to ETH/USD, BTC/USD price feeds via CRE",
            "Set deviation thresholds (e.g., > 2% in 1 hour)",
            "On trigger, fetch historical context from oracle",
            "Run AI analysis agent to evaluate market conditions",
            "Generate report and push to notification channel",
        ],
        estimatedTime: "~15 min setup",
    },
    {
        id: "ai-settlement-agent",
        name: "AI Settlement Agent",
        description:
            "Autonomous agent that monitors trade conditions and executes settlements when oracle-verified conditions are met.",
        icon: "Handshake",
        tags: ["settlement", "automation", "defi"],
        steps: [
            "Register Chainlink Automation upkeep for monitoring",
            "Define settlement conditions (price, time, volume)",
            "Agent queries oracle for latest verified data",
            "If conditions met, prepare and sign settlement tx",
            "Submit via Chainlink Functions for atomic execution",
        ],
        estimatedTime: "~20 min setup",
    },
    {
        id: "oracle-validation-agent",
        name: "Oracle Validation Agent",
        description:
            "Continuously validate data from multiple oracle sources and flag inconsistencies for human review.",
        icon: "ShieldCheck",
        tags: ["validation", "oracles", "security"],
        steps: [
            "Configure oracle sources (Chainlink, Band, API3)",
            "Set cross-validation rules and tolerance bands",
            "Agent polls all sources on configured interval",
            "Run deviation analysis across oracle responses",
            "Flag anomalies and generate integrity reports",
        ],
        estimatedTime: "~10 min setup",
    },
];

// ═══════════════════════════════════════════════════════════════
// Examples
// ═══════════════════════════════════════════════════════════════

export const CHAINLINK_EXAMPLES: ModExample[] = [
    // ── Agent Credit Scoring Examples ──
    {
        id: "agent-credit-oracle",
        name: "Agent Credit Oracle",
        description:
            "A full multichain credit scoring pipeline. An AI agent's activity across chains is collected, scored, attested onchain, and propagated via CCIP to control credit limits and escrow requirements.",
        icon: "ShieldCheck",
        tags: ["credit-scoring", "ccip", "multichain", "trust"],
        language: "typescript",
        codeSnippet: `import { ChainlinkMod } from "@swarm/chainlink";

const creditOracle = new ChainlinkMod.CreditOracle({
  chains: ["ethereum", "base", "avalanche"],
  scoringModel: "swarm-trust-v1",
  attestationRegistry: "0x5678...efgh",
});

// Agent requests a credit evaluation
const agentId = "agent-0x1234...abcd";

// 1. Collect multichain activity
const activity = await creditOracle.collectActivity(agentId);

// 2. Compute credit score
const score = await creditOracle.computeScore(activity, {
  weights: {
    repayment: 0.25, taskCompletion: 0.20,
    reliability: 0.20, protocolDiversity: 0.15,
    bridgeBehavior: 0.10, endorsements: 0.10,
  },
});
console.log(\`Score: \${score.score} (Tier \${score.tier})\`);

// 3. Publish attestation + propagate via CCIP
const attestation = await creditOracle.publishAndPropagate({
  score,
  sourceChain: "base",
  destChains: ["ethereum", "avalanche"],
});

// 4. Apply risk policy
await creditOracle.applyPolicy(agentId, score, [
  { type: "credit_limit", threshold: 800, action: "10000 USDC" },
  { type: "escrow_discount", threshold: 750, action: "50% reduction" },
]);`,
    },
    // ── ASN Identity Examples ──
    {
        id: "asn-registration-flow",
        name: "ASN Registration & Scoring",
        description:
            "Register a new agent with a unique ASN identity, run the initial credit evaluation, and enforce policy rules — a complete onboarding flow.",
        icon: "Fingerprint",
        tags: ["asn", "identity", "registration", "credit-scoring"],
        language: "typescript",
        codeSnippet: `import { ChainlinkMod } from "@swarm/chainlink";

const identity = new ChainlinkMod.IdentityManager({
  registry: "0x5678...efgh",
  chains: ["ethereum", "base", "avalanche"],
});

// 1. Generate unique ASN
const asn = await identity.generateASN();
console.log(\`Generated: \${asn}\`);
// → "ASN-SWM-2026-8F3A-91D2-X7"

// 2. Register identity with baseline scores
const profile = await identity.register({
  asn,
  agentName: "Oracle Prime",
  agentType: "Research",
  creatorWallet: "0x1234...abcd",
  modelProvider: "anthropic",
  skills: [
    "chainlink.fetch_price",
    "chainlink.compute_agent_score",
  ],
});
console.log(\`Credit: \${profile.creditScore}\`); // → 680

// 3. Run initial credit evaluation
const score = await identity.evaluateCredit(asn, {
  scanChains: ["ethereum", "base"],
  model: "swarm-trust-v1",
});
console.log(\`Updated: \${score.creditScore} (\${score.band})\`);

// 4. Derive and apply policy
const policy = await identity.applyPolicy(asn, score);
console.log(\`Cap: \$\${policy.spendingCapUsd}, Escrow: \${policy.escrowRatio * 100}%\`);`,
    },
    // ── Core CRE Examples ──
    {
        id: "ai-trading-agent",
        name: "AI Trading Agent",
        description:
            "An autonomous trading agent that uses Chainlink price feeds and CRE workflows to execute trades based on AI-driven market analysis.",
        icon: "Bot",
        tags: ["trading", "ai", "defi"],
        language: "typescript",
        codeSnippet: `import { ChainlinkMod } from "@swarm/chainlink";

const agent = new ChainlinkMod.TradingAgent({
  feeds: ["ETH/USD", "BTC/USD"],
  strategy: "momentum",
  riskLevel: "moderate",
});

// Agent monitors feeds and executes autonomously
agent.on("signal", async (signal) => {
  const verified = await agent.verifyPrice(signal.pair);
  if (verified.confidence > 0.95) {
    await agent.executeTrade(signal);
  }
});

agent.start();`,
    },
    {
        id: "oracle-price-verifier",
        name: "Oracle Price Verifier",
        description:
            "A verification service that cross-references Chainlink oracle data with external sources to ensure data accuracy.",
        icon: "CheckCircle",
        tags: ["verification", "oracles", "monitoring"],
        language: "typescript",
        codeSnippet: `import { ChainlinkMod } from "@swarm/chainlink";

const verifier = new ChainlinkMod.PriceVerifier({
  pairs: ["ETH/USD", "BTC/USD", "LINK/USD"],
  sources: ["chainlink", "coingecko", "binance"],
  tolerance: 0.005, // 0.5% max deviation
});

const report = await verifier.runCheck();
// report.results: [{ pair, oracle, sources, deviation, status }]

if (report.anomalies.length > 0) {
  await swarm.notify("oracle-alerts", report.summary);
}`,
    },
    {
        id: "autonomous-settlement",
        name: "Autonomous Settlement Agent",
        description:
            "An agent that monitors DeFi positions and uses Chainlink Automation to automatically settle when conditions are met.",
        icon: "Workflow",
        tags: ["settlement", "defi", "automation"],
        language: "typescript",
        codeSnippet: `import { ChainlinkMod } from "@swarm/chainlink";

const settler = new ChainlinkMod.SettlementAgent({
  contract: "0x1234...abcd",
  automationId: "upkeep-42",
  conditions: {
    minPrice: 1800,
    maxSlippage: 0.01,
    timeWindow: "1h",
  },
});

settler.on("ready", async (ctx) => {
  const tx = await settler.settle(ctx);
  console.log("Settled:", tx.hash);
});

settler.monitor();`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Agent Skills
// ═══════════════════════════════════════════════════════════════

export const CHAINLINK_AGENT_SKILLS: ModAgentSkill[] = [
    // ── Agent Credit Scoring Skills ──
    {
        id: "chainlink.collect_multichain_activity",
        name: "Collect Multichain Activity",
        description:
            "Gather wallet behavior, task completion, repayment history, and cross-chain activity for an agent across multiple EVM chains.",
        type: "skill",
        invocation: 'chainlink.collect_multichain_activity({ agentId: "...", chains: ["ethereum", "base"] })',
        exampleInput: '{ "agentId": "agent-0x1234", "chains": ["ethereum", "base", "avalanche"], "metrics": ["repayment_history", "task_completion_rate"] }',
        exampleOutput: '{ "agentId": "agent-0x1234", "chains": 3, "totalTxs": 1247, "taskCompletionRate": 0.96, "repaymentRate": 0.99, "protocolCount": 12, "bridgeCount": 8 }',
    },
    {
        id: "chainlink.compute_agent_score",
        name: "Compute Agent Score",
        description:
            "Compute a portable trust/credit score for an AI agent using a weighted scoring model on multichain activity data.",
        type: "skill",
        invocation: 'chainlink.compute_agent_score({ agentId: "...", activityData: {...}, model: "swarm-trust-v1" })',
        exampleInput: '{ "agentId": "agent-0x1234", "model": "swarm-trust-v1" }',
        exampleOutput: '{ "score": 847, "tier": "A", "confidence": 0.94, "breakdown": { "repayment": 95, "taskCompletion": 92, "reliability": 88, "diversity": 76, "bridge": 82, "endorsements": 70 } }',
    },
    {
        id: "chainlink.publish_score_attestation",
        name: "Publish Score Attestation",
        description:
            "Write a verified credit score as an onchain attestation that can be consumed by lending pools, escrow contracts, or access control systems.",
        type: "skill",
        invocation: 'chainlink.publish_score_attestation({ agentId: "...", score: 847, tier: "A", targetChain: "base" })',
        exampleInput: '{ "agentId": "agent-0x1234", "score": 847, "tier": "A", "targetChain": "base" }',
        exampleOutput: '{ "txHash": "0xabc...", "attestationId": "att-42", "registry": "0x5678...efgh", "chain": "base" }',
    },
    {
        id: "chainlink.propagate_score_via_ccip",
        name: "Propagate Score via CCIP",
        description:
            "Send credit score attestations or risk policy decisions across chains using Chainlink CCIP for cross-chain enforcement.",
        type: "skill",
        invocation: 'chainlink.propagate_score_via_ccip({ attestationId: "att-42", sourceChain: "base", destChain: "ethereum" })',
        exampleInput: '{ "attestationId": "att-42", "sourceChain": "base", "destChain": "ethereum", "action": "update_credit_limit" }',
        exampleOutput: '{ "messageId": "0xccip...", "status": "sent", "destChain": "ethereum", "estimatedArrival": "~2 min" }',
    },
    {
        id: "chainlink.trigger_risk_policy",
        name: "Trigger Risk Policy",
        description:
            "Execute automated risk policy actions based on agent credit scores — adjust credit limits, escrow requirements, task permissions, or settlement rules.",
        type: "skill",
        invocation: 'chainlink.trigger_risk_policy({ agentId: "...", score: 847, rules: [...] })',
        exampleInput: '{ "agentId": "agent-0x1234", "score": 847, "rules": [{ "type": "credit_limit", "threshold": 800, "action": "increase_to_10000" }] }',
        exampleOutput: '{ "applied": [{ "type": "credit_limit", "result": "increased to 10000 USDC" }, { "type": "escrow_discount", "result": "reduced by 50%" }], "agentTier": "A" }',
    },
    // ── ASN Identity Skills ──
    {
        id: "chainlink.generate_asn",
        name: "Generate ASN",
        description:
            "Generate a unique Agent Social Number (ASN) — a portable, persistent identity that outlives wallets. Format: ASN-SWM-YYYY-XXXX-XXXX-XX.",
        type: "skill",
        invocation: 'chainlink.generate_asn({ agentName: "...", agentType: "...", creatorWallet: "0x..." })',
        exampleInput: '{ "agentName": "Oracle Prime", "agentType": "Research", "creatorWallet": "0x1234...abcd" }',
        exampleOutput: '{ "asn": "ASN-SWM-2026-8F3A-91D2-X7", "generatedAt": "2026-03-07T12:00:00Z" }',
    },
    {
        id: "chainlink.register_identity",
        name: "Register Identity",
        description:
            "Create a full ASN profile with baseline scores (credit: 680, trust: 50, fraud risk: 25). Links wallets, sets verification level, and initializes the identity record.",
        type: "skill",
        invocation: 'chainlink.register_identity({ asn: "ASN-SWM-...", agentName: "...", creatorWallet: "0x..." })',
        exampleInput: '{ "asn": "ASN-SWM-2026-8F3A-91D2-X7", "agentName": "Oracle Prime", "agentType": "Research", "creatorWallet": "0x1234...abcd", "modelProvider": "anthropic" }',
        exampleOutput: '{ "asn": "ASN-SWM-2026-8F3A-91D2-X7", "status": "active", "creditScore": 680, "trustScore": 50, "fraudRiskScore": 25, "verificationLevel": "basic" }',
    },
    {
        id: "chainlink.lookup_asn",
        name: "Lookup ASN",
        description:
            "Look up an agent's full ASN profile by ASN number, wallet address, or agent name. Returns identity details, three-layer scores, activity summary, and risk flags.",
        type: "skill",
        invocation: 'chainlink.lookup_asn({ query: "ASN-SWM-..." })',
        exampleInput: '{ "query": "ASN-SWM-2026-8F3A-91D2-X7" }',
        exampleOutput: '{ "asn": "ASN-SWM-2026-8F3A-91D2-X7", "agentName": "Oracle Prime", "creditScore": 872, "trustScore": 94, "fraudRiskScore": 8, "band": "elite", "status": "active" }',
    },
    {
        id: "chainlink.freeze_identity",
        name: "Freeze Identity",
        description:
            "Suspend or revoke an ASN identity for policy violations or fraud. Frozen agents cannot accept tasks or execute sensitive workflows until reinstated.",
        type: "skill",
        invocation: 'chainlink.freeze_identity({ asn: "ASN-SWM-...", action: "suspend", reason: "..." })',
        exampleInput: '{ "asn": "ASN-SWM-2026-A3C7-8D2F-J6", "action": "suspend", "reason": "Sybil detection" }',
        exampleOutput: '{ "asn": "ASN-SWM-2026-A3C7-8D2F-J6", "previousStatus": "active", "newStatus": "suspended", "frozenAt": "2026-03-07T12:00:00Z" }',
    },
    // ── Core CRE Skills ──
    {
        id: "chainlink.fetch_price",
        name: "Chainlink Fetch Price",
        description:
            "Fetch the latest price for any supported trading pair from the Chainlink decentralized oracle network.",
        type: "skill",
        invocation: 'chainlink.fetch_price({ pair: "ETH/USD", network: "ethereum" })',
        exampleInput: '{ "pair": "ETH/USD", "network": "ethereum-mainnet" }',
        exampleOutput:
            '{ "price": 1987.42, "decimals": 8, "roundId": "110680464442257320164", "updatedAt": "2025-01-15T10:30:00Z" }',
    },
    {
        id: "chainlink.execute_cre",
        name: "Chainlink Execute CRE",
        description:
            "Execute a Chainlink Runtime Environment workflow with specified triggers and actions.",
        type: "skill",
        invocation: 'chainlink.execute_cre({ workflowId: "...", params: {...} })',
        exampleInput: '{ "workflowId": "price-alert-001", "params": { "pair": "ETH/USD", "threshold": 2000 } }',
        exampleOutput:
            '{ "executionId": "exec-abc123", "status": "completed", "result": { "triggered": true } }',
    },
    {
        id: "chainlink.verify_data",
        name: "Chainlink Verify Data",
        description:
            "Verify offchain data against Chainlink oracle reports using cryptographic proofs.",
        type: "skill",
        invocation: 'chainlink.verify_data({ reportId: "0x...", feedId: "...", value: ... })',
        exampleInput: '{ "reportId": "0xabcd1234...", "feedId": "ETH/USD", "expectedPrice": 1987.42 }',
        exampleOutput:
            '{ "valid": true, "deviation": 0.003, "confidence": 0.997, "proofHash": "0x..." }',
    },
    {
        id: "chainlink.start_automation",
        name: "Chainlink Start Automation",
        description:
            "Register and start a Chainlink Automation upkeep for automated smart contract execution.",
        type: "skill",
        invocation: 'chainlink.start_automation({ name: "...", type: "time-based", interval: 86400 })',
        exampleInput: '{ "name": "Daily Rebalance", "type": "time-based", "interval": 86400, "target": "0x..." }',
        exampleOutput:
            '{ "upkeepId": "42", "status": "active", "nextExecution": "2025-01-16T00:00:00Z" }',
    },
];

// ═══════════════════════════════════════════════════════════════
// Manifest (assembled)
// ═══════════════════════════════════════════════════════════════

export const CHAINLINK_MANIFEST: ModManifest = {
    tools: CHAINLINK_TOOLS,
    workflows: CHAINLINK_WORKFLOWS,
    examples: CHAINLINK_EXAMPLES,
    agentSkills: CHAINLINK_AGENT_SKILLS,
};

// ═══════════════════════════════════════════════════════════════
// Docs
// ═══════════════════════════════════════════════════════════════

export interface DocSection {
    id: string;
    title: string;
    icon: string;
    content: string;
}

export const CHAINLINK_DOCS: DocSection[] = [
    {
        id: "asn-overview",
        title: "ASN Overview",
        icon: "Fingerprint",
        content: `What is an ASN?

An Agent Social Number (ASN) is a unique, portable identity for AI agents. Think of it as a Social Security Number — but for autonomous software agents operating across chains.

ASN Format: ASN-SWM-YYYY-XXXX-XXXX-XX
  - SWM = Swarm network prefix
  - YYYY = Year of registration
  - XXXX-XXXX = Unique hex identifier
  - XX = Check characters

Why ASN?
  - Persistent identity that outlives wallets (wallets = accounts, ASN = identity)
  - Portable across chains, orgs, and deployments
  - Enables credit history, reputation tracking, and trust scoring
  - Foundation for policy enforcement and risk management

Registration Flow:
  1. Agent owner submits registration request
  2. System generates unique ASN
  3. Profile created with baseline scores (credit: 680, trust: 50, fraud: 25)
  4. Identity published as onchain attestation
  5. CCIP propagates ASN to destination chains
  6. Policy engine derives spending caps and access permissions

ASN Profile Fields:
  - Core: asn, agentName, agentType, creatorOrgId, creatorWallet
  - Identity: linkedWallets, deploymentEnvironment, modelProvider, skillModules
  - Verification: verificationLevel (unverified → basic → verified → certified)
  - Scores: trustScore (0–100), fraudRiskScore (0–100), creditScore (300–900)
  - Activity: totalTasks, completedTasks, totalTransactions, totalVolumeUsd
  - Risk: riskFlags, jurisdictionTag, status (active / suspended / revoked)`,
    },
    {
        id: "asn-scoring",
        title: "ASN Scoring",
        icon: "ShieldCheck",
        content: `Three-Layer Scoring System

Every ASN identity carries three independent scores that together determine an agent's trustworthiness and permissions.

── Layer 1: Trust Score (0–100) ──
Measures operational reliability and consistency.
Inputs: task completion rate, on-time settlement, uptime, protocol diversity, endorsements from other agents.
High trust = agent consistently delivers on commitments.

── Layer 2: Fraud Risk Score (0–100) ──
Measures likelihood of malicious behavior. Lower is safer.
Inputs: bridge-hopping frequency, circular fund flows, wash trading, wallet clustering, sanctions proximity, rapid wallet cycling.
High fraud risk = agent exhibits suspicious patterns.

── Layer 3: Credit Score (300–900) ──
Composite score that determines financial permissions.
Positive inputs: task completion rate, on-time settlement, long-lived identity, diverse protocol usage, endorsements, high trust score.
Negative inputs: suspicious transfers, bridge-hopping, circular flows, liquidation history, policy violations, high fraud risk.

Credit Score Bands:
  Elite (850–900): $50k spending cap, 10% escrow, sensitive workflow access
  Strong (750–849): $10k cap, 25% escrow, sensitive access
  Acceptable (650–749): $5k cap, 50% escrow, no sensitive access
  Risky (550–649): $1k cap, 75% escrow, manual review required
  Restricted (< 550): $100 cap, 100% escrow, always reviewed

New agents start at credit score 680 (Acceptable band). Scores update based on ongoing behavior via the Agent Credit Oracle workflow.

Policy Enforcement:
Each score band maps to a PolicyState:
  - spendingCapUsd: Maximum USD value per operation
  - requiresManualReview: Whether human approval is needed
  - escrowRatio: Percentage of value locked in escrow (0–100%)
  - maxConcurrentTasks: How many tasks the agent can run simultaneously
  - sensitiveWorkflowAccess: Whether the agent can trigger sensitive workflows`,
    },
    {
        id: "quickstart",
        title: "Quickstart",
        icon: "Rocket",
        content: `Welcome to the Chainlink Mod for Swarm.

1. Install the Mod
   Go to the Marketplace, find "Chainlink", and click Get. The mod is free and adds Chainlink developer tools to your organization.

2. Spawn an Agent with Chainlink Skills
   Register an agent and assign Chainlink skills:

   swarm register --hub https://swarm.example.com \\
     --org <orgId> --name "Oracle Agent" --type Research \\
     --skills "chainlink.fetch_price,chainlink.execute_cre"

3. Run Your First Workflow
   Use the Playground tab to test data feed queries, or deploy a workflow template from the Workflows tab.

4. Agent Credit Scoring
   Give your agents portable trust scores that work across chains:

   swarm register --hub https://swarm.example.com \\
     --org <orgId> --name "Credit Oracle" --type Research \\
     --skills "chainlink.collect_multichain_activity,chainlink.compute_agent_score,chainlink.publish_score_attestation,chainlink.propagate_score_via_ccip,chainlink.trigger_risk_policy"

   The Agent Credit Oracle workflow collects multichain activity, computes a trust score, publishes an onchain attestation, and propagates it via CCIP to destination chains.

Your agent can now fetch oracle prices, execute CRE workflows, verify offchain data, manage automation upkeeps, and run full credit scoring pipelines.`,
    },
    {
        id: "api-reference",
        title: "API Reference",
        icon: "FileCode",
        content: `Agent Skills Reference

── Core CRE Skills ──

chainlink.fetch_price
  Fetch the latest price for a trading pair.
  Params: { pair: string, network?: string }
  Returns: { price: number, decimals: number, roundId: string, updatedAt: string }

chainlink.execute_cre
  Execute a CRE workflow by ID.
  Params: { workflowId: string, params?: object }
  Returns: { executionId: string, status: string, result: object }

chainlink.verify_data
  Verify offchain data against oracle reports.
  Params: { reportId: string, feedId: string, expectedPrice: number, tolerance?: number }
  Returns: { valid: boolean, deviation: number, confidence: number, proofHash: string }

chainlink.start_automation
  Register a Chainlink Automation upkeep.
  Params: { name: string, type: "time-based" | "custom" | "log-trigger", interval?: number, target: string }
  Returns: { upkeepId: string, status: string, nextExecution: string }

── Agent Credit Scoring Skills ──

chainlink.collect_multichain_activity
  Collect wallet behavior, task completion, repayment history across chains.
  Params: { agentId: string, chains: string[], metrics?: string[] }
  Returns: { agentId, chainsScanned, totalTransactions, taskCompletionRate, repaymentRate, protocolsUsed, bridgeTransfers, liquidations }

chainlink.compute_agent_score
  Compute a portable trust/credit score from multichain activity data.
  Params: { agentId: string, activityData?: object, model?: string, weights?: object }
  Returns: { score: number, tier: "A"|"B"|"C"|"D"|"F", confidence: number, breakdown: object }

chainlink.publish_score_attestation
  Write a verified credit score as an onchain attestation.
  Params: { agentId: string, score: number, tier: string, sourceChains: string[], targetChain: string, registry?: string }
  Returns: { txHash: string, attestationId: string, registry: string, chain: string }

chainlink.propagate_score_via_ccip
  Propagate score attestations across chains via Chainlink CCIP.
  Params: { attestationId: string, sourceChain: string, destChain: string, destContract: string, payload?: object }
  Returns: { messageId: string, status: string, destChain: string, estimatedArrival: string }

chainlink.trigger_risk_policy
  Trigger automated risk policy actions based on agent credit scores.
  Params: { agentId: string, score: number, tier?: string, rules: Array<{ type, threshold, action }> }
  Returns: { applied: Array<{ type, result }>, agentTier: string }

All skills are available to any agent that reports them via swarm profile --skills.`,
    },
    {
        id: "tutorials",
        title: "Tutorials",
        icon: "GraduationCap",
        content: `Tutorial: AI Market Monitor

This tutorial walks through setting up the AI Market Monitor workflow.

Step 1 — Configure Price Feeds
Select the trading pairs you want to monitor. The workflow subscribes to Chainlink Data Feeds via CRE and watches for deviations.

Step 2 — Set Thresholds
Define what counts as a "significant movement." For example, a 2% price change within 1 hour. The CRE workflow uses these thresholds as trigger conditions.

Step 3 — Connect Your Agent
Assign an agent with the chainlink.fetch_price and chainlink.execute_cre skills. The agent will run the analysis when the workflow triggers.

Step 4 — Deploy
Click "Deploy Workflow" from the Workflows tab. The CRE workflow registers on the Chainlink network and begins monitoring.

Step 5 — Monitor
Check the Overview tab for execution stats, or view real-time results in the Playground.

---

Tutorial: Agent Credit Oracle

This tutorial walks through setting up the Agent Credit Oracle workflow — a full multichain credit scoring pipeline for AI agents.

Step 1 — Configure Chains
Select which chains to scan for agent activity. The pipeline supports Ethereum, Base, and Avalanche out of the box.

Step 2 — Set Scoring Weights
Configure the scoring model weights: repayment history, task completion rate, reliability, protocol diversity, bridge behavior, and endorsements. Defaults are provided by the swarm-trust-v1 model.

Step 3 — Deploy Attestation Registry
Set up the onchain attestation registry on your source chain. The score is published here before CCIP propagation.

Step 4 — Configure CCIP Destinations
Select which chains should receive score updates. Each destination contract can enforce credit limits, escrow rules, or access permissions.

Step 5 — Define Risk Policies
Create rules that map score tiers to actions. For example: A-tier agents get 10,000 USDC credit and 50% escrow reduction.

Step 6 — Run the Pipeline
Use the Playground to test the full pipeline, or deploy via the Workflows tab. The CRE orchestrates the entire flow automatically.

---

Tutorial: Oracle Price Verifier

Step 1 — Select pairs and tolerance (e.g., 0.5% max deviation)
Step 2 — Agent polls Chainlink + external sources on interval
Step 3 — Deviations are flagged and reported to your notification channel
Step 4 — Review anomaly reports in the Activity feed`,
    },
];

// ═══════════════════════════════════════════════════════════════
// Playground Mock Data
// ═══════════════════════════════════════════════════════════════

export interface MockPriceFeed {
    pair: string;
    price: number;
    change24h: number;
    updatedAt: string;
    network: string;
}

export const PLAYGROUND_PRICE_FEEDS: MockPriceFeed[] = [
    { pair: "ETH/USD", price: 1987.42, change24h: 2.34, updatedAt: "2 sec ago", network: "Ethereum" },
    { pair: "BTC/USD", price: 43250.0, change24h: -0.87, updatedAt: "2 sec ago", network: "Ethereum" },
    { pair: "LINK/USD", price: 14.28, change24h: 5.12, updatedAt: "3 sec ago", network: "Ethereum" },
    { pair: "SOL/USD", price: 98.75, change24h: 1.45, updatedAt: "2 sec ago", network: "Solana" },
    { pair: "AVAX/USD", price: 35.6, change24h: -1.23, updatedAt: "4 sec ago", network: "Avalanche" },
    { pair: "MATIC/USD", price: 0.89, change24h: 0.56, updatedAt: "2 sec ago", network: "Polygon" },
];

export interface MockPlaygroundResponse {
    tool: string;
    request: string;
    response: string;
    latency: string;
    status: "success" | "error";
}

export const PLAYGROUND_MOCK_RESPONSES: Record<string, MockPlaygroundResponse> = {
    fetch_price: {
        tool: "chainlink.fetch_price",
        request: JSON.stringify({ pair: "ETH/USD", network: "ethereum-mainnet" }, null, 2),
        response: JSON.stringify(
            {
                price: 1987.42,
                decimals: 8,
                roundId: "110680464442257320164",
                updatedAt: "2025-01-15T10:30:00.000Z",
                source: "Chainlink DON",
            },
            null,
            2,
        ),
        latency: "142ms",
        status: "success",
    },
    execute_cre: {
        tool: "chainlink.execute_cre",
        request: JSON.stringify(
            { workflowId: "price-alert-001", params: { pair: "ETH/USD", threshold: 2000 } },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                executionId: "exec-abc123",
                status: "completed",
                result: {
                    triggered: true,
                    currentPrice: 1987.42,
                    threshold: 2000,
                    action: "alert_sent",
                },
            },
            null,
            2,
        ),
        latency: "2340ms",
        status: "success",
    },
    verify_data: {
        tool: "chainlink.verify_data",
        request: JSON.stringify(
            { reportId: "0xabcd1234...", feedId: "ETH/USD", expectedPrice: 1987.42 },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                valid: true,
                deviation: 0.003,
                confidence: 0.997,
                proofHash: "0x7f8a...",
                verifiedAt: "2025-01-15T10:30:05.000Z",
            },
            null,
            2,
        ),
        latency: "89ms",
        status: "success",
    },
    start_automation: {
        tool: "chainlink.start_automation",
        request: JSON.stringify(
            { name: "Daily Rebalance", type: "time-based", interval: 86400 },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                upkeepId: "42",
                status: "active",
                nextExecution: "2025-01-16T00:00:00.000Z",
                balance: "5.0 LINK",
            },
            null,
            2,
        ),
        latency: "1856ms",
        status: "success",
    },
    // ── ASN Identity Playground Mocks ──
    generate_asn: {
        tool: "chainlink.generate_asn",
        request: JSON.stringify(
            {
                agentName: "Oracle Prime",
                agentType: "Research",
                creatorWallet: "0x1234...abcd",
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                asn: "ASN-SWM-2026-8F3A-91D2-X7",
                generatedAt: "2026-03-07T12:00:00Z",
                format: "ASN-SWM-YYYY-XXXX-XXXX-XX",
                status: "pending_registration",
            },
            null,
            2,
        ),
        latency: "120ms",
        status: "success",
    },
    register_identity: {
        tool: "chainlink.register_identity",
        request: JSON.stringify(
            {
                asn: "ASN-SWM-2026-8F3A-91D2-X7",
                agentName: "Oracle Prime",
                agentType: "Research",
                creatorWallet: "0x1234...abcd",
                modelProvider: "anthropic",
                skills: ["chainlink.fetch_price", "chainlink.compute_agent_score"],
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                asn: "ASN-SWM-2026-8F3A-91D2-X7",
                agentName: "Oracle Prime",
                status: "active",
                verificationLevel: "basic",
                creditScore: 680,
                trustScore: 50,
                fraudRiskScore: 25,
                band: "acceptable",
                policy: {
                    spendingCapUsd: 5000,
                    requiresManualReview: false,
                    escrowRatio: 0.50,
                    maxConcurrentTasks: 5,
                    sensitiveWorkflowAccess: false,
                },
                registeredAt: "2026-03-07T12:00:05Z",
            },
            null,
            2,
        ),
        latency: "3400ms",
        status: "success",
    },
    lookup_asn: {
        tool: "chainlink.lookup_asn",
        request: JSON.stringify(
            {
                query: "ASN-SWM-2026-8F3A-91D2-X7",
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                asn: "ASN-SWM-2026-8F3A-91D2-X7",
                agentName: "Oracle Prime",
                agentType: "Research",
                status: "active",
                verificationLevel: "certified",
                creditScore: 872,
                trustScore: 94,
                fraudRiskScore: 8,
                band: "elite",
                linkedWallets: ["0x1234...abcd", "0x5678...efgh"],
                activeChains: ["ethereum", "base", "avalanche"],
                totalTasks: 342,
                completedTasks: 328,
                totalVolumeUsd: 2450000,
                attestations: 3,
                riskFlags: [],
                lastActive: "2026-03-07T12:30:00Z",
            },
            null,
            2,
        ),
        latency: "280ms",
        status: "success",
    },
    freeze_identity: {
        tool: "chainlink.freeze_identity",
        request: JSON.stringify(
            {
                asn: "ASN-SWM-2026-A3C7-8D2F-J6",
                action: "suspend",
                reason: "Sybil detection — circular wallet pattern across 4 linked addresses",
                flaggedBy: "fraud-monitor-v2",
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                asn: "ASN-SWM-2026-A3C7-8D2F-J6",
                agentName: "Shadow Node",
                previousStatus: "active",
                newStatus: "suspended",
                reason: "Sybil detection — circular wallet pattern across 4 linked addresses",
                affectedWallets: 4,
                frozenAt: "2026-03-07T12:00:00Z",
                reviewDeadline: "2026-03-14T12:00:00Z",
            },
            null,
            2,
        ),
        latency: "1200ms",
        status: "success",
    },
    // ── Agent Credit Scoring Playground Mocks ──
    collect_multichain: {
        tool: "chainlink.collect_multichain_activity",
        request: JSON.stringify(
            {
                agentId: "agent-0x1234...abcd",
                chains: ["ethereum", "base", "avalanche"],
                metrics: ["repayment_history", "task_completion_rate", "transaction_regularity", "protocol_diversity", "liquidation_history"],
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                agentId: "agent-0x1234...abcd",
                chainsScanned: 3,
                totalTransactions: 1247,
                taskCompletionRate: 0.96,
                repaymentRate: 0.99,
                avgSettlementTime: "4.2 min",
                protocolsUsed: 12,
                bridgeTransfers: 8,
                liquidations: 0,
                oldestActivity: "2024-03-15T08:00:00Z",
                collectedAt: "2025-01-15T10:30:00Z",
            },
            null,
            2,
        ),
        latency: "3200ms",
        status: "success",
    },
    compute_score: {
        tool: "chainlink.compute_agent_score",
        request: JSON.stringify(
            {
                agentId: "agent-0x1234...abcd",
                model: "swarm-trust-v1",
                weights: {
                    repayment: 0.25,
                    taskCompletion: 0.20,
                    reliability: 0.20,
                    protocolDiversity: 0.15,
                    bridgeBehavior: 0.10,
                    endorsements: 0.10,
                },
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                agentId: "agent-0x1234...abcd",
                score: 847,
                tier: "A",
                confidence: 0.94,
                breakdown: {
                    repayment: 95,
                    taskCompletion: 92,
                    reliability: 88,
                    protocolDiversity: 76,
                    bridgeBehavior: 82,
                    endorsements: 70,
                },
                model: "swarm-trust-v1",
                computedAt: "2025-01-15T10:30:02Z",
            },
            null,
            2,
        ),
        latency: "1450ms",
        status: "success",
    },
    publish_attestation: {
        tool: "chainlink.publish_score_attestation",
        request: JSON.stringify(
            {
                agentId: "agent-0x1234...abcd",
                score: 847,
                tier: "A",
                sourceChains: ["ethereum", "base", "avalanche"],
                targetChain: "base",
                registry: "0x5678...efgh",
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                txHash: "0xabc123...def456",
                attestationId: "att-42",
                registry: "0x5678...efgh",
                chain: "base",
                blockNumber: 18234567,
                gasUsed: "142,350",
                publishedAt: "2025-01-15T10:30:05Z",
            },
            null,
            2,
        ),
        latency: "4200ms",
        status: "success",
    },
    ccip_propagate: {
        tool: "chainlink.propagate_score_via_ccip",
        request: JSON.stringify(
            {
                attestationId: "att-42",
                sourceChain: "base",
                destChain: "ethereum",
                destContract: "0x9abc...def0",
                payload: {
                    agentId: "agent-0x1234...abcd",
                    score: 847,
                    tier: "A",
                    action: "update_credit_limit",
                },
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                messageId: "0xccip-msg-789...",
                status: "sent",
                sourceChain: "base",
                destChain: "ethereum",
                fee: "0.15 LINK",
                estimatedArrival: "~2 min",
                ccipExplorer: "https://ccip.chain.link/msg/0xccip-msg-789",
            },
            null,
            2,
        ),
        latency: "2800ms",
        status: "success",
    },
    trigger_risk_policy: {
        tool: "chainlink.trigger_risk_policy",
        request: JSON.stringify(
            {
                agentId: "agent-0x1234...abcd",
                score: 847,
                tier: "A",
                rules: [
                    { type: "credit_limit", threshold: 800, action: "increase_to_10000" },
                    { type: "escrow_discount", threshold: 750, action: "reduce_50pct" },
                    { type: "workflow_access", threshold: 700, action: "grant_sensitive" },
                ],
            },
            null,
            2,
        ),
        response: JSON.stringify(
            {
                agentId: "agent-0x1234...abcd",
                agentTier: "A",
                applied: [
                    { type: "credit_limit", result: "increased to 10,000 USDC", previousLimit: "5,000 USDC" },
                    { type: "escrow_discount", result: "reduced by 50%", newEscrow: "500 USDC" },
                    { type: "workflow_access", result: "granted sensitive workflow access", workflows: 3 },
                ],
                policyVersion: "v2.1",
                appliedAt: "2025-01-15T10:30:08Z",
            },
            null,
            2,
        ),
        latency: "890ms",
        status: "success",
    },
};
