/**
 * ETH Foundation Bounty System
 *
 * Off-chain (Firestore) task bounty board with ETH token escrow.
 * Flow: post → claim → submit → approve/reject → release/cancel
 * On release: platform fee deducted, net amount sent to claimer.
 *
 * Aligned with Ethereum Foundation ESP public goods priorities.
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
import { weiToEth } from "./eth-foundation-policy";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type EthBountyStatus =
    | "open"
    | "claimed"
    | "submitted"
    | "approved"
    | "rejected"
    | "released"
    | "cancelled";

export type EthBountyCategory =
    | "public-goods"
    | "tooling"
    | "research"
    | "community"
    | "governance"
    | "infrastructure"
    | "education"
    | "general";

export interface EthBounty {
    id: string;
    orgId: string;
    title: string;
    description: string;
    /** Amount in wei */
    amount: string;
    /** "ETH" or ERC-20 contract address */
    token: string;
    tokenSymbol: string;
    funderAddress: string;
    claimerAddress: string | null;
    claimerAgentId: string | null;
    status: EthBountyStatus;
    /** ESP category alignment */
    category: EthBountyCategory;
    deliveryProof: string | null;
    releaseTxHash: string | null;
    feeAmount: string | null;
    netAmount: string | null;
    deadline: Date | null;
    tags: string[];
    postedBy: string;
    createdAt: Date | null;
    claimedAt: Date | null;
    submittedAt: Date | null;
    resolvedAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

export async function createEthBounty(
    input: Omit<EthBounty, "id" | "claimerAddress" | "claimerAgentId" | "deliveryProof" | "releaseTxHash" | "feeAmount" | "netAmount" | "createdAt" | "claimedAt" | "submittedAt" | "resolvedAt">,
): Promise<EthBounty> {
    const ref = await addDoc(collection(db, "ethBounties"), {
        ...input,
        claimerAddress: null,
        claimerAgentId: null,
        deliveryProof: null,
        releaseTxHash: null,
        feeAmount: null,
        netAmount: null,
        createdAt: serverTimestamp(),
        claimedAt: null,
        submittedAt: null,
        resolvedAt: null,
    });
    return {
        ...input,
        id: ref.id,
        claimerAddress: null,
        claimerAgentId: null,
        deliveryProof: null,
        releaseTxHash: null,
        feeAmount: null,
        netAmount: null,
        createdAt: new Date(),
        claimedAt: null,
        submittedAt: null,
        resolvedAt: null,
    };
}

export async function getEthBounties(
    orgId: string,
    limit = 50,
    cursor?: string,
): Promise<{ bounties: EthBounty[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "ethBounties", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "ethBounties"), ...constraints));
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit);
    return {
        bounties: docs.map((d) => docToBounty(d.id, d.data() as Record<string, unknown>)),
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
}

export async function claimEthBounty(
    id: string,
    claimerAddress: string,
    claimerAgentId: string | null,
): Promise<void> {
    await updateDoc(doc(db, "ethBounties", id), {
        status: "claimed",
        claimerAddress,
        claimerAgentId,
        claimedAt: serverTimestamp(),
    });
}

export async function submitEthBounty(
    id: string,
    deliveryProof: string,
): Promise<void> {
    await updateDoc(doc(db, "ethBounties", id), {
        status: "submitted",
        deliveryProof,
        submittedAt: serverTimestamp(),
    });
}

export async function resolveEthBounty(
    id: string,
    resolution: "released" | "rejected",
    opts?: { releaseTxHash?: string; feeAmount?: string; netAmount?: string },
): Promise<void> {
    await updateDoc(doc(db, "ethBounties", id), {
        status: resolution,
        releaseTxHash: opts?.releaseTxHash || null,
        feeAmount: opts?.feeAmount || null,
        netAmount: opts?.netAmount || null,
        resolvedAt: serverTimestamp(),
    });
}

export async function cancelEthBounty(id: string): Promise<void> {
    await updateDoc(doc(db, "ethBounties", id), {
        status: "cancelled",
        resolvedAt: serverTimestamp(),
    });
}

export async function expireOverdueEthBounties(orgId: string): Promise<number> {
    const now = Timestamp.fromDate(new Date());
    const q = query(
        collection(db, "ethBounties"),
        where("orgId", "==", orgId),
        where("status", "in", ["open", "claimed"]),
        where("deadline", "<=", now),
    );
    const snap = await getDocs(q);
    const overdue = snap.docs.filter((d) => d.data().deadline !== null);
    await Promise.all(
        overdue.map((d) =>
            updateDoc(doc(db, "ethBounties", d.id), {
                status: "cancelled",
                resolvedAt: serverTimestamp(),
            }),
        ),
    );
    return overdue.length;
}

// ═══════════════════════════════════════════════════════════════
// Fee calculation
// ═══════════════════════════════════════════════════════════════

export interface EthFeeCalculation {
    gross: string;
    fee: string;
    net: string;
    feePercent: number;
}

export function calculateEthBountyFee(amount: string, feeBps: number): EthFeeCalculation {
    const gross = BigInt(amount);
    const fee = (gross * BigInt(feeBps) + 9999n) / 10000n;
    const net = gross - fee;
    return {
        gross: gross.toString(),
        fee: fee.toString(),
        net: net.toString(),
        feePercent: feeBps / 100,
    };
}

// ═══════════════════════════════════════════════════════════════
// Fee config CRUD
// ═══════════════════════════════════════════════════════════════

export interface EthFeeConfig {
    id: string | null;
    orgId: string;
    feeBps: number;
    feeRecipientAddress: string;
    minFeeBounty: string;
    enabled: boolean;
    updatedBy: string;
    updatedAt: Date | null;
}

export async function getEthFeeConfig(orgId: string): Promise<EthFeeConfig | null> {
    const snap = await getDoc(doc(db, "ethFeeConfigs", orgId));
    if (!snap.exists()) return null;
    return docToFeeConfig(snap.id, snap.data() as Record<string, unknown>);
}

export async function upsertEthFeeConfig(
    orgId: string,
    input: Omit<EthFeeConfig, "id" | "orgId" | "updatedAt">,
): Promise<EthFeeConfig> {
    const ref = doc(db, "ethFeeConfigs", orgId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        await updateDoc(ref, { ...input, updatedAt: serverTimestamp() });
        return { ...docToFeeConfig(snap.id, snap.data() as Record<string, unknown>), ...input, updatedAt: new Date() };
    }

    await import("firebase/firestore").then(({ setDoc }) => setDoc(ref, { orgId, ...input, updatedAt: serverTimestamp() }));
    return { id: orgId, orgId, ...input, updatedAt: new Date() };
}

// ═══════════════════════════════════════════════════════════════
// Analytics helpers
// ═══════════════════════════════════════════════════════════════

export interface EthBountyStats {
    total: number;
    open: number;
    claimed: number;
    released: number;
    cancelled: number;
    totalPayoutEth: string;
    totalFeeEth: string;
    byCategory: Record<EthBountyCategory, number>;
}

export function computeEthBountyStats(bounties: EthBounty[]): EthBountyStats {
    const released = bounties.filter((b) => b.status === "released");
    const totalPayout = released.reduce((s, b) => s + BigInt(b.netAmount || b.amount), 0n);
    const totalFee = released.reduce((s, b) => s + BigInt(b.feeAmount || "0"), 0n);

    const byCategory: Record<EthBountyCategory, number> = {
        "public-goods": 0, tooling: 0, research: 0, community: 0,
        governance: 0, infrastructure: 0, education: 0, general: 0,
    };
    for (const b of bounties) {
        byCategory[b.category] = (byCategory[b.category] || 0) + 1;
    }

    return {
        total: bounties.length,
        open: bounties.filter((b) => b.status === "open").length,
        claimed: bounties.filter((b) => b.status === "claimed" || b.status === "submitted").length,
        released: released.length,
        cancelled: bounties.filter((b) => b.status === "cancelled").length,
        totalPayoutEth: weiToEth(totalPayout.toString()),
        totalFeeEth: weiToEth(totalFee.toString()),
        byCategory,
    };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToBounty(id: string, d: Record<string, unknown>): EthBounty {
    return {
        id,
        orgId: d.orgId as string,
        title: (d.title as string) || "",
        description: (d.description as string) || "",
        amount: (d.amount as string) || "0",
        token: (d.token as string) || "ETH",
        tokenSymbol: (d.tokenSymbol as string) || "ETH",
        funderAddress: (d.funderAddress as string) || "",
        claimerAddress: (d.claimerAddress as string) || null,
        claimerAgentId: (d.claimerAgentId as string) || null,
        status: (d.status as EthBountyStatus) || "open",
        category: (d.category as EthBountyCategory) || "general",
        deliveryProof: (d.deliveryProof as string) || null,
        releaseTxHash: (d.releaseTxHash as string) || null,
        feeAmount: (d.feeAmount as string) || null,
        netAmount: (d.netAmount as string) || null,
        deadline: d.deadline instanceof Timestamp ? d.deadline.toDate() : null,
        tags: (d.tags as string[]) || [],
        postedBy: (d.postedBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        claimedAt: d.claimedAt instanceof Timestamp ? d.claimedAt.toDate() : null,
        submittedAt: d.submittedAt instanceof Timestamp ? d.submittedAt.toDate() : null,
        resolvedAt: d.resolvedAt instanceof Timestamp ? d.resolvedAt.toDate() : null,
    };
}

function docToFeeConfig(id: string, d: Record<string, unknown>): EthFeeConfig {
    return {
        id: id || null,
        orgId: d.orgId as string,
        feeBps: (d.feeBps as number) || 200,
        feeRecipientAddress: (d.feeRecipientAddress as string) || "",
        minFeeBounty: (d.minFeeBounty as string) || "100000000000000000",
        enabled: (d.enabled as boolean) ?? true,
        updatedBy: (d.updatedBy as string) || "",
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
    };
}

export const DEFAULT_ETH_FEE_CONFIG: Omit<EthFeeConfig, "id" | "orgId" | "updatedAt"> = {
    feeBps: 200,
    feeRecipientAddress: "",
    minFeeBounty: "100000000000000000", // 0.1 ETH minimum before fee applies
    enabled: true,
    updatedBy: "system",
};
