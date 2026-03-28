/**
 * TON Treasury — Spending Policy
 *
 * Per-org spending controls for all TON payments initiated by Swarm agents.
 * All amounts are stored as nanoTON strings to avoid BigInt serialization.
 *
 * Policy check order:
 *   1. paused?                     → blocked (kill switch)
 *   2. toAddress in allowlist?     → blocked if not in list (when list non-empty)
 *   3. amountNano > perTxCapNano?  → blocked
 *   4. dailySpentNano + amount > dailyCapNano? → blocked
 *   5. requireApprovalForAll?      → pending_approval
 *   6. amount > approvalThresholdNano (when >0)? → pending_approval
 *   7. otherwise                   → allowed
 *
 * NOTE: approvalThresholdNano "0" means NO threshold (all within-cap payments auto-approved).
 *       To require approval for every payment use requireApprovalForAll: true.
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

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TonPolicy {
    id: string;
    orgId: string;
    /** Max nanoTON per single transaction. "0" = no cap. */
    perTxCapNano: string;
    /** Max nanoTON per calendar day across all txs. "0" = no cap. */
    dailyCapNano: string;
    /** Max nanoTON per calendar month. "0" = no cap. */
    monthlyCapNano: string;
    /** nanoTON amount above which human approval is required. "0" = always require approval. */
    approvalThresholdNano: string;
    /** Destination address whitelist. Empty = all destinations allowed. */
    allowlist: string[];
    /** If true, all outbound payments are blocked (kill switch). */
    paused: boolean;
    /**
     * If true, every payment requires human approval regardless of amount.
     * Distinct from approvalThresholdNano — use this when you want a blanket approval gate.
     * approvalThresholdNano "0" means NO threshold (all within-cap payments auto-approved).
     */
    requireApprovalForAll: boolean;
    /** Telegram chat ID to notify when a payment enters pending_approval. Null = no notification. */
    notifyTelegramChatId: string | null;
    createdBy: string;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface TonPayment {
    id: string;
    orgId: string;
    fromAddress: string;
    toAddress: string;
    /** Amount in nanoTON as string */
    amountNano: string;
    memo: string;
    status: TonPaymentStatus;
    /** On-chain tx hash once broadcast */
    txHash: string | null;
    policyResult: TonPolicyResult;
    approvalId: string | null;
    approvedBy: string | null;
    /** Recurring subscription reference */
    subscriptionId: string | null;
    /**
     * Client-supplied deduplication key. If a payment with the same
     * (orgId, idempotencyKey) already exists, the POST returns it unchanged
     * instead of creating a duplicate.
     */
    idempotencyKey: string | null;
    createdBy: string;
    createdAt: Date | null;
    executedAt: Date | null;
}

export type TonPaymentStatus =
    | "pending_approval"
    | "ready"
    | "executing"
    | "executed"
    | "rejected"
    | "blocked";

export type TonPolicyResult =
    | "allowed"
    | "pending_approval"
    | "blocked_paused"
    | "blocked_allowlist"
    | "blocked_per_tx_cap"
    | "blocked_daily_cap"
    | "blocked_monthly_cap";

export interface TonSubscription {
    id: string;
    orgId: string;
    fromAddress: string;
    toAddress: string;
    amountNano: string;
    memo: string;
    frequency: "daily" | "weekly" | "monthly";
    maxCycles: number | null;
    cyclesCompleted: number;
    status: "active" | "paused" | "cancelled" | "completed";
    nextPaymentAt: Date | null;
    createdBy: string;
    createdAt: Date | null;
}

export interface TonAuditEntry {
    id: string;
    orgId: string;
    event: TonAuditEvent;
    paymentId: string | null;
    subscriptionId: string | null;
    fromAddress: string | null;
    toAddress: string | null;
    amountNano: string | null;
    txHash: string | null;
    policyResult: TonPolicyResult | null;
    reviewedBy: string | null;
    note: string | null;
    createdAt: Date | null;
}

export type TonAuditEvent =
    | "wallet_connected"
    | "wallet_verified"
    | "wallet_status_changed"
    | "payment_created"
    | "payment_approved"
    | "payment_rejected"
    | "payment_executed"
    | "payment_blocked"
    | "subscription_created"
    | "subscription_cancelled"
    | "policy_updated"
    | "policy_paused"
    | "policy_resumed"
    | "bounty_posted"
    | "bounty_claimed"
    | "bounty_submitted"
    | "bounty_approved"
    | "bounty_rejected"
    | "bounty_cancelled"
    | "bounty_released"
    | "notification_failed";

// ═══════════════════════════════════════════════════════════════
// Policy CRUD
// ═══════════════════════════════════════════════════════════════

export async function getTonPolicy(orgId: string): Promise<TonPolicy | null> {
    // Document key = orgId (deterministic) — prevents duplicate policy documents
    const snap = await getDoc(doc(db, "tonPolicies", orgId));
    if (!snap.exists()) return null;
    return docToPolicy(snap.id, snap.data() as Record<string, unknown>);
}

export async function upsertTonPolicy(
    orgId: string,
    input: Omit<TonPolicy, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt">,
    updatedBy: string,
): Promise<TonPolicy> {
    // Use orgId as doc ID — setDoc is atomic, eliminating the read-then-write race
    const ref = doc(db, "tonPolicies", orgId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        await updateDoc(ref, { ...input, updatedAt: serverTimestamp() });
        return { ...docToPolicy(snap.id, snap.data() as Record<string, unknown>), ...input, updatedAt: new Date() };
    }

    await setDoc(ref, {
        orgId,
        ...input,
        createdBy: updatedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return { id: orgId, orgId, ...input, createdBy: updatedBy, createdAt: new Date(), updatedAt: new Date() };
}

// ═══════════════════════════════════════════════════════════════
// Payment CRUD
// ═══════════════════════════════════════════════════════════════

export async function createTonPayment(
    input: Omit<TonPayment, "id" | "createdAt" | "executedAt">,
): Promise<TonPayment> {
    const ref = await addDoc(collection(db, "tonPayments"), {
        ...input,
        createdAt: serverTimestamp(),
        executedAt: null,
    });
    return { ...input, id: ref.id, createdAt: new Date(), executedAt: null };
}

export async function updateTonPayment(
    id: string,
    patch: Partial<Pick<TonPayment, "status" | "txHash" | "approvalId" | "approvedBy" | "executedAt">>,
): Promise<void> {
    await updateDoc(doc(db, "tonPayments", id), {
        ...patch,
        ...(patch.executedAt !== undefined ? {} : {}),
    });
}

export async function getTonPayment(id: string): Promise<TonPayment | null> {
    const snap = await getDoc(doc(db, "tonPayments", id));
    if (!snap.exists()) return null;
    return docToPayment(snap.id, snap.data() as Record<string, unknown>);
}

/** Returns an existing payment if one with this (orgId, idempotencyKey) pair was already created. */
export async function getTonPaymentByIdempotencyKey(
    orgId: string,
    idempotencyKey: string,
): Promise<TonPayment | null> {
    const q = query(
        collection(db, "tonPayments"),
        where("orgId", "==", orgId),
        where("idempotencyKey", "==", idempotencyKey),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return docToPayment(snap.docs[0].id, snap.docs[0].data() as Record<string, unknown>);
}

export async function getTonPayments(
    orgId: string,
    limit = 50,
    cursor?: string,
): Promise<{ payments: TonPayment[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "tonPayments", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "tonPayments"), ...constraints));
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit);
    return {
        payments: docs.map((d) => docToPayment(d.id, d.data() as Record<string, unknown>)),
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
}

// ═══════════════════════════════════════════════════════════════
// Subscription CRUD
// ═══════════════════════════════════════════════════════════════

export async function createTonSubscription(
    input: Omit<TonSubscription, "id" | "cyclesCompleted" | "createdAt">,
): Promise<TonSubscription> {
    const ref = await addDoc(collection(db, "tonSubscriptions"), {
        ...input,
        cyclesCompleted: 0,
        createdAt: serverTimestamp(),
    });
    return { ...input, id: ref.id, cyclesCompleted: 0, createdAt: new Date() };
}

export async function updateTonSubscription(
    id: string,
    patch: Partial<Pick<TonSubscription, "status" | "cyclesCompleted" | "nextPaymentAt">>,
): Promise<void> {
    await updateDoc(doc(db, "tonSubscriptions", id), patch);
}

export async function getTonSubscriptions(orgId: string): Promise<TonSubscription[]> {
    const q = query(collection(db, "tonSubscriptions"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs
        .map((d) => docToSubscription(d.id, d.data()))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

// ═══════════════════════════════════════════════════════════════
// Audit CRUD
// ═══════════════════════════════════════════════════════════════

export async function logTonAudit(
    input: Omit<TonAuditEntry, "id" | "createdAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, "tonAudit"), {
        ...input,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function getTonAudit(
    orgId: string,
    limit = 100,
    cursor?: string,
): Promise<{ entries: TonAuditEntry[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "tonAudit", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "tonAudit"), ...constraints));
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit);
    return {
        entries: docs.map((d) => docToAudit(d.id, d.data() as Record<string, unknown>)),
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
}

// ═══════════════════════════════════════════════════════════════
// Policy Enforcement
// ═══════════════════════════════════════════════════════════════

export interface PolicyCheckInput {
    orgId: string;
    toAddress: string;
    amountNano: string;
}

export interface PolicyCheckResult {
    allowed: boolean;
    requiresApproval: boolean;
    result: TonPolicyResult;
    reason: string;
    /** Remaining daily spend budget in nanoTON */
    remainingDailyNano: string;
}

export async function checkTonPolicy(input: PolicyCheckInput): Promise<PolicyCheckResult> {
    const policy = await getTonPolicy(input.orgId);

    // No policy = permissive default (all allowed, no approval)
    if (!policy) {
        return {
            allowed: true,
            requiresApproval: false,
            result: "allowed",
            reason: "No policy configured — all payments allowed",
            remainingDailyNano: "0",
        };
    }

    const amount = BigInt(input.amountNano);

    if (policy.paused) {
        return { allowed: false, requiresApproval: false, result: "blocked_paused", reason: "Treasury is paused (kill switch active)", remainingDailyNano: "0" };
    }

    if (policy.allowlist.length > 0 && !policy.allowlist.includes(input.toAddress)) {
        return { allowed: false, requiresApproval: false, result: "blocked_allowlist", reason: "Destination address not in allowlist", remainingDailyNano: "0" };
    }

    const perTxCap = BigInt(policy.perTxCapNano);
    if (perTxCap > 0n && amount > perTxCap) {
        return { allowed: false, requiresApproval: false, result: "blocked_per_tx_cap", reason: `Exceeds per-tx cap of ${nanoToTon(policy.perTxCapNano)} TON`, remainingDailyNano: "0" };
    }

    // Check daily spend
    const todaySpent = await getDailySpentNano(input.orgId);
    const dailyCap = BigInt(policy.dailyCapNano);
    const remaining = dailyCap > 0n ? dailyCap - todaySpent : BigInt(Number.MAX_SAFE_INTEGER);
    const remainingDailyNano = dailyCap > 0n ? (remaining > 0n ? remaining.toString() : "0") : "0";

    if (dailyCap > 0n && todaySpent + amount > dailyCap) {
        return { allowed: false, requiresApproval: false, result: "blocked_daily_cap", reason: `Exceeds daily cap. Remaining: ${nanoToTon(remainingDailyNano)} TON`, remainingDailyNano };
    }

    // Explicit blanket-approval gate (takes precedence over threshold)
    if (policy.requireApprovalForAll) {
        return { allowed: true, requiresApproval: true, result: "pending_approval", reason: "Policy requires approval for all payments", remainingDailyNano };
    }

    // Threshold: "0" = no cap (auto-approved). Only gate when threshold > 0.
    const threshold = BigInt(policy.approvalThresholdNano);
    if (threshold > 0n && amount > threshold) {
        return { allowed: true, requiresApproval: true, result: "pending_approval", reason: `Amount exceeds approval threshold of ${nanoToTon(policy.approvalThresholdNano)} TON`, remainingDailyNano };
    }

    return { allowed: true, requiresApproval: false, result: "allowed", reason: "Within policy limits", remainingDailyNano };
}

async function getDailySpentNano(orgId: string): Promise<bigint> {
    // UTC midnight — consistent regardless of server timezone
    const startOfDay = new Date(new Date().toISOString().split("T")[0] + "T00:00:00.000Z");

    // Composite index required: tonPayments(orgId ASC, status ASC, executedAt ASC)
    const q = query(
        collection(db, "tonPayments"),
        where("orgId", "==", orgId),
        where("status", "==", "executed"),
        where("executedAt", ">=", Timestamp.fromDate(startOfDay)),
    );
    const snap = await getDocs(q);
    let total = 0n;
    for (const d of snap.docs) {
        total += BigInt(d.data().amountNano || "0");
    }
    return total;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function nanoToTon(nano: string): string {
    if (!nano || nano === "0") return "0";
    const n = BigInt(nano);
    const whole = n / 1_000_000_000n;
    const frac = n % 1_000_000_000n;
    if (frac === 0n) return whole.toString();
    return `${whole}.${frac.toString().padStart(9, "0").replace(/0+$/, "")}`;
}

export function tonToNano(ton: string): string {
    if (!ton || ton === "0") return "0";
    const [whole, frac = ""] = ton.split(".");
    const fracPadded = frac.slice(0, 9).padEnd(9, "0");
    return (BigInt(whole) * 1_000_000_000n + BigInt(fracPadded)).toString();
}

function docToPolicy(id: string, d: Record<string, unknown>): TonPolicy {
    return {
        id,
        orgId: d.orgId as string,
        perTxCapNano: (d.perTxCapNano as string) || "0",
        dailyCapNano: (d.dailyCapNano as string) || "0",
        monthlyCapNano: (d.monthlyCapNano as string) || "0",
        approvalThresholdNano: (d.approvalThresholdNano as string) || "0",
        allowlist: (d.allowlist as string[]) || [],
        paused: (d.paused as boolean) || false,
        requireApprovalForAll: (d.requireApprovalForAll as boolean) || false,
        notifyTelegramChatId: (d.notifyTelegramChatId as string) || null,
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
    };
}

function docToPayment(id: string, d: Record<string, unknown>): TonPayment {
    return {
        id,
        orgId: d.orgId as string,
        fromAddress: (d.fromAddress as string) || "",
        toAddress: (d.toAddress as string) || "",
        amountNano: (d.amountNano as string) || "0",
        memo: (d.memo as string) || "",
        status: (d.status as TonPaymentStatus) || "ready",
        txHash: (d.txHash as string) || null,
        policyResult: (d.policyResult as TonPolicyResult) || "allowed",
        approvalId: (d.approvalId as string) || null,
        approvedBy: (d.approvedBy as string) || null,
        subscriptionId: (d.subscriptionId as string) || null,
        idempotencyKey: (d.idempotencyKey as string) || null,
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        executedAt: d.executedAt instanceof Timestamp ? d.executedAt.toDate() : null,
    };
}

function docToSubscription(id: string, d: Record<string, unknown>): TonSubscription {
    return {
        id,
        orgId: d.orgId as string,
        fromAddress: (d.fromAddress as string) || "",
        toAddress: (d.toAddress as string) || "",
        amountNano: (d.amountNano as string) || "0",
        memo: (d.memo as string) || "",
        frequency: (d.frequency as TonSubscription["frequency"]) || "monthly",
        maxCycles: (d.maxCycles as number | null) ?? null,
        cyclesCompleted: (d.cyclesCompleted as number) || 0,
        status: (d.status as TonSubscription["status"]) || "active",
        nextPaymentAt: d.nextPaymentAt instanceof Timestamp ? d.nextPaymentAt.toDate() : null,
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}

function docToAudit(id: string, d: Record<string, unknown>): TonAuditEntry {
    return {
        id,
        orgId: d.orgId as string,
        event: d.event as TonAuditEvent,
        paymentId: (d.paymentId as string) || null,
        subscriptionId: (d.subscriptionId as string) || null,
        fromAddress: (d.fromAddress as string) || null,
        toAddress: (d.toAddress as string) || null,
        amountNano: (d.amountNano as string) || null,
        txHash: (d.txHash as string) || null,
        policyResult: (d.policyResult as TonPolicyResult) || null,
        reviewedBy: (d.reviewedBy as string) || null,
        note: (d.note as string) || null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}

/** Default safe policy for new orgs */
export const DEFAULT_TON_POLICY: Omit<TonPolicy, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt"> = {
    perTxCapNano: "5000000000",      // 5 TON per tx
    dailyCapNano: "20000000000",     // 20 TON/day
    monthlyCapNano: "100000000000",  // 100 TON/month
    approvalThresholdNano: "2000000000", // require approval >2 TON
    allowlist: [],
    paused: false,
    requireApprovalForAll: false,
    notifyTelegramChatId: null,
};
