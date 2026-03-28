/**
 * TON Bounty System
 *
 * Off-chain (Firestore) task bounty board with TON/Jetton escrow.
 * Flow: post → claim → submit → approve/reject → release/cancel
 * On release: platform fee deducted, net amount sent to claimer.
 */

import {
    collection,
    doc,
    addDoc,
    setDoc,
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
import { nanoToTon } from "./ton-policy";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type BountyStatus =
    | "open"
    | "claimed"
    | "submitted"
    | "approved"
    | "rejected"
    | "released"
    | "cancelled";

export interface TonBounty {
    id: string;
    orgId: string;
    /** Title / short description of the task */
    title: string;
    description: string;
    /** nanoTON or Jetton raw amount */
    amountNano: string;
    /** "TON" or Jetton contract address */
    token: string;
    tokenSymbol: string;
    /** Wallet that funded the bounty */
    funderAddress: string;
    /** Wallet that claimed the bounty (set on claim) */
    claimerAddress: string | null;
    /** Agent ID (optional) */
    claimerAgentId: string | null;
    status: BountyStatus;
    /** Delivery proof — URL, IPFS CID, or text */
    deliveryProof: string | null;
    /** On-chain tx hash of the release payment */
    releaseTxHash: string | null;
    /** Platform fee deducted on release (nanoTON) */
    feeNano: string | null;
    /** Net amount after fee (nanoTON) */
    netAmountNano: string | null;
    /** Optional deadline */
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

export async function createBounty(
    input: Omit<TonBounty, "id" | "claimerAddress" | "claimerAgentId" | "deliveryProof" | "releaseTxHash" | "feeNano" | "netAmountNano" | "createdAt" | "claimedAt" | "submittedAt" | "resolvedAt">,
): Promise<TonBounty> {
    const ref = await addDoc(collection(db, "tonBounties"), {
        ...input,
        claimerAddress: null,
        claimerAgentId: null,
        deliveryProof: null,
        releaseTxHash: null,
        feeNano: null,
        netAmountNano: null,
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
        feeNano: null,
        netAmountNano: null,
        createdAt: new Date(),
        claimedAt: null,
        submittedAt: null,
        resolvedAt: null,
    };
}

export async function getBounties(
    orgId: string,
    limit = 50,
    cursor?: string,
): Promise<{ bounties: TonBounty[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "tonBounties", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "tonBounties"), ...constraints));
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit);
    return {
        bounties: docs.map((d) => docToBounty(d.id, d.data() as Record<string, unknown>)),
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
}

export async function claimBounty(
    id: string,
    claimerAddress: string,
    claimerAgentId: string | null,
): Promise<void> {
    await updateDoc(doc(db, "tonBounties", id), {
        status: "claimed",
        claimerAddress,
        claimerAgentId,
        claimedAt: serverTimestamp(),
    });
}

export async function submitBounty(
    id: string,
    deliveryProof: string,
): Promise<void> {
    await updateDoc(doc(db, "tonBounties", id), {
        status: "submitted",
        deliveryProof,
        submittedAt: serverTimestamp(),
    });
}

export async function resolveBounty(
    id: string,
    resolution: "approved" | "rejected",
    opts?: { releaseTxHash?: string; feeNano?: string; netAmountNano?: string },
): Promise<void> {
    await updateDoc(doc(db, "tonBounties", id), {
        status: resolution === "approved" ? "released" : "rejected",
        releaseTxHash: opts?.releaseTxHash || null,
        feeNano: opts?.feeNano || null,
        netAmountNano: opts?.netAmountNano || null,
        resolvedAt: serverTimestamp(),
    });
}

export async function cancelBounty(id: string): Promise<void> {
    await updateDoc(doc(db, "tonBounties", id), {
        status: "cancelled",
        resolvedAt: serverTimestamp(),
    });
}

/**
 * Cancel all open/claimed bounties whose deadline has passed.
 * Call from a scheduled cron job or the /api/v1/ton/bounties/expire endpoint.
 * Returns the number of bounties expired.
 */
export async function expireOverdueBounties(orgId: string): Promise<number> {
    const now = Timestamp.fromDate(new Date());
    // Composite index required: tonBounties(orgId ASC, status ASC, deadline ASC)
    const q = query(
        collection(db, "tonBounties"),
        where("orgId", "==", orgId),
        where("status", "in", ["open", "claimed"]),
        where("deadline", "<=", now),
    );
    const snap = await getDocs(q);
    // Filter out docs with null deadline (where clause matches null in some SDK versions)
    const overdue = snap.docs.filter((d) => d.data().deadline !== null);
    await Promise.all(
        overdue.map((d) =>
            updateDoc(doc(db, "tonBounties", d.id), {
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

export interface FeeCalculation {
    grossNano: string;
    feeNano: string;
    netNano: string;
    feePercent: number;
}

/** Calculate platform fee on a bounty payout. feeBps = basis points (e.g. 200 = 2%) */
export function calculateBountyFee(amountNano: string, feeBps: number): FeeCalculation {
    const gross = BigInt(amountNano);
    // Ceiling division — platform never rounds down on small bounties
    const fee = (gross * BigInt(feeBps) + 9999n) / 10000n;
    const net = gross - fee;
    return {
        grossNano: gross.toString(),
        feeNano: fee.toString(),
        netNano: net.toString(),
        feePercent: feeBps / 100,
    };
}

// ═══════════════════════════════════════════════════════════════
// Fee config CRUD
// ═══════════════════════════════════════════════════════════════

export interface TonFeeConfig {
    id: string | null;
    orgId: string;
    /** Basis points (100 = 1%, 200 = 2%, 300 = 3%) */
    feeBps: number;
    /** TON address where fees are sent */
    feeRecipientAddress: string;
    /** Min bounty amount before fee applies (nanoTON) */
    minFeeBountyNano: string;
    enabled: boolean;
    updatedBy: string;
    updatedAt: Date | null;
}

export async function getTonFeeConfig(orgId: string): Promise<TonFeeConfig | null> {
    // Document key = orgId (deterministic) — prevents duplicate fee config documents
    const snap = await getDoc(doc(db, "tonFeeConfigs", orgId));
    if (!snap.exists()) return null;
    return docToFeeConfig(snap.id, snap.data() as Record<string, unknown>);
}

export async function upsertTonFeeConfig(
    orgId: string,
    input: Omit<TonFeeConfig, "id" | "orgId" | "updatedAt">,
): Promise<TonFeeConfig> {
    // Use orgId as doc ID — atomic upsert, no race condition
    const ref = doc(db, "tonFeeConfigs", orgId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        await updateDoc(ref, { ...input, updatedAt: serverTimestamp() });
        return { ...docToFeeConfig(snap.id, snap.data() as Record<string, unknown>), ...input, updatedAt: new Date() };
    }

    await setDoc(ref, { orgId, ...input, updatedAt: serverTimestamp() });
    return { id: orgId, orgId, ...input, updatedAt: new Date() };
}

// ═══════════════════════════════════════════════════════════════
// Analytics helpers
// ═══════════════════════════════════════════════════════════════

export interface BountyStats {
    total: number;
    open: number;
    claimed: number;
    released: number;
    cancelled: number;
    totalPayoutTon: string;
    totalFeeTon: string;
}

export function computeBountyStats(bounties: TonBounty[]): BountyStats {
    const released = bounties.filter((b) => b.status === "released");
    const totalPayout = released.reduce((s, b) => s + BigInt(b.netAmountNano || b.amountNano), 0n);
    const totalFee = released.reduce((s, b) => s + BigInt(b.feeNano || "0"), 0n);

    return {
        total: bounties.length,
        open: bounties.filter((b) => b.status === "open").length,
        claimed: bounties.filter((b) => b.status === "claimed" || b.status === "submitted").length,
        released: released.length,
        cancelled: bounties.filter((b) => b.status === "cancelled").length,
        totalPayoutTon: nanoToTon(totalPayout.toString()),
        totalFeeTon: nanoToTon(totalFee.toString()),
    };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToBounty(id: string, d: Record<string, unknown>): TonBounty {
    return {
        id,
        orgId: d.orgId as string,
        title: (d.title as string) || "",
        description: (d.description as string) || "",
        amountNano: (d.amountNano as string) || "0",
        token: (d.token as string) || "TON",
        tokenSymbol: (d.tokenSymbol as string) || "TON",
        funderAddress: (d.funderAddress as string) || "",
        claimerAddress: (d.claimerAddress as string) || null,
        claimerAgentId: (d.claimerAgentId as string) || null,
        status: (d.status as BountyStatus) || "open",
        deliveryProof: (d.deliveryProof as string) || null,
        releaseTxHash: (d.releaseTxHash as string) || null,
        feeNano: (d.feeNano as string) || null,
        netAmountNano: (d.netAmountNano as string) || null,
        deadline: d.deadline instanceof Timestamp ? d.deadline.toDate() : null,
        tags: (d.tags as string[]) || [],
        postedBy: (d.postedBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        claimedAt: d.claimedAt instanceof Timestamp ? d.claimedAt.toDate() : null,
        submittedAt: d.submittedAt instanceof Timestamp ? d.submittedAt.toDate() : null,
        resolvedAt: d.resolvedAt instanceof Timestamp ? d.resolvedAt.toDate() : null,
    };
}

function docToFeeConfig(id: string, d: Record<string, unknown>): TonFeeConfig {
    return {
        id: id || null,
        orgId: d.orgId as string,
        feeBps: (d.feeBps as number) || 200,
        feeRecipientAddress: (d.feeRecipientAddress as string) || "",
        minFeeBountyNano: (d.minFeeBountyNano as string) || "1000000000",
        enabled: (d.enabled as boolean) ?? true,
        updatedBy: (d.updatedBy as string) || "",
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
    };
}

/** Default 2% fee config */
export const DEFAULT_FEE_CONFIG: Omit<TonFeeConfig, "id" | "orgId" | "updatedAt"> = {
    feeBps: 200,
    feeRecipientAddress: "",
    minFeeBountyNano: "1000000000", // 1 TON minimum before fee applies
    enabled: true,
    updatedBy: "system",
};
