/**
 * Flow × ASN Integration
 *
 * Links Agent Social Numbers (ASN-SWM-YYYY-HHHH-HHHH-CC) to Flow blockchain.
 * Stores Flow-specific ASN data: wallet addresses, reputation history,
 * staking positions, achievement badges, and cross-chain verification status.
 *
 * Each agent with an ASN can have:
 *   - Flow wallet(s) linked to their ASN
 *   - On-chain reputation score synced from Hedera → Flow
 *   - Achievement NFTs minted on Flow
 *   - Cross-chain CID verification records
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
// Types
// ═══════════════════════════════════════════════════════════════

export interface FlowASNRecord {
    /** Document ID = ASN string */
    asn: string;
    orgId: string;
    agentId: string;
    /** Flow wallet address(es) linked to this ASN */
    flowAddresses: FlowASNWallet[];
    /** Current credit score (300-900) */
    creditScore: number;
    /** Current trust score (0-100) */
    trustScore: number;
    /** Reputation tier name */
    tier: string;
    /** Flow-specific stats */
    stats: FlowASNStats;
    /** Whether ASN is registered on Flow chain */
    flowOnChainRegistered: boolean;
    /** Flow tx hash of on-chain registration */
    flowRegistrationTxHash: string | null;
    /** Hedera tx hash (from original ASN registration) */
    hederaTxHash: string | null;
    /** Cross-chain sync status */
    crossChainSynced: boolean;
    lastSyncedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface FlowASNWallet {
    address: string;
    network: "mainnet" | "testnet";
    isPrimary: boolean;
    linkedAt: Date | null;
}

export interface FlowASNStats {
    totalPayments: number;
    totalPaymentVolume: string;
    totalBountiesCompleted: number;
    totalBountiesPosted: number;
    totalStaked: string;
    totalRewardsEarned: string;
    totalSwaps: number;
    totalContractsDeployed: number;
    totalCidVerifications: number;
    totalBridgeTransactions: number;
    achievementCount: number;
    /** Timestamp of first Flow activity */
    firstActivityAt: Date | null;
    /** Timestamp of last Flow activity */
    lastActivityAt: Date | null;
}

const DEFAULT_STATS: FlowASNStats = {
    totalPayments: 0,
    totalPaymentVolume: "0",
    totalBountiesCompleted: 0,
    totalBountiesPosted: 0,
    totalStaked: "0",
    totalRewardsEarned: "0",
    totalSwaps: 0,
    totalContractsDeployed: 0,
    totalCidVerifications: 0,
    totalBridgeTransactions: 0,
    achievementCount: 0,
    firstActivityAt: null,
    lastActivityAt: null,
};

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

/** Create or get a Flow ASN record. Uses ASN as document ID for deterministic access. */
export async function ensureFlowASNRecord(
    asn: string,
    orgId: string,
    agentId: string,
): Promise<FlowASNRecord> {
    const ref = doc(db, "flowASNRecords", asn);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        return docToFlowASN(snap.data());
    }

    const record: Omit<FlowASNRecord, "createdAt" | "updatedAt"> = {
        asn,
        orgId,
        agentId,
        flowAddresses: [],
        creditScore: 680,
        trustScore: 50,
        tier: "Silver",
        stats: DEFAULT_STATS,
        flowOnChainRegistered: false,
        flowRegistrationTxHash: null,
        hederaTxHash: null,
        crossChainSynced: false,
        lastSyncedAt: null,
    };

    await setDoc(ref, {
        ...record,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return { ...record, createdAt: new Date(), updatedAt: new Date() };
}

export async function getFlowASNRecord(asn: string): Promise<FlowASNRecord | null> {
    const snap = await getDoc(doc(db, "flowASNRecords", asn));
    if (!snap.exists()) return null;
    return docToFlowASN(snap.data());
}

export async function getFlowASNRecordsByOrg(orgId: string): Promise<FlowASNRecord[]> {
    const q = query(collection(db, "flowASNRecords"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToFlowASN(d.data()));
}

/** Link a Flow wallet address to an ASN */
export async function linkFlowWallet(
    asn: string,
    address: string,
    network: "mainnet" | "testnet",
    isPrimary = false,
): Promise<void> {
    const record = await getFlowASNRecord(asn);
    if (!record) return;

    const existing = record.flowAddresses.find((w) => w.address === address);
    if (existing) return;

    const updated = [...record.flowAddresses];
    if (isPrimary) {
        updated.forEach((w) => { w.isPrimary = false; });
    }
    updated.push({ address, network, isPrimary, linkedAt: new Date() });

    await updateDoc(doc(db, "flowASNRecords", asn), {
        flowAddresses: updated,
        updatedAt: serverTimestamp(),
    });
}

/** Update Flow ASN stats (increment counters) */
export async function incrementFlowASNStat(
    asn: string,
    stat: keyof FlowASNStats,
    delta: number | string = 1,
): Promise<void> {
    const record = await getFlowASNRecord(asn);
    if (!record) return;

    const stats = { ...record.stats };
    const now = new Date();
    if (!stats.firstActivityAt) stats.firstActivityAt = now;
    stats.lastActivityAt = now;

    if (typeof delta === "number") {
        (stats as unknown as Record<string, unknown>)[stat] = ((stats as unknown as Record<string, number>)[stat] || 0) + delta;
    } else {
        // String amounts (BigInt-safe addition)
        const current = BigInt((stats as unknown as Record<string, string>)[stat] || "0");
        (stats as unknown as Record<string, unknown>)[stat] = (current + BigInt(delta)).toString();
    }

    await updateDoc(doc(db, "flowASNRecords", asn), {
        stats,
        updatedAt: serverTimestamp(),
    });
}

/** Update credit/trust scores on the Flow ASN record */
export async function updateFlowASNScores(
    asn: string,
    creditScore: number,
    trustScore: number,
    tier: string,
): Promise<void> {
    await updateDoc(doc(db, "flowASNRecords", asn), {
        creditScore: Math.max(300, Math.min(900, creditScore)),
        trustScore: Math.max(0, Math.min(100, trustScore)),
        tier,
        updatedAt: serverTimestamp(),
    });
}

/** Mark ASN as registered on Flow chain */
export async function markFlowOnChainRegistered(
    asn: string,
    txHash: string,
): Promise<void> {
    await updateDoc(doc(db, "flowASNRecords", asn), {
        flowOnChainRegistered: true,
        flowRegistrationTxHash: txHash,
        updatedAt: serverTimestamp(),
    });
}

/** Sync cross-chain state (Hedera ↔ Flow) */
export async function markCrossChainSynced(asn: string): Promise<void> {
    await updateDoc(doc(db, "flowASNRecords", asn), {
        crossChainSynced: true,
        lastSyncedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToFlowASN(d: Record<string, unknown>): FlowASNRecord {
    const stats = (d.stats as FlowASNStats) || DEFAULT_STATS;
    return {
        asn: (d.asn as string) || "",
        orgId: (d.orgId as string) || "",
        agentId: (d.agentId as string) || "",
        flowAddresses: (d.flowAddresses as FlowASNWallet[]) || [],
        creditScore: (d.creditScore as number) || 680,
        trustScore: (d.trustScore as number) || 50,
        tier: (d.tier as string) || "Silver",
        stats: {
            ...DEFAULT_STATS,
            ...stats,
            firstActivityAt: stats.firstActivityAt instanceof Timestamp ? (stats.firstActivityAt as unknown as Timestamp).toDate() : stats.firstActivityAt || null,
            lastActivityAt: stats.lastActivityAt instanceof Timestamp ? (stats.lastActivityAt as unknown as Timestamp).toDate() : stats.lastActivityAt || null,
        },
        flowOnChainRegistered: (d.flowOnChainRegistered as boolean) || false,
        flowRegistrationTxHash: (d.flowRegistrationTxHash as string) || null,
        hederaTxHash: (d.hederaTxHash as string) || null,
        crossChainSynced: (d.crossChainSynced as boolean) || false,
        lastSyncedAt: d.lastSyncedAt instanceof Timestamp ? d.lastSyncedAt.toDate() : null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
    };
}
