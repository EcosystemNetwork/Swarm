/**
 * Flow Bounty System
 *
 * Off-chain (Firestore) task bounty board with FLOW token escrow.
 * Flow: post → claim → submit → approve/reject → release/cancel
 * On release: platform fee deducted, net amount sent to claimer.
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
import { miniFlowToFlow } from "./flow-policy";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type FlowBountyStatus =
    | "open"
    | "claimed"
    | "submitted"
    | "approved"
    | "rejected"
    | "released"
    | "cancelled";

export interface FlowBounty {
    id: string;
    orgId: string;
    title: string;
    description: string;
    /** Amount in mini-FLOW (8 decimals) */
    amount: string;
    /** "FLOW" or Fungible Token contract address */
    token: string;
    tokenSymbol: string;
    funderAddress: string;
    claimerAddress: string | null;
    claimerAgentId: string | null;
    status: FlowBountyStatus;
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

export async function createFlowBounty(
    input: Omit<FlowBounty, "id" | "claimerAddress" | "claimerAgentId" | "deliveryProof" | "releaseTxHash" | "feeAmount" | "netAmount" | "createdAt" | "claimedAt" | "submittedAt" | "resolvedAt">,
): Promise<FlowBounty> {
    const ref = await addDoc(collection(db, "flowBounties"), {
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

export async function getFlowBounties(
    orgId: string,
    limit = 50,
    cursor?: string,
): Promise<{ bounties: FlowBounty[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "flowBounties", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "flowBounties"), ...constraints));
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit);
    return {
        bounties: docs.map((d) => docToBounty(d.id, d.data() as Record<string, unknown>)),
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
}

export async function claimFlowBounty(
    id: string,
    claimerAddress: string,
    claimerAgentId: string | null,
): Promise<void> {
    await updateDoc(doc(db, "flowBounties", id), {
        status: "claimed",
        claimerAddress,
        claimerAgentId,
        claimedAt: serverTimestamp(),
    });
}

export async function submitFlowBounty(
    id: string,
    deliveryProof: string,
): Promise<void> {
    await updateDoc(doc(db, "flowBounties", id), {
        status: "submitted",
        deliveryProof,
        submittedAt: serverTimestamp(),
    });
}

export async function resolveFlowBounty(
    id: string,
    resolution: "released" | "rejected",
    opts?: { releaseTxHash?: string; feeAmount?: string; netAmount?: string },
): Promise<void> {
    await updateDoc(doc(db, "flowBounties", id), {
        status: resolution,
        releaseTxHash: opts?.releaseTxHash || null,
        feeAmount: opts?.feeAmount || null,
        netAmount: opts?.netAmount || null,
        resolvedAt: serverTimestamp(),
    });
}

export async function cancelFlowBounty(id: string): Promise<void> {
    await updateDoc(doc(db, "flowBounties", id), {
        status: "cancelled",
        resolvedAt: serverTimestamp(),
    });
}

export async function expireOverdueFlowBounties(orgId: string): Promise<number> {
    const now = Timestamp.fromDate(new Date());
    const q = query(
        collection(db, "flowBounties"),
        where("orgId", "==", orgId),
        where("status", "in", ["open", "claimed"]),
        where("deadline", "<=", now),
    );
    const snap = await getDocs(q);
    const overdue = snap.docs.filter((d) => d.data().deadline !== null);
    await Promise.all(
        overdue.map((d) =>
            updateDoc(doc(db, "flowBounties", d.id), {
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

export interface FlowFeeCalculation {
    gross: string;
    fee: string;
    net: string;
    feePercent: number;
}

export function calculateFlowBountyFee(amount: string, feeBps: number): FlowFeeCalculation {
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

export interface FlowFeeConfig {
    id: string | null;
    orgId: string;
    feeBps: number;
    feeRecipientAddress: string;
    minFeeBounty: string;
    enabled: boolean;
    updatedBy: string;
    updatedAt: Date | null;
}

export async function getFlowFeeConfig(orgId: string): Promise<FlowFeeConfig | null> {
    const snap = await getDoc(doc(db, "flowFeeConfigs", orgId));
    if (!snap.exists()) return null;
    return docToFeeConfig(snap.id, snap.data() as Record<string, unknown>);
}

export async function upsertFlowFeeConfig(
    orgId: string,
    input: Omit<FlowFeeConfig, "id" | "orgId" | "updatedAt">,
): Promise<FlowFeeConfig> {
    const ref = doc(db, "flowFeeConfigs", orgId);
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

export interface FlowBountyStats {
    total: number;
    open: number;
    claimed: number;
    released: number;
    cancelled: number;
    totalPayoutFlow: string;
    totalFeeFlow: string;
}

export function computeFlowBountyStats(bounties: FlowBounty[]): FlowBountyStats {
    const released = bounties.filter((b) => b.status === "released");
    const totalPayout = released.reduce((s, b) => s + BigInt(b.netAmount || b.amount), 0n);
    const totalFee = released.reduce((s, b) => s + BigInt(b.feeAmount || "0"), 0n);

    return {
        total: bounties.length,
        open: bounties.filter((b) => b.status === "open").length,
        claimed: bounties.filter((b) => b.status === "claimed" || b.status === "submitted").length,
        released: released.length,
        cancelled: bounties.filter((b) => b.status === "cancelled").length,
        totalPayoutFlow: miniFlowToFlow(totalPayout.toString()),
        totalFeeFlow: miniFlowToFlow(totalFee.toString()),
    };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToBounty(id: string, d: Record<string, unknown>): FlowBounty {
    return {
        id,
        orgId: d.orgId as string,
        title: (d.title as string) || "",
        description: (d.description as string) || "",
        amount: (d.amount as string) || "0",
        token: (d.token as string) || "FLOW",
        tokenSymbol: (d.tokenSymbol as string) || "FLOW",
        funderAddress: (d.funderAddress as string) || "",
        claimerAddress: (d.claimerAddress as string) || null,
        claimerAgentId: (d.claimerAgentId as string) || null,
        status: (d.status as FlowBountyStatus) || "open",
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

function docToFeeConfig(id: string, d: Record<string, unknown>): FlowFeeConfig {
    return {
        id: id || null,
        orgId: d.orgId as string,
        feeBps: (d.feeBps as number) || 200,
        feeRecipientAddress: (d.feeRecipientAddress as string) || "",
        minFeeBounty: (d.minFeeBounty as string) || "100000000",
        enabled: (d.enabled as boolean) ?? true,
        updatedBy: (d.updatedBy as string) || "",
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
    };
}

export const DEFAULT_FLOW_FEE_CONFIG: Omit<FlowFeeConfig, "id" | "orgId" | "updatedAt"> = {
    feeBps: 200,
    feeRecipientAddress: "",
    minFeeBounty: "100000000", // 1 FLOW minimum before fee applies
    enabled: true,
    updatedBy: "system",
};
