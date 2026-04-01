/**
 * Flow Deploy — Smart Contract deployment management on Flow blockchain.
 *
 * Tracks deployment requests initiated by Swarm agents or admins.
 * All deployments are policy-checked and audit-logged.
 *
 * Deployment types:
 *   - cadence_contract   — Cadence smart contract
 *   - fungible_token     — FungibleToken standard contract
 *   - nft_collection     — NonFungibleToken standard collection
 *   - nft_item           — Mint single NFT into existing collection
 *   - evm_contract       — Solidity contract on Flow EVM (chain 747/545)
 *   - dex_pool           — Liquidity pool on IncrementFi
 */

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    startAfter,
    limit as firestoreLimit,
    serverTimestamp,
    Timestamp,
    type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type FlowDeployType =
    | "cadence_contract"
    | "fungible_token"
    | "nft_collection"
    | "nft_item"
    | "evm_contract"
    | "dex_pool";

export type FlowDeployStatus =
    | "pending"
    | "pending_approval"
    | "compiling"
    | "deploying"
    | "deployed"
    | "failed"
    | "rejected";

export interface FlowDeployment {
    id: string;
    orgId: string;
    type: FlowDeployType;
    status: FlowDeployStatus;
    name: string;
    description: string;
    deployerAddress: string;
    network: "mainnet" | "testnet";
    contractAddress: string | null;
    txHash: string | null;
    /** Cadence source code or Solidity bytecode */
    sourceCode: string | null;
    config: FlowDeployConfig;
    estimatedCost: string;
    actualCost: string | null;
    createdBy: string;
    agentId: string | null;
    createdAt: Date | null;
    deployedAt: Date | null;
    errorMessage: string | null;
}

export type FlowDeployConfig =
    | CadenceContractConfig
    | FungibleTokenConfig
    | NftCollectionConfig
    | NftItemConfig
    | EvmContractConfig
    | DexPoolConfig;

export interface CadenceContractConfig {
    type: "cadence_contract";
    contractName: string;
    sourceCode: string;
    initArgs: string;
}

export interface FungibleTokenConfig {
    type: "fungible_token";
    tokenName: string;
    tokenSymbol: string;
    decimals: number;
    totalSupply: string;
    metadataUri: string;
    mintable: boolean;
    adminAddress: string;
}

export interface NftCollectionConfig {
    type: "nft_collection";
    collectionName: string;
    metadataUri: string;
    maxSupply: number;
    royaltyPercent: number;
    royaltyAddress: string;
    ownerAddress: string;
}

export interface NftItemConfig {
    type: "nft_item";
    collectionAddress: string;
    itemIndex: number;
    metadataUri: string;
    ownerAddress: string;
}

export interface EvmContractConfig {
    type: "evm_contract";
    language: "solidity";
    bytecode: string;
    abi: string;
    constructorArgs: string;
}

export interface DexPoolConfig {
    type: "dex_pool";
    platform: "incrementfi" | "flowx";
    tokenAAddress: string;
    tokenBAddress: string;
    tokenAAmount: string;
    tokenBAmount: string;
    poolType: "volatile" | "stable";
}

// ═══════════════════════════════════════════════════════════════
// Deployment CRUD
// ═══════════════════════════════════════════════════════════════

export async function createFlowDeployment(
    input: Omit<FlowDeployment, "id" | "createdAt" | "deployedAt">,
): Promise<FlowDeployment> {
    const ref = await addDoc(collection(db, "flowDeployments"), {
        ...input,
        createdAt: serverTimestamp(),
        deployedAt: null,
    });
    return { ...input, id: ref.id, createdAt: new Date(), deployedAt: null };
}

export async function updateFlowDeployment(
    id: string,
    patch: Partial<Pick<FlowDeployment, "status" | "contractAddress" | "txHash" | "sourceCode" | "actualCost" | "deployedAt" | "errorMessage">>,
): Promise<void> {
    await updateDoc(doc(db, "flowDeployments", id), patch);
}

export async function getFlowDeployment(id: string): Promise<FlowDeployment | null> {
    const snap = await getDoc(doc(db, "flowDeployments", id));
    if (!snap.exists()) return null;
    return docToDeployment(snap.id, snap.data() as Record<string, unknown>);
}

export async function getFlowDeployments(
    orgId: string,
    limit = 50,
    cursor?: string,
    typeFilter?: FlowDeployType,
): Promise<{ deployments: FlowDeployment[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (typeFilter) {
        constraints.splice(1, 0, where("type", "==", typeFilter));
    }

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "flowDeployments", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "flowDeployments"), ...constraints));
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit);
    return {
        deployments: docs.map((d) => docToDeployment(d.id, d.data() as Record<string, unknown>)),
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
}

export async function getFlowDeploymentStats(orgId: string): Promise<{
    total: number;
    deployed: number;
    failed: number;
    pending: number;
    byType: Record<FlowDeployType, number>;
}> {
    const q = query(collection(db, "flowDeployments"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    const stats = {
        total: 0, deployed: 0, failed: 0, pending: 0,
        byType: { cadence_contract: 0, fungible_token: 0, nft_collection: 0, nft_item: 0, evm_contract: 0, dex_pool: 0 } as Record<FlowDeployType, number>,
    };
    for (const d of snap.docs) {
        const data = d.data();
        stats.total++;
        if (data.status === "deployed") stats.deployed++;
        else if (data.status === "failed") stats.failed++;
        else stats.pending++;
        if (data.type in stats.byType) stats.byType[data.type as FlowDeployType]++;
    }
    return stats;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function estimateFlowDeployCost(type: FlowDeployType): string {
    const estimates: Record<FlowDeployType, string> = {
        cadence_contract: "10000000",      // ~0.1 FLOW
        fungible_token: "50000000",        // ~0.5 FLOW
        nft_collection: "30000000",        // ~0.3 FLOW
        nft_item: "1000000",              // ~0.01 FLOW
        evm_contract: "20000000",          // ~0.2 FLOW
        dex_pool: "100000000",            // ~1.0 FLOW (+ initial liquidity)
    };
    return estimates[type] || "10000000";
}

export const FLOW_DEPLOY_TYPE_LABELS: Record<FlowDeployType, string> = {
    cadence_contract: "Cadence Contract",
    fungible_token: "Fungible Token",
    nft_collection: "NFT Collection",
    nft_item: "NFT Item",
    evm_contract: "EVM Contract (Solidity)",
    dex_pool: "DEX Pool",
};

export const FLOW_DEPLOY_STATUS_META: Record<FlowDeployStatus, { label: string; color: string }> = {
    pending: { label: "Pending", color: "text-muted-foreground" },
    pending_approval: { label: "Awaiting Approval", color: "text-yellow-400" },
    compiling: { label: "Compiling", color: "text-blue-400" },
    deploying: { label: "Deploying", color: "text-purple-400" },
    deployed: { label: "Deployed", color: "text-green-400" },
    failed: { label: "Failed", color: "text-red-400" },
    rejected: { label: "Rejected", color: "text-red-500" },
};

/** Flow blockchain explorers */
export const FLOW_EXPLORERS = {
    mainnet: "https://flowdiver.io/tx/",
    testnet: "https://testnet.flowdiver.io/tx/",
} as const;

/** Flow access node endpoints */
export const FLOW_ACCESS_NODES = {
    mainnet: "https://rest-mainnet.onflow.org",
    testnet: "https://rest-testnet.onflow.org",
} as const;

/** Flow EVM RPC endpoints */
export const FLOW_EVM_RPC = {
    mainnet: { url: "https://mainnet.evm.nodes.onflow.org", chainId: 747 },
    testnet: { url: "https://testnet.evm.nodes.onflow.org", chainId: 545 },
} as const;

function docToDeployment(id: string, d: Record<string, unknown>): FlowDeployment {
    return {
        id,
        orgId: (d.orgId as string) || "",
        type: (d.type as FlowDeployType) || "cadence_contract",
        status: (d.status as FlowDeployStatus) || "pending",
        name: (d.name as string) || "",
        description: (d.description as string) || "",
        deployerAddress: (d.deployerAddress as string) || "",
        network: (d.network as "mainnet" | "testnet") || "testnet",
        contractAddress: (d.contractAddress as string) || null,
        txHash: (d.txHash as string) || null,
        sourceCode: (d.sourceCode as string) || null,
        config: (d.config as FlowDeployConfig) || { type: "cadence_contract", contractName: "", sourceCode: "", initArgs: "{}" },
        estimatedCost: (d.estimatedCost as string) || "0",
        actualCost: (d.actualCost as string) || null,
        createdBy: (d.createdBy as string) || "",
        agentId: (d.agentId as string) || null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        deployedAt: d.deployedAt instanceof Timestamp ? d.deployedAt.toDate() : null,
        errorMessage: (d.errorMessage as string) || null,
    };
}
