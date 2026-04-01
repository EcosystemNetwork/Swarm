/**
 * Ethereum Foundation × ASN Integration + ERC-8004 Agent Identity
 *
 * Links Agent Social Numbers (ASN-SWM-YYYY-HHHH-HHHH-CC) to Ethereum blockchain
 * and the ERC-8004 Agent Registry. Stores Ethereum-specific ASN data: wallet
 * addresses, reputation history, ERC-8004 tokenIds, validation attestations,
 * trust scores, and cross-chain verification status.
 *
 * ERC-8004 (EIP-8004) defines three registries:
 *   - Agent Registry — ERC-721 identity tokens with operator wallets
 *   - Reputation Registry — composable on-chain trust scores
 *   - Validation Registry — third-party capability attestations
 *
 * Each agent with an ASN can have:
 *   - Ethereum wallet(s) linked to their ASN
 *   - ERC-8004 on-chain identity (tokenId + metadataURI)
 *   - On-chain reputation score synced from Hedera → Ethereum
 *   - Validation attestations from third-party validators
 *   - Cross-chain CID verification records
 *   - Structured execution logs (agent_log.json) for autonomous ops
 */

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// ERC-8004 Contract Addresses (Sepolia testnet)
// ═══════════════════════════════════════════════════════════════

export const ERC8004_CONTRACTS = {
    sepolia: {
        agentRegistry: "0x0000000000000000000000000000000000000000", // TODO: deploy
        reputationRegistry: "0x0000000000000000000000000000000000000000",
        validationRegistry: "0x0000000000000000000000000000000000000000",
    },
    mainnet: {
        agentRegistry: "0x0000000000000000000000000000000000000000",
        reputationRegistry: "0x0000000000000000000000000000000000000000",
        validationRegistry: "0x0000000000000000000000000000000000000000",
    },
} as const;

// ═══════════════════════════════════════════════════════════════
// ERC-8004 Types
// ═══════════════════════════════════════════════════════════════

/** On-chain ERC-8004 agent identity */
export interface ERC8004Identity {
    /** ERC-721 tokenId from Agent Registry */
    tokenId: string;
    /** Operator wallet address (controls the agent) */
    operatorAddress: string;
    /** IPFS/Storacha CID for agent.json manifest */
    metadataURI: string;
    /** Tx hash of registerAgent call */
    registrationTxHash: string;
    /** Block number of registration */
    registrationBlock: number;
    /** Chain ID (1 = mainnet, 11155111 = sepolia) */
    chainId: number;
    /** When registered on-chain */
    registeredAt: Date | null;
}

/** On-chain reputation from ERC-8004 Reputation Registry */
export interface ERC8004Reputation {
    /** Composite reputation score (0-100) */
    score: number;
    /** Total tasks completed */
    taskCount: number;
    /** Total successful completions */
    successCount: number;
    /** Total disputes */
    disputeCount: number;
    /** Last on-chain reputation update tx */
    lastUpdateTxHash: string | null;
    /** Last update timestamp */
    lastUpdatedAt: Date | null;
}

/** Validation attestation from ERC-8004 Validation Registry */
export interface ERC8004Validation {
    /** Validator address */
    validator: string;
    /** Capability being validated (keccak256 hash) */
    capabilityHash: string;
    /** Human-readable capability name */
    capabilityName: string;
    /** Attestation tx hash */
    txHash: string;
    /** When attestation expires (0 = never) */
    expiresAt: Date | null;
    /** When attested */
    attestedAt: Date | null;
}

/** DevSpot Agent Manifest (agent.json) */
export interface AgentManifest {
    name: string;
    operatorWallet: string;
    erc8004TokenId: string | null;
    asn: string;
    supportedTools: string[];
    techStacks: string[];
    computeConstraints: {
        maxTokensPerTask: number;
        maxCostUsd: number;
        maxConcurrentTasks: number;
    };
    taskCategories: string[];
    version: string;
}

/** Structured execution log entry (agent_log.json) */
export interface ExecutionLogEntry {
    timestamp: number;
    phase: "discover" | "plan" | "execute" | "verify" | "submit" | "error" | "retry";
    decision: string;
    toolCalls: Array<{ tool: string; args?: Record<string, unknown>; result?: unknown }>;
    result: { success: boolean; output?: unknown; error?: string };
    gasUsed?: string;
    budgetRemaining?: string;
    durationMs?: number;
}

// ═══════════════════════════════════════════════════════════════
// ASN × Ethereum Types
// ═══════════════════════════════════════════════════════════════

export interface EthASNRecord {
    /** Document ID = ASN string */
    asn: string;
    orgId: string;
    agentId: string;
    /** Ethereum wallet address(es) linked to this ASN */
    ethAddresses: EthASNWallet[];
    /** Current credit score (300-900) — synced from Hedera */
    creditScore: number;
    /** Current trust score (0-100) */
    trustScore: number;
    /** Reputation tier name */
    tier: string;
    /** Ethereum-specific stats */
    stats: EthASNStats;
    /** ERC-8004 on-chain identity (null if not yet registered) */
    erc8004Identity: ERC8004Identity | null;
    /** ERC-8004 on-chain reputation */
    erc8004Reputation: ERC8004Reputation | null;
    /** ERC-8004 validation attestations */
    erc8004Validations: ERC8004Validation[];
    /** Agent capability manifest CID */
    manifestCid: string | null;
    /** Whether ASN is registered on Ethereum chain */
    ethOnChainRegistered: boolean;
    /** Ethereum tx hash of on-chain registration */
    ethRegistrationTxHash: string | null;
    /** Hedera tx hash (from original ASN registration) */
    hederaTxHash: string | null;
    /** Cross-chain sync status */
    crossChainSynced: boolean;
    lastSyncedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface EthASNWallet {
    address: string;
    network: "mainnet" | "sepolia";
    isPrimary: boolean;
    /** ENS name if resolved */
    ensName: string | null;
    linkedAt: Date | null;
}

export interface EthASNStats {
    totalPayments: number;
    totalPaymentVolume: string;
    totalBountiesCompleted: number;
    totalBountiesPosted: number;
    totalStaked: string;
    totalRewardsEarned: string;
    totalSwaps: number;
    totalContractsDeployed: number;
    totalGovernanceVotes: number;
    totalPublicGoodsContributions: number;
    /** ERC-8004 specific */
    totalTrustGatedDelegations: number;
    totalValidationsReceived: number;
    totalValidationsGiven: number;
    totalAutonomousExecutions: number;
    achievementCount: number;
    /** Timestamp of first Ethereum activity */
    firstActivityAt: Date | null;
    /** Timestamp of last Ethereum activity */
    lastActivityAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Reputation Events
// ═══════════════════════════════════════════════════════════════

export type EthReputationEventType =
    | "payment_sent"
    | "payment_received"
    | "bounty_completed"
    | "bounty_posted"
    | "stake_deposited"
    | "contract_deployed"
    | "governance_vote"
    | "public_goods_contribution"
    | "erc8004_registered"
    | "erc8004_reputation_updated"
    | "erc8004_validation_received"
    | "erc8004_trust_gated_delegation"
    | "autonomous_execution_complete"
    | "cross_chain_sync"
    | "penalty_dispute"
    | "penalty_timeout";

export interface EthReputationEvent {
    id: string;
    orgId: string;
    agentId: string;
    asn: string;
    event: EthReputationEventType;
    creditDelta: number;
    trustDelta: number;
    newCreditScore: number;
    newTrustScore: number;
    tier: string;
    reason: string;
    /** Related tx hash */
    txHash: string | null;
    /** Related ERC-8004 tokenId */
    erc8004TokenId: string | null;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Tier Calculation
// ═══════════════════════════════════════════════════════════════

const TIERS = [
    { name: "Diamond", minCredit: 850, minTrust: 90 },
    { name: "Platinum", minCredit: 780, minTrust: 75 },
    { name: "Gold", minCredit: 700, minTrust: 60 },
    { name: "Silver", minCredit: 600, minTrust: 40 },
    { name: "Bronze", minCredit: 0, minTrust: 0 },
];

export function calculateTier(creditScore: number, trustScore: number): string {
    for (const t of TIERS) {
        if (creditScore >= t.minCredit && trustScore >= t.minTrust) return t.name;
    }
    return "Bronze";
}

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD — ethASNRecords collection
// ═══════════════════════════════════════════════════════════════

const COL = "ethASNRecords";

function defaultStats(): EthASNStats {
    return {
        totalPayments: 0,
        totalPaymentVolume: "0",
        totalBountiesCompleted: 0,
        totalBountiesPosted: 0,
        totalStaked: "0",
        totalRewardsEarned: "0",
        totalSwaps: 0,
        totalContractsDeployed: 0,
        totalGovernanceVotes: 0,
        totalPublicGoodsContributions: 0,
        totalTrustGatedDelegations: 0,
        totalValidationsReceived: 0,
        totalValidationsGiven: 0,
        totalAutonomousExecutions: 0,
        achievementCount: 0,
        firstActivityAt: null,
        lastActivityAt: null,
    };
}

export async function ensureEthASNRecord(
    asn: string,
    orgId: string,
    agentId: string,
): Promise<EthASNRecord> {
    const ref = doc(db, COL, asn);
    const snap = await getDoc(ref);
    if (snap.exists()) return docToRecord(snap.id, snap.data() as Record<string, unknown>);

    const record: Omit<EthASNRecord, "createdAt" | "updatedAt"> = {
        asn,
        orgId,
        agentId,
        ethAddresses: [],
        creditScore: 680,
        trustScore: 50,
        tier: "Bronze",
        stats: defaultStats(),
        erc8004Identity: null,
        erc8004Reputation: null,
        erc8004Validations: [],
        manifestCid: null,
        ethOnChainRegistered: false,
        ethRegistrationTxHash: null,
        hederaTxHash: null,
        crossChainSynced: false,
        lastSyncedAt: null,
    };

    await setDoc(ref, { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { ...record, createdAt: new Date(), updatedAt: new Date() };
}

export async function getEthASNRecord(asn: string): Promise<EthASNRecord | null> {
    const snap = await getDoc(doc(db, COL, asn));
    if (!snap.exists()) return null;
    return docToRecord(snap.id, snap.data() as Record<string, unknown>);
}

export async function getEthASNRecordsByOrg(orgId: string): Promise<EthASNRecord[]> {
    const q = query(collection(db, COL), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs
        .map((d) => docToRecord(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export async function linkEthWallet(
    asn: string,
    address: string,
    network: "mainnet" | "sepolia" = "sepolia",
    isPrimary = false,
    ensName: string | null = null,
): Promise<void> {
    const record = await getEthASNRecord(asn);
    if (!record) throw new Error(`ASN ${asn} not found`);

    const existing = record.ethAddresses.filter(
        (w) => !(w.address.toLowerCase() === address.toLowerCase() && w.network === network),
    );

    if (isPrimary) {
        for (const w of existing) w.isPrimary = false;
    }

    existing.push({ address, network, isPrimary, ensName, linkedAt: new Date() });
    await updateDoc(doc(db, COL, asn), { ethAddresses: existing, updatedAt: serverTimestamp() });
}

export async function markEthOnChainRegistered(
    asn: string,
    txHash: string,
): Promise<void> {
    await updateDoc(doc(db, COL, asn), {
        ethOnChainRegistered: true,
        ethRegistrationTxHash: txHash,
        updatedAt: serverTimestamp(),
    });
}

// ═══════════════════════════════════════════════════════════════
// ERC-8004 Identity CRUD
// ═══════════════════════════════════════════════════════════════

export async function registerERC8004Identity(
    asn: string,
    identity: ERC8004Identity,
): Promise<void> {
    await updateDoc(doc(db, COL, asn), {
        erc8004Identity: identity,
        ethOnChainRegistered: true,
        ethRegistrationTxHash: identity.registrationTxHash,
        updatedAt: serverTimestamp(),
    });
}

export async function updateERC8004Reputation(
    asn: string,
    reputation: ERC8004Reputation,
): Promise<void> {
    await updateDoc(doc(db, COL, asn), {
        erc8004Reputation: reputation,
        updatedAt: serverTimestamp(),
    });
}

export async function addERC8004Validation(
    asn: string,
    validation: ERC8004Validation,
): Promise<void> {
    const record = await getEthASNRecord(asn);
    if (!record) throw new Error(`ASN ${asn} not found`);

    const validations = [...record.erc8004Validations, validation];
    await updateDoc(doc(db, COL, asn), {
        erc8004Validations: validations,
        "stats.totalValidationsReceived": (record.stats.totalValidationsReceived || 0) + 1,
        updatedAt: serverTimestamp(),
    });
}

export async function updateManifestCid(
    asn: string,
    cid: string,
): Promise<void> {
    await updateDoc(doc(db, COL, asn), {
        manifestCid: cid,
        updatedAt: serverTimestamp(),
    });
}

// ═══════════════════════════════════════════════════════════════
// Reputation Events CRUD
// ═══════════════════════════════════════════════════════════════

export async function recordReputationEvent(
    input: Omit<EthReputationEvent, "id" | "createdAt">,
): Promise<string> {
    const ref = await import("firebase/firestore").then(({ addDoc }) =>
        addDoc(collection(db, "ethReputationEvents"), {
            ...input,
            createdAt: serverTimestamp(),
        }),
    );

    // Update ASN record scores
    await updateDoc(doc(db, COL, input.asn), {
        creditScore: input.newCreditScore,
        trustScore: input.newTrustScore,
        tier: input.tier,
        updatedAt: serverTimestamp(),
    });

    return ref.id;
}

export async function getReputationEvents(
    orgId: string,
    asn?: string,
    limit = 50,
): Promise<EthReputationEvent[]> {
    const constraints = [
        where("orgId", "==", orgId),
        ...(asn ? [where("asn", "==", asn)] : []),
    ];
    const q = query(collection(db, "ethReputationEvents"), ...constraints);
    const snap = await getDocs(q);
    return snap.docs
        .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
                id: d.id,
                orgId: data.orgId as string,
                agentId: data.agentId as string,
                asn: data.asn as string,
                event: data.event as EthReputationEventType,
                creditDelta: (data.creditDelta as number) || 0,
                trustDelta: (data.trustDelta as number) || 0,
                newCreditScore: (data.newCreditScore as number) || 680,
                newTrustScore: (data.newTrustScore as number) || 50,
                tier: (data.tier as string) || "Bronze",
                reason: (data.reason as string) || "",
                txHash: (data.txHash as string) || null,
                erc8004TokenId: (data.erc8004TokenId as string) || null,
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            };
        })
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
        .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════
// Agent Wallets — secp256k1 keypair generation
// ═══════════════════════════════════════════════════════════════

export interface EthAgentWallet {
    id: string;
    orgId: string;
    agentId: string | null;
    address: string;
    network: "mainnet" | "sepolia";
    label: string;
    /** ENS name if set */
    ensName: string | null;
    /** ERC-8004 tokenId if registered */
    erc8004TokenId: string | null;
    createdBy: string;
    createdAt: Date | null;
}

export async function createEthAgentWallet(
    input: Omit<EthAgentWallet, "id" | "createdAt">,
): Promise<{ wallet: EthAgentWallet; privateKeyHex: string }> {
    // Generate a random 32-byte private key
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const privateKeyHex = Array.from(keyBytes, (b) => b.toString(16).padStart(2, "0")).join("");

    // Derive address placeholder — in production, use ethers/viem to derive
    const addressPlaceholder = "0x" + privateKeyHex.slice(0, 40);

    const ref = await import("firebase/firestore").then(({ addDoc }) =>
        addDoc(collection(db, "ethAgentWallets"), {
            ...input,
            address: addressPlaceholder,
            createdAt: serverTimestamp(),
        }),
    );

    const wallet: EthAgentWallet = {
        ...input,
        id: ref.id,
        address: addressPlaceholder,
        createdAt: new Date(),
    };

    return { wallet, privateKeyHex };
}

export async function getEthAgentWallets(orgId: string): Promise<EthAgentWallet[]> {
    const q = query(collection(db, "ethAgentWallets"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs
        .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
                id: d.id,
                orgId: data.orgId as string,
                agentId: (data.agentId as string) || null,
                address: (data.address as string) || "",
                network: (data.network as "mainnet" | "sepolia") || "sepolia",
                label: (data.label as string) || "",
                ensName: (data.ensName as string) || null,
                erc8004TokenId: (data.erc8004TokenId as string) || null,
                createdBy: (data.createdBy as string) || "",
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            };
        })
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToRecord(id: string, d: Record<string, unknown>): EthASNRecord {
    return {
        asn: id,
        orgId: (d.orgId as string) || "",
        agentId: (d.agentId as string) || "",
        ethAddresses: (d.ethAddresses as EthASNWallet[]) || [],
        creditScore: (d.creditScore as number) || 680,
        trustScore: (d.trustScore as number) || 50,
        tier: (d.tier as string) || "Bronze",
        stats: (d.stats as EthASNStats) || defaultStats(),
        erc8004Identity: (d.erc8004Identity as ERC8004Identity) || null,
        erc8004Reputation: (d.erc8004Reputation as ERC8004Reputation) || null,
        erc8004Validations: (d.erc8004Validations as ERC8004Validation[]) || [],
        manifestCid: (d.manifestCid as string) || null,
        ethOnChainRegistered: (d.ethOnChainRegistered as boolean) || false,
        ethRegistrationTxHash: (d.ethRegistrationTxHash as string) || null,
        hederaTxHash: (d.hederaTxHash as string) || null,
        crossChainSynced: (d.crossChainSynced as boolean) || false,
        lastSyncedAt: d.lastSyncedAt instanceof Timestamp ? d.lastSyncedAt.toDate() : null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
    };
}
