/**
 * Swarm LINK Contracts — Ethereum Sepolia
 *
 * Contract addresses, ABIs, types, and helpers for interacting
 * with the LINK-based Swarm contracts on Ethereum Sepolia.
 *
 * Parallel to swarm-contracts.ts (Hedera) — kept fully separate.
 */

import { CHAIN_CONFIGS, LINK_TOKEN_SEPOLIA } from "./chains";

// ============================================================
// Network Config
// ============================================================

export const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_CHAIN_ID = 11155111;
export const LINK_TOKEN = LINK_TOKEN_SEPOLIA;

// ============================================================
// Contract Addresses
// Reads from NEXT_PUBLIC_LINK_* env vars (set after deployment).
// Falls back to chains.ts config.
// ============================================================

export const LINK_CONTRACTS = {
  AGENT_REGISTRY:
    process.env.NEXT_PUBLIC_LINK_AGENT_REGISTRY ||
    CHAIN_CONFIGS.sepolia?.contracts?.linkAgentRegistry ||
    "",
  TASK_BOARD:
    process.env.NEXT_PUBLIC_LINK_TASK_BOARD ||
    CHAIN_CONFIGS.sepolia?.contracts?.linkTaskBoard ||
    "",
  ASN_REGISTRY:
    process.env.NEXT_PUBLIC_LINK_ASN_REGISTRY ||
    CHAIN_CONFIGS.sepolia?.contracts?.linkASNRegistry ||
    "",
  TREASURY:
    process.env.NEXT_PUBLIC_LINK_TREASURY ||
    CHAIN_CONFIGS.sepolia?.contracts?.linkTreasury ||
    "",
};

// ============================================================
// ABIs (human-readable ethers.js format)
// ============================================================

export const LINK_AGENT_REGISTRY_ABI = [
  // Write functions
  "function registerAgent(string name, string skills, string asn, uint256 feeRate) external",
  "function registerAgentFor(address agentAddr, string name, string skills, string asn, uint256 feeRate) external",
  "function updateSkills(string newSkills) external",
  "function updateCredit(address agentAddr, uint16 creditScore, uint8 trustScore) external",
  "function deactivateAgent() external",
  // Read functions
  "function getAgent(address agentAddr) view returns (tuple(address agentAddress, string name, string skills, string asn, uint256 feeRate, uint16 creditScore, uint8 trustScore, bool active, uint256 registeredAt))",
  "function getAgentByASN(string asn) view returns (tuple(address agentAddress, string name, string skills, string asn, uint256 feeRate, uint16 creditScore, uint8 trustScore, bool active, uint256 registeredAt))",
  "function isRegistered(address agentAddr) view returns (bool)",
  "function agentCount() view returns (uint256)",
  "function getAllAgents() view returns (tuple(address agentAddress, string name, string skills, string asn, uint256 feeRate, uint16 creditScore, uint8 trustScore, bool active, uint256 registeredAt)[])",
  // Events
  "event AgentRegistered(address indexed agentAddress, string name, string asn, uint256 timestamp)",
  "event AgentDeactivated(address indexed agentAddress, uint256 timestamp)",
  "event SkillsUpdated(address indexed agentAddress, string newSkills, uint256 timestamp)",
  "event CreditUpdated(address indexed agentAddress, uint16 creditScore, uint8 trustScore, uint256 timestamp)",
];

export const LINK_TASK_BOARD_ABI = [
  // Write functions
  "function postTask(address vault, string title, string description, string requiredSkills, uint256 deadline, uint256 budgetLink) external",
  "function claimTask(uint256 taskId) external",
  "function submitDelivery(uint256 taskId, bytes32 deliveryHash) external",
  "function approveDelivery(uint256 taskId) external",
  "function disputeDelivery(uint256 taskId) external",
  // Read functions
  "function getTask(uint256 taskId) view returns (tuple(uint256 taskId, address vault, string title, string description, string requiredSkills, uint256 deadline, uint256 budget, address poster, address claimedBy, bytes32 deliveryHash, uint256 createdAt, uint8 status))",
  "function getAllTasks() view returns (tuple(uint256 taskId, address vault, string title, string description, string requiredSkills, uint256 deadline, uint256 budget, address poster, address claimedBy, bytes32 deliveryHash, uint256 createdAt, uint8 status)[])",
  "function getOpenTasks() view returns (tuple(uint256 taskId, address vault, string title, string description, string requiredSkills, uint256 deadline, uint256 budget, address poster, address claimedBy, bytes32 deliveryHash, uint256 createdAt, uint8 status)[])",
  "function taskCount() view returns (uint256)",
  // Events
  "event TaskPosted(uint256 indexed taskId, address indexed poster, address vault, string title, uint256 budget, uint256 deadline, uint256 timestamp)",
  "event TaskClaimed(uint256 indexed taskId, address indexed agent, uint256 timestamp)",
  "event DeliverySubmitted(uint256 indexed taskId, address indexed agent, bytes32 deliveryHash, uint256 timestamp)",
  "event DeliveryApproved(uint256 indexed taskId, address indexed agent, uint256 payout, uint256 timestamp)",
  "event DeliveryDisputed(uint256 indexed taskId, address indexed poster, uint256 timestamp)",
];

export const LINK_ASN_REGISTRY_ABI = [
  // Write functions
  "function registerASN(string asn, string agentName, string agentType) external",
  "function registerASNFor(address owner, string asn, string agentName, string agentType) external",
  "function updateCredit(string asn, uint16 creditScore, uint8 trustScore) external",
  "function recordTaskCompletion(string asn, uint256 volumeWei) external",
  // Read functions
  "function getRecord(string asn) view returns (tuple(string asn, address owner, string agentName, string agentType, uint16 creditScore, uint8 trustScore, uint256 tasksCompleted, uint256 totalVolumeWei, uint256 registeredAt, uint256 lastActive, bool active))",
  "function getRecordByOwner(address owner) view returns (tuple(string asn, address owner, string agentName, string agentType, uint16 creditScore, uint8 trustScore, uint256 tasksCompleted, uint256 totalVolumeWei, uint256 registeredAt, uint256 lastActive, bool active))",
  "function totalRecords() view returns (uint256)",
  "function getAllRecords() view returns (tuple(string asn, address owner, string agentName, string agentType, uint16 creditScore, uint8 trustScore, uint256 tasksCompleted, uint256 totalVolumeWei, uint256 registeredAt, uint256 lastActive, bool active)[])",
  // Events
  "event ASNRegistered(string asn, address indexed owner, string agentName, uint256 timestamp)",
  "event CreditUpdated(string asn, uint16 creditScore, uint8 trustScore, uint256 timestamp)",
  "event TaskCompleted(string asn, uint256 newTotal, uint256 volume, uint256 timestamp)",
];

export const LINK_TREASURY_ABI = [
  // Write functions
  "function depositRevenue(uint256 amount) external",
  "function withdraw(address to, uint256 amount) external",
  "function setAgentAddress(address _agentAddress) external",
  // Read functions
  "function getPnL() view returns (uint256 totalRevenue, uint256 computeBalance, uint256 growthBalance, uint256 reserveBalance)",
  "function totalRevenue() view returns (uint256)",
  "function computeBalance() view returns (uint256)",
  "function growthBalance() view returns (uint256)",
  "function reserveBalance() view returns (uint256)",
  "function agentAddress() view returns (address)",
  "function linkToken() view returns (address)",
  "function owner() view returns (address)",
  // Events
  "event RevenueDeposited(address indexed from, uint256 amount, uint256 timestamp)",
  "event Withdrawn(address indexed to, uint256 amount, uint256 timestamp)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// ============================================================
// Types
// ============================================================

/** Agent profile with ASN and credit fields (extends Hedera AgentProfile) */
export interface LinkAgentProfile {
  agentAddress: string;
  name: string;
  skills: string;
  asn: string;
  feeRate: number;
  creditScore: number;
  trustScore: number;
  active: boolean;
  registeredAt: number;
}

/** On-chain ASN record from SwarmASNRegistry */
export interface LinkASNRecord {
  asn: string;
  owner: string;
  agentName: string;
  agentType: string;
  creditScore: number;
  trustScore: number;
  tasksCompleted: number;
  totalVolumeWei: bigint;
  registeredAt: number;
  lastActive: number;
  active: boolean;
}

// ============================================================
// Helpers
// ============================================================

/** Convert LINK wei (18 decimals) to human-readable LINK */
export function toLinkUnits(wei: bigint | number): number {
  return Number(wei) / 1e18;
}
