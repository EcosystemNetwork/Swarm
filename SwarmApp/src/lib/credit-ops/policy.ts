/**
 * Credit Operations — Policy Configuration
 *
 * CRUD for scoring policies: tier boundaries, event weights,
 * slashing rules, anomaly thresholds. Only one policy can be active.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { recordCreditOpsAudit } from "./audit";
import type { CreditOpsPolicy, PolicyStatus } from "./types";

const POLICY_COLLECTION = "creditOpsPolicies";

// In-memory cache for active policy (avoid repeated Firestore reads)
let activePolicyCache: CreditOpsPolicy | null = null;
let policyCacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/** Default policy values (matches current hardcoded values) */
export const DEFAULT_POLICY: Omit<CreditOpsPolicy, "id" | "createdAt" | "activatedAt"> = {
  version: 1,
  status: "active" as PolicyStatus,
  tierBoundaries: { platinum: 850, gold: 700, silver: 550 },
  scoreRange: { min: 300, max: 900 },
  trustRange: { min: 0, max: 100 },
  defaultCreditScore: 680,
  defaultTrustScore: 50,
  eventWeights: {
    task_complete_simple: { credit: 5, trust: 1 },
    task_complete_medium: { credit: 10, trust: 2 },
    task_complete_complex: { credit: 20, trust: 5 },
    task_fail: { credit: -10, trust: -2 },
    skill_report: { credit: 2, trust: 1 },
  },
  slashingRules: {
    missedDeadline: { credit: 5, trust: 1, hoursThreshold: 0 },
    severelyLate: { credit: 15, trust: 3, hoursThreshold: 24 },
    abandoned: { credit: 30, trust: 5, hoursThreshold: 168 },
    governanceThreshold: 50,
  },
  anomalyThresholds: {
    maxScoreChangePerHour: 100,
    minEventsForAnomaly: 5,
    rapidEventWindowMinutes: 10,
    rapidEventMax: 20,
  },
  createdBy: "system",
  description: "Default scoring policy",
};

// ═══════════════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════════════

/** Get the currently active policy. Falls back to defaults if none exists. */
export async function getActivePolicy(): Promise<CreditOpsPolicy> {
  if (activePolicyCache && Date.now() - policyCacheTime < CACHE_TTL) {
    return activePolicyCache;
  }

  const q = query(
    collection(db, POLICY_COLLECTION),
    where("status", "==", "active"),
    firestoreLimit(1),
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    // Seed default policy
    const id = await seedDefaultPolicy();
    const policy = { ...DEFAULT_POLICY, id } as CreditOpsPolicy;
    activePolicyCache = policy;
    policyCacheTime = Date.now();
    return policy;
  }

  const policy = { id: snap.docs[0].id, ...snap.docs[0].data() } as CreditOpsPolicy;
  activePolicyCache = policy;
  policyCacheTime = Date.now();
  return policy;
}

/** Get a policy by ID. */
export async function getPolicy(policyId: string): Promise<CreditOpsPolicy | null> {
  const ref = doc(db, POLICY_COLLECTION, policyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CreditOpsPolicy;
}

/** List all policy versions. */
export async function listPolicies(): Promise<CreditOpsPolicy[]> {
  const q = query(
    collection(db, POLICY_COLLECTION),
    orderBy("version", "desc"),
    firestoreLimit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CreditOpsPolicy[];
}

// ═══════════════════════════════════════════════════════════════
// Write
// ═══════════════════════════════════════════════════════════════

/** Create a draft policy. */
export async function createDraftPolicy(
  partial: Partial<CreditOpsPolicy>,
  createdBy: string,
): Promise<string> {
  // Get current max version
  const policies = await listPolicies();
  const maxVersion = policies.length > 0 ? Math.max(...policies.map((p) => p.version || 0)) : 0;

  const policy = {
    ...DEFAULT_POLICY,
    ...partial,
    version: maxVersion + 1,
    status: "draft",
    createdBy,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, POLICY_COLLECTION), policy);

  await recordCreditOpsAudit({
    action: "policy.created",
    performedBy: createdBy,
    targetType: "policy",
    targetId: ref.id,
    metadata: { version: policy.version },
  });

  return ref.id;
}

/** Update a draft policy. Only drafts can be edited. */
export async function updateDraftPolicy(
  policyId: string,
  updates: Partial<CreditOpsPolicy>,
): Promise<void> {
  const ref = doc(db, POLICY_COLLECTION, policyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Policy not found");
  if (snap.data().status !== "draft") throw new Error("Only draft policies can be edited");

  // Prevent changing status or version through this function
  const { status: _s, version: _v, id: _id, ...safeUpdates } = updates;
  await updateDoc(ref, safeUpdates);
}

/** Activate a policy. Archives the current active one. */
export async function activatePolicy(
  policyId: string,
  activatedBy: string,
): Promise<void> {
  // Archive current active policy
  const currentActive = await getActivePolicy();
  if (currentActive.id && currentActive.id !== policyId) {
    const currentRef = doc(db, POLICY_COLLECTION, currentActive.id);
    await updateDoc(currentRef, { status: "archived" });
  }

  // Activate new policy
  const ref = doc(db, POLICY_COLLECTION, policyId);
  await updateDoc(ref, {
    status: "active",
    activatedAt: serverTimestamp(),
  });

  // Invalidate cache
  activePolicyCache = null;
  policyCacheTime = 0;

  await recordCreditOpsAudit({
    action: "policy.activated",
    performedBy: activatedBy,
    targetType: "policy",
    targetId: policyId,
  });
}

/** Seed default policy if none exists. */
export async function seedDefaultPolicy(): Promise<string> {
  const ref = await addDoc(collection(db, POLICY_COLLECTION), {
    ...DEFAULT_POLICY,
    createdAt: serverTimestamp(),
    activatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Get tier name for a credit score using active policy boundaries. */
export async function getTierForScore(creditScore: number): Promise<string> {
  const policy = await getActivePolicy();
  if (creditScore >= policy.tierBoundaries.platinum) return "Platinum";
  if (creditScore >= policy.tierBoundaries.gold) return "Gold";
  if (creditScore >= policy.tierBoundaries.silver) return "Silver";
  return "Bronze";
}
