/**
 * Flow Treasury — Spending Policy
 *
 * Per-org spending controls for all FLOW payments initiated by Swarm agents.
 * All amounts are stored as "mini FLOW" strings (1 FLOW = 100_000_000 units, 8 decimals)
 * to avoid floating-point precision loss.
 *
 * Policy check order:
 *   1. paused?                     → blocked (kill switch)
 *   2. toAddress in allowlist?     → blocked if not in list (when list non-empty)
 *   3. amount > perTxCap?          → blocked
 *   4. dailySpent + amount > dailyCap? → blocked
 *   5. requireApprovalForAll?      → pending_approval
 *   6. amount > approvalThreshold (when >0)? → pending_approval
 *   7. otherwise                   → allowed
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

export interface FlowPolicy {
    id: string;
    orgId: string;
    /** Max mini-FLOW per single transaction. "0" = no cap. */
    perTxCap: string;
    /** Max mini-FLOW per calendar day across all txs. "0" = no cap. */
    dailyCap: string;
    /** Max mini-FLOW per calendar month. "0" = no cap. */
    monthlyCap: string;
    /** mini-FLOW amount above which human approval is required. "0" = no threshold. */
    approvalThreshold: string;
    /** Destination address whitelist. Empty = all destinations allowed. */
    allowlist: string[];
    /** If true, all outbound payments are blocked (kill switch). */
    paused: boolean;
    /** If true, every payment requires human approval regardless of amount. */
    requireApprovalForAll: boolean;
    createdBy: string;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface FlowPayment {
    id: string;
    orgId: string;
    fromAddress: string;
    toAddress: string;
    /** Amount in mini-FLOW as string */
    amount: string;
    memo: string;
    status: FlowPaymentStatus;
    /** On-chain tx hash once broadcast */
    txHash: string | null;
    policyResult: FlowPolicyResult;
    approvalId: string | null;
    approvedBy: string | null;
    subscriptionId: string | null;
    idempotencyKey: string | null;
    createdBy: string;
    createdAt: Date | null;
    executedAt: Date | null;
}

export type FlowPaymentStatus =
    | "pending_approval"
    | "ready"
    | "executing"
    | "executed"
    | "rejected"
    | "blocked";

export type FlowPolicyResult =
    | "allowed"
    | "pending_approval"
    | "blocked_paused"
    | "blocked_allowlist"
    | "blocked_per_tx_cap"
    | "blocked_daily_cap"
    | "blocked_monthly_cap";

export interface FlowSubscription {
    id: string;
    orgId: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    memo: string;
    frequency: "daily" | "weekly" | "monthly";
    maxCycles: number | null;
    cyclesCompleted: number;
    status: "active" | "paused" | "cancelled" | "completed";
    nextPaymentAt: Date | null;
    createdBy: string;
    createdAt: Date | null;
}

export interface FlowAuditEntry {
    id: string;
    orgId: string;
    event: FlowAuditEvent;
    paymentId: string | null;
    subscriptionId: string | null;
    fromAddress: string | null;
    toAddress: string | null;
    amount: string | null;
    txHash: string | null;
    policyResult: FlowPolicyResult | null;
    reviewedBy: string | null;
    note: string | null;
    createdAt: Date | null;
}

export type FlowAuditEvent =
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
    | "deployment_created"
    | "deployment_deployed"
    | "deployment_failed";

// ═══════════════════════════════════════════════════════════════
// Policy CRUD
// ═══════════════════════════════════════════════════════════════

export async function getFlowPolicy(orgId: string): Promise<FlowPolicy | null> {
    const snap = await getDoc(doc(db, "flowPolicies", orgId));
    if (!snap.exists()) return null;
    return docToPolicy(snap.id, snap.data() as Record<string, unknown>);
}

export async function upsertFlowPolicy(
    orgId: string,
    input: Omit<FlowPolicy, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt">,
    updatedBy: string,
): Promise<FlowPolicy> {
    const ref = doc(db, "flowPolicies", orgId);
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

export async function createFlowPayment(
    input: Omit<FlowPayment, "id" | "createdAt" | "executedAt">,
): Promise<FlowPayment> {
    const ref = await addDoc(collection(db, "flowPayments"), {
        ...input,
        createdAt: serverTimestamp(),
        executedAt: null,
    });
    return { ...input, id: ref.id, createdAt: new Date(), executedAt: null };
}

export async function updateFlowPayment(
    id: string,
    patch: Partial<Pick<FlowPayment, "status" | "txHash" | "approvalId" | "approvedBy" | "executedAt">>,
): Promise<void> {
    await updateDoc(doc(db, "flowPayments", id), patch);
}

export async function getFlowPayment(id: string): Promise<FlowPayment | null> {
    const snap = await getDoc(doc(db, "flowPayments", id));
    if (!snap.exists()) return null;
    return docToPayment(snap.id, snap.data() as Record<string, unknown>);
}

export async function getFlowPaymentByIdempotencyKey(
    orgId: string,
    idempotencyKey: string,
): Promise<FlowPayment | null> {
    const q = query(
        collection(db, "flowPayments"),
        where("orgId", "==", orgId),
        where("idempotencyKey", "==", idempotencyKey),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return docToPayment(snap.docs[0].id, snap.docs[0].data() as Record<string, unknown>);
}

export async function getFlowPayments(
    orgId: string,
    limit = 50,
    cursor?: string,
): Promise<{ payments: FlowPayment[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "flowPayments", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "flowPayments"), ...constraints));
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

export async function createFlowSubscription(
    input: Omit<FlowSubscription, "id" | "cyclesCompleted" | "createdAt">,
): Promise<FlowSubscription> {
    const ref = await addDoc(collection(db, "flowSubscriptions"), {
        ...input,
        cyclesCompleted: 0,
        createdAt: serverTimestamp(),
    });
    return { ...input, id: ref.id, cyclesCompleted: 0, createdAt: new Date() };
}

export async function updateFlowSubscription(
    id: string,
    patch: Partial<Pick<FlowSubscription, "status" | "cyclesCompleted" | "nextPaymentAt">>,
): Promise<void> {
    await updateDoc(doc(db, "flowSubscriptions", id), patch);
}

export async function getFlowSubscriptions(orgId: string): Promise<FlowSubscription[]> {
    const q = query(collection(db, "flowSubscriptions"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs
        .map((d) => docToSubscription(d.id, d.data()))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

// ═══════════════════════════════════════════════════════════════
// Audit CRUD
// ═══════════════════════════════════════════════════════════════

export async function logFlowAudit(
    input: Omit<FlowAuditEntry, "id" | "createdAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, "flowAudit"), {
        ...input,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function getFlowAudit(
    orgId: string,
    limit = 100,
    cursor?: string,
): Promise<{ entries: FlowAuditEntry[]; nextCursor: string | null }> {
    const constraints: QueryConstraint[] = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit + 1),
    ];

    if (cursor) {
        const cursorSnap = await getDoc(doc(db, "flowAudit", cursor));
        if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
    }

    const snap = await getDocs(query(collection(db, "flowAudit"), ...constraints));
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
    amount: string;
}

export interface PolicyCheckResult {
    allowed: boolean;
    requiresApproval: boolean;
    result: FlowPolicyResult;
    reason: string;
    remainingDaily: string;
}

export async function checkFlowPolicy(input: PolicyCheckInput): Promise<PolicyCheckResult> {
    const policy = await getFlowPolicy(input.orgId);

    if (!policy) {
        return {
            allowed: true,
            requiresApproval: false,
            result: "allowed",
            reason: "No policy configured — all payments allowed",
            remainingDaily: "0",
        };
    }

    const amount = BigInt(input.amount);

    if (policy.paused) {
        return { allowed: false, requiresApproval: false, result: "blocked_paused", reason: "Treasury is paused (kill switch active)", remainingDaily: "0" };
    }

    if (policy.allowlist.length > 0 && !policy.allowlist.includes(input.toAddress)) {
        return { allowed: false, requiresApproval: false, result: "blocked_allowlist", reason: "Destination address not in allowlist", remainingDaily: "0" };
    }

    const perTxCap = BigInt(policy.perTxCap);
    if (perTxCap > 0n && amount > perTxCap) {
        return { allowed: false, requiresApproval: false, result: "blocked_per_tx_cap", reason: `Exceeds per-tx cap of ${miniFlowToFlow(policy.perTxCap)} FLOW`, remainingDaily: "0" };
    }

    const todaySpent = await getDailySpent(input.orgId);
    const dailyCap = BigInt(policy.dailyCap);
    const remaining = dailyCap > 0n ? dailyCap - todaySpent : BigInt(Number.MAX_SAFE_INTEGER);
    const remainingDaily = dailyCap > 0n ? (remaining > 0n ? remaining.toString() : "0") : "0";

    if (dailyCap > 0n && todaySpent + amount > dailyCap) {
        return { allowed: false, requiresApproval: false, result: "blocked_daily_cap", reason: `Exceeds daily cap. Remaining: ${miniFlowToFlow(remainingDaily)} FLOW`, remainingDaily };
    }

    if (policy.requireApprovalForAll) {
        return { allowed: true, requiresApproval: true, result: "pending_approval", reason: "Policy requires approval for all payments", remainingDaily };
    }

    const threshold = BigInt(policy.approvalThreshold);
    if (threshold > 0n && amount > threshold) {
        return { allowed: true, requiresApproval: true, result: "pending_approval", reason: `Amount exceeds approval threshold of ${miniFlowToFlow(policy.approvalThreshold)} FLOW`, remainingDaily };
    }

    return { allowed: true, requiresApproval: false, result: "allowed", reason: "Within policy limits", remainingDaily };
}

async function getDailySpent(orgId: string): Promise<bigint> {
    const startOfDay = new Date(new Date().toISOString().split("T")[0] + "T00:00:00.000Z");
    const q = query(
        collection(db, "flowPayments"),
        where("orgId", "==", orgId),
        where("status", "==", "executed"),
        where("executedAt", ">=", Timestamp.fromDate(startOfDay)),
    );
    const snap = await getDocs(q);
    let total = 0n;
    for (const d of snap.docs) {
        total += BigInt(d.data().amount || "0");
    }
    return total;
}

// ═══════════════════════════════════════════════════════════════
// Helpers — Flow uses 8 decimal places (UFix64)
// ═══════════════════════════════════════════════════════════════

const FLOW_DECIMALS = 100_000_000n; // 1 FLOW = 10^8

export function miniFlowToFlow(mini: string): string {
    if (!mini || mini === "0") return "0.0";
    const n = BigInt(mini);
    const whole = n / FLOW_DECIMALS;
    const frac = n % FLOW_DECIMALS;
    if (frac === 0n) return `${whole}.0`;
    return `${whole}.${frac.toString().padStart(8, "0").replace(/0+$/, "")}`;
}

export function flowToMiniFlow(flow: string): string {
    if (!flow || flow === "0" || flow === "0.0") return "0";
    const [whole, frac = ""] = flow.split(".");
    const fracPadded = frac.slice(0, 8).padEnd(8, "0");
    return (BigInt(whole) * FLOW_DECIMALS + BigInt(fracPadded)).toString();
}

function docToPolicy(id: string, d: Record<string, unknown>): FlowPolicy {
    return {
        id,
        orgId: d.orgId as string,
        perTxCap: (d.perTxCap as string) || "0",
        dailyCap: (d.dailyCap as string) || "0",
        monthlyCap: (d.monthlyCap as string) || "0",
        approvalThreshold: (d.approvalThreshold as string) || "0",
        allowlist: (d.allowlist as string[]) || [],
        paused: (d.paused as boolean) || false,
        requireApprovalForAll: (d.requireApprovalForAll as boolean) || false,
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
    };
}

function docToPayment(id: string, d: Record<string, unknown>): FlowPayment {
    return {
        id,
        orgId: d.orgId as string,
        fromAddress: (d.fromAddress as string) || "",
        toAddress: (d.toAddress as string) || "",
        amount: (d.amount as string) || "0",
        memo: (d.memo as string) || "",
        status: (d.status as FlowPaymentStatus) || "ready",
        txHash: (d.txHash as string) || null,
        policyResult: (d.policyResult as FlowPolicyResult) || "allowed",
        approvalId: (d.approvalId as string) || null,
        approvedBy: (d.approvedBy as string) || null,
        subscriptionId: (d.subscriptionId as string) || null,
        idempotencyKey: (d.idempotencyKey as string) || null,
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        executedAt: d.executedAt instanceof Timestamp ? d.executedAt.toDate() : null,
    };
}

function docToSubscription(id: string, d: Record<string, unknown>): FlowSubscription {
    return {
        id,
        orgId: d.orgId as string,
        fromAddress: (d.fromAddress as string) || "",
        toAddress: (d.toAddress as string) || "",
        amount: (d.amount as string) || "0",
        memo: (d.memo as string) || "",
        frequency: (d.frequency as FlowSubscription["frequency"]) || "monthly",
        maxCycles: (d.maxCycles as number | null) ?? null,
        cyclesCompleted: (d.cyclesCompleted as number) || 0,
        status: (d.status as FlowSubscription["status"]) || "active",
        nextPaymentAt: d.nextPaymentAt instanceof Timestamp ? d.nextPaymentAt.toDate() : null,
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}

function docToAudit(id: string, d: Record<string, unknown>): FlowAuditEntry {
    return {
        id,
        orgId: d.orgId as string,
        event: d.event as FlowAuditEvent,
        paymentId: (d.paymentId as string) || null,
        subscriptionId: (d.subscriptionId as string) || null,
        fromAddress: (d.fromAddress as string) || null,
        toAddress: (d.toAddress as string) || null,
        amount: (d.amount as string) || null,
        txHash: (d.txHash as string) || null,
        policyResult: (d.policyResult as FlowPolicyResult) || null,
        reviewedBy: (d.reviewedBy as string) || null,
        note: (d.note as string) || null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}

/** Default safe policy for new orgs */
export const DEFAULT_FLOW_POLICY: Omit<FlowPolicy, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt"> = {
    perTxCap: "500000000",         // 5 FLOW per tx
    dailyCap: "2000000000",        // 20 FLOW/day
    monthlyCap: "10000000000",     // 100 FLOW/month
    approvalThreshold: "200000000", // require approval >2 FLOW
    allowlist: [],
    paused: false,
    requireApprovalForAll: false,
};
