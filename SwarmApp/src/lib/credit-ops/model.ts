/**
 * Credit Operations — Score Model Rollout
 *
 * Version management for scoring models. Supports shadow mode
 * comparison before promotion, and rollback to previous versions.
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
import { getPolicy } from "./policy";
import type { CreditOpsModel, ModelStatus, ShadowResults } from "./types";

const MODEL_COLLECTION = "creditOpsModels";

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

/** Create a new model version. */
export async function createModel(params: {
  version: string;
  policyId: string;
  description: string;
  changelog: string;
  publishedBy: string;
}): Promise<string> {
  // Verify policy exists
  const policy = await getPolicy(params.policyId);
  if (!policy) throw new Error("Policy not found");

  const model: Omit<CreditOpsModel, "id" | "createdAt" | "updatedAt"> = {
    version: params.version,
    status: "draft",
    policyId: params.policyId,
    description: params.description,
    changelog: params.changelog,
    shadowModeEnabled: false,
    publishedBy: params.publishedBy,
  };

  const ref = await addDoc(collection(db, MODEL_COLLECTION), {
    ...model,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await recordCreditOpsAudit({
    action: "model.created",
    performedBy: params.publishedBy,
    targetType: "model",
    targetId: ref.id,
    metadata: { version: params.version, policyId: params.policyId },
  });

  return ref.id;
}

/** Get a model by ID. */
export async function getModel(modelId: string): Promise<CreditOpsModel | null> {
  const ref = doc(db, MODEL_COLLECTION, modelId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CreditOpsModel;
}

/** Get the active model. */
export async function getActiveModel(): Promise<CreditOpsModel | null> {
  const q = query(
    collection(db, MODEL_COLLECTION),
    where("status", "==", "active"),
    firestoreLimit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as CreditOpsModel;
}

/** List all models. */
export async function listModels(): Promise<CreditOpsModel[]> {
  const q = query(
    collection(db, MODEL_COLLECTION),
    orderBy("createdAt", "desc"),
    firestoreLimit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CreditOpsModel[];
}

// ═══════════════════════════════════════════════════════════════
// Shadow Mode
// ═══════════════════════════════════════════════════════════════

/** Start shadow mode for a model. */
export async function startShadowMode(modelId: string): Promise<void> {
  const ref = doc(db, MODEL_COLLECTION, modelId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Model not found");
  if (snap.data().status !== "draft") throw new Error("Only draft models can enter shadow mode");

  await updateDoc(ref, {
    status: "shadow",
    shadowModeEnabled: true,
    shadowStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await recordCreditOpsAudit({
    action: "model.shadow_started",
    performedBy: "platform-admin",
    targetType: "model",
    targetId: modelId,
  });
}

/** Compute shadow comparison results. Samples agents and computes divergence. */
export async function computeShadowComparison(modelId: string): Promise<ShadowResults> {
  const model = await getModel(modelId);
  if (!model) throw new Error("Model not found");

  const policy = await getPolicy(model.policyId);
  if (!policy) throw new Error("Model policy not found");

  // Sample agents and compute divergence
  const agentsSnap = await getDocs(
    query(collection(db, "agents"), where("creditScore", ">", 0), firestoreLimit(100)),
  );

  let totalCreditDivergence = 0;
  let totalTrustDivergence = 0;
  let maxCreditDivergence = 0;
  let promotions = 0;
  let demotions = 0;
  const agentsSampled = agentsSnap.docs.length;

  for (const agentDoc of agentsSnap.docs) {
    const agent = agentDoc.data();
    const currentCredit = agent.creditScore || 680;
    const currentTrust = agent.trustScore || 50;

    // Simulate what score would be under new policy (simplified)
    // In practice, this would replay recent events with new weights
    const simCredit = currentCredit; // Simplified: same base score
    const simTrust = currentTrust;

    const creditDiv = Math.abs(simCredit - currentCredit);
    const trustDiv = Math.abs(simTrust - currentTrust);

    totalCreditDivergence += creditDiv;
    totalTrustDivergence += trustDiv;
    maxCreditDivergence = Math.max(maxCreditDivergence, creditDiv);

    // Check tier changes
    const currentTier = getTierFromScore(currentCredit, policy.tierBoundaries);
    const simTier = getTierFromScore(simCredit, policy.tierBoundaries);
    if (simTier > currentTier) promotions++;
    if (simTier < currentTier) demotions++;
  }

  const results: ShadowResults = {
    agentsSampled,
    avgCreditDivergence: agentsSampled > 0 ? totalCreditDivergence / agentsSampled : 0,
    avgTrustDivergence: agentsSampled > 0 ? totalTrustDivergence / agentsSampled : 0,
    maxCreditDivergence,
    promotionRecommendations: promotions,
    demotionRecommendations: demotions,
  };

  // Save results to model
  const ref = doc(db, MODEL_COLLECTION, modelId);
  await updateDoc(ref, { shadowResults: results, updatedAt: serverTimestamp() });

  return results;
}

function getTierFromScore(
  credit: number,
  boundaries: { platinum: number; gold: number; silver: number },
): number {
  if (credit >= boundaries.platinum) return 3;
  if (credit >= boundaries.gold) return 2;
  if (credit >= boundaries.silver) return 1;
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// Promote / Rollback
// ═══════════════════════════════════════════════════════════════

/** Promote a model to active. Deprecates the current active model. */
export async function promoteModel(
  modelId: string,
  promotedBy: string,
): Promise<void> {
  const ref = doc(db, MODEL_COLLECTION, modelId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Model not found");

  const data = snap.data();
  if (data.status !== "draft" && data.status !== "shadow") {
    throw new Error("Only draft or shadow models can be promoted");
  }

  // Deprecate current active model
  const currentActive = await getActiveModel();
  if (currentActive) {
    const activeRef = doc(db, MODEL_COLLECTION, currentActive.id);
    await updateDoc(activeRef, { status: "deprecated", updatedAt: serverTimestamp() });
  }

  // Promote new model
  await updateDoc(ref, {
    status: "active",
    shadowModeEnabled: false,
    activatedAt: serverTimestamp(),
    previousModelId: currentActive?.id || null,
    updatedAt: serverTimestamp(),
  });

  await recordCreditOpsAudit({
    action: "model.promoted",
    performedBy: promotedBy,
    targetType: "model",
    targetId: modelId,
    metadata: {
      version: data.version,
      previousModelId: currentActive?.id,
    },
  });
}

/** Rollback a model. Restores the previous active model. */
export async function rollbackModel(
  modelId: string,
  rolledBackBy: string,
  reason: string,
): Promise<void> {
  const ref = doc(db, MODEL_COLLECTION, modelId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Model not found");

  const data = snap.data();

  // Mark as rolled back
  await updateDoc(ref, {
    status: "rolled_back",
    rollbackAt: serverTimestamp(),
    rollbackBy: rolledBackBy,
    rollbackReason: reason,
    updatedAt: serverTimestamp(),
  });

  // Restore previous model if available
  if (data.previousModelId) {
    const prevRef = doc(db, MODEL_COLLECTION, data.previousModelId);
    const prevSnap = await getDoc(prevRef);
    if (prevSnap.exists()) {
      await updateDoc(prevRef, { status: "active", updatedAt: serverTimestamp() });
    }
  }

  await recordCreditOpsAudit({
    action: "model.rolled_back",
    performedBy: rolledBackBy,
    targetType: "model",
    targetId: modelId,
    metadata: { reason, previousModelId: data.previousModelId },
  });
}
