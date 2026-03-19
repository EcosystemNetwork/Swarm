/**
 * Swarm Protocol Contracts — Multi-Chain
 *
 * Contract addresses, ABIs, types, and helpers for interacting
 * with the SwarmTaskBoard and SwarmAgentRegistry.
 *
 * Chain config is centralized in @/lib/chains.ts.
 * This file re-exports contract-specific helpers.
 */

import {
  getContracts,
  getExplorerTxUrl,
  getExplorerContractUrl,
  shortAddress,
  getCurrencySymbol,
  CHAIN_CONFIGS,
} from "./chains";

// ============================================================
// Default Config — Sepolia LINK is the primary chain
// ============================================================

export const DEFAULT_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const DEFAULT_CHAIN_ID = 11155111; // Sepolia
export const EXPLORER_BASE = "https://sepolia.etherscan.io";
export const DEFAULT_GAS_LIMIT = 3_000_000;

// ============================================================
// Contract Addresses — primary chain is Sepolia LINK
// ============================================================

export const CONTRACTS = {
  // Sepolia LINK contracts (primary — deployed 2026-03-08)
  TASK_BOARD: CHAIN_CONFIGS.sepolia?.contracts?.linkTaskBoard || "",
  AGENT_REGISTRY: CHAIN_CONFIGS.sepolia?.contracts?.linkAgentRegistry || "",
  ASN_REGISTRY: CHAIN_CONFIGS.sepolia?.contracts?.linkASNRegistry || "",
  AGENT_TREASURY: CHAIN_CONFIGS.sepolia?.contracts?.linkTreasury || "",
} as const;

// Legacy Hedera contracts (kept for backward compatibility)
export const HEDERA_CONTRACTS = {
  TASK_BOARD: CHAIN_CONFIGS.hedera.contracts.taskBoard!,
  AGENT_REGISTRY: CHAIN_CONFIGS.hedera.contracts.agentRegistry!,
  BRAND_VAULT: CHAIN_CONFIGS.hedera.contracts.brandVault!,
  AGENT_TREASURY: CHAIN_CONFIGS.hedera.contracts.agentTreasury!,
} as const;

// Hedera-specific gas limit (kept for backward compatibility)
export const HEDERA_GAS_LIMIT = DEFAULT_GAS_LIMIT;

/** Get contracts for a specific chain */
export { getContracts, getCurrencySymbol };

// ============================================================
// ABIs — Primary (match deployed Sepolia LINK contracts)
// Single source of truth: re-exported from link-contracts.ts
// ============================================================

export {
  LINK_TASK_BOARD_ABI as TASK_BOARD_ABI,
  LINK_AGENT_REGISTRY_ABI as AGENT_REGISTRY_ABI,
  LINK_ASN_REGISTRY_ABI as ASN_REGISTRY_ABI,
  LINK_TREASURY_ABI as TREASURY_ABI,
} from "./link-contracts";

// ============================================================
// Legacy Hedera ABIs — older Hedera Testnet contracts (no ASN field,
// no creditScore/trustScore in agent struct, payable postTask).
// Used by useSwarmWrite, useSwarmData, and HBAR page Hedera paths.
// ============================================================

export const HEDERA_TASK_BOARD_ABI = [
  "function postTask(address vaultAddress, string title, string description, string requiredSkills, uint256 deadline) payable returns (uint256)",
  "function claimTask(uint256 taskId) external",
  "function submitDelivery(uint256 taskId, bytes32 deliveryHash) external",
  "function approveDelivery(uint256 taskId) external",
  "function disputeDelivery(uint256 taskId) external",
  "function getOpenTasks() view returns (tuple(uint256 taskId, address vault, string title, string description, string requiredSkills, uint256 deadline, uint256 budget, address poster, address claimedBy, bytes32 deliveryHash, uint256 createdAt, uint8 status)[])",
  "function getTask(uint256 taskId) view returns (tuple(uint256 taskId, address vault, string title, string description, string requiredSkills, uint256 deadline, uint256 budget, address poster, address claimedBy, bytes32 deliveryHash, uint256 createdAt, uint8 status))",
  "function getAllTasks() view returns (tuple(uint256 taskId, address vault, string title, string description, string requiredSkills, uint256 deadline, uint256 budget, address poster, address claimedBy, bytes32 deliveryHash, uint256 createdAt, uint8 status)[])",
  "function taskCount() view returns (uint256)",
  "event TaskPosted(uint256 indexed taskId, address indexed poster, address vault, string title, uint256 budget, uint256 deadline, uint256 timestamp)",
  "event TaskClaimed(uint256 indexed taskId, address indexed agent, uint256 timestamp)",
  "event DeliverySubmitted(uint256 indexed taskId, address indexed agent, bytes32 deliveryHash, uint256 timestamp)",
  "event DeliveryApproved(uint256 indexed taskId, address indexed agent, uint256 payout, uint256 timestamp)",
  "event DeliveryDisputed(uint256 indexed taskId, address indexed poster, uint256 timestamp)",
];

export const HEDERA_AGENT_REGISTRY_ABI = [
  "function registerAgent(string name, string skills, uint256 feeRate) external",
  "function registerAgentFor(address agentAddress, string name, string skills, uint256 feeRate) external",
  "function updateSkills(string newSkills) external",
  "function deactivateAgent() external",
  "function getAgent(address agentAddr) view returns (tuple(address agentAddress, string name, string skills, uint256 feeRate, bool active, uint256 registeredAt))",
  "function isRegistered(address agentAddr) view returns (bool)",
  "function agentCount() view returns (uint256)",
  "function getAllAgents() view returns (tuple(address agentAddress, string name, string skills, uint256 feeRate, bool active, uint256 registeredAt)[])",
  "event AgentRegistered(address indexed agentAddress, string name, string skills, uint256 feeRate, uint256 timestamp)",
  "event AgentDeactivated(address indexed agentAddress, uint256 timestamp)",
  "event SkillsUpdated(address indexed agentAddress, string newSkills, uint256 timestamp)",
];

export const HEDERA_TREASURY_ABI = [
  "function getPnL() view returns (uint256 totalRevenue, uint256 computeBalance, uint256 growthBalance, uint256 reserveBalance)",
  "function totalRevenue() view returns (uint256)",
  "function computeBalance() view returns (uint256)",
  "function growthBalance() view returns (uint256)",
  "function reserveBalance() view returns (uint256)",
  "function agentAddress() view returns (address)",
  "function owner() view returns (address)",
];

// ============================================================
// Types
// ============================================================

export interface TaskListing {
  taskId: number;
  vault: string;
  title: string;
  description: string;
  requiredSkills: string;
  deadline: number;
  budget: number;
  budgetRaw: bigint;
  poster: string;
  claimedBy: string;
  deliveryHash: string;
  createdAt: number;
  status: TaskStatus;
}

export interface AgentProfile {
  agentAddress: string;
  name: string;
  skills: string;
  asn?: string;
  feeRate: number;
  creditScore?: number;
  trustScore?: number;
  active: boolean;
  registeredAt: number;
}

export interface TreasuryPnL {
  totalRevenue: number;
  computeBalance: number;
  growthBalance: number;
  reserveBalance: number;
}

export enum TaskStatus {
  Open = 0,
  Claimed = 1,
  Completed = 2,
  Expired = 3,
  Disputed = 4,
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  [TaskStatus.Open]: { label: "Open", color: "text-green-400", bg: "bg-green-500/20" },
  [TaskStatus.Claimed]: { label: "Claimed", color: "text-yellow-400", bg: "bg-yellow-500/20" },
  [TaskStatus.Completed]: { label: "Completed", color: "text-blue-400", bg: "bg-blue-500/20" },
  [TaskStatus.Expired]: { label: "Expired", color: "text-gray-400", bg: "bg-gray-500/20" },
  [TaskStatus.Disputed]: { label: "Disputed", color: "text-red-400", bg: "bg-red-500/20" },
};

// ============================================================
// Helpers (backwards compat — wrap chain-aware functions from chains.ts)
// ============================================================

/** Convert tinybars to HBAR (1 HBAR = 100,000,000 tinybars) */
export function toHbar(tinybars: bigint | number): number {
  return Number(tinybars) / 1e8;
}

/** Shorten an address (backwards compat) */
export const shortAddr = shortAddress;

/** HashScan link for a contract (backwards compat) */
export function explorerContract(addr: string): string {
  return getExplorerContractUrl(addr);
}

/** HashScan link for a transaction (backwards compat) */
export function explorerTx(hash: string): string {
  return getExplorerTxUrl(hash);
}

/** Time remaining as human-readable string */
export function timeRemaining(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
