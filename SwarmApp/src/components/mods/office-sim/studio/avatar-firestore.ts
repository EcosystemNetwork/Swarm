/**
 * Avatar Firestore CRUD — Manages the agentAvatars collection
 *
 * Follows the same patterns as src/lib/storacha/cid-index.ts.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  AvatarGenerationTask,
  AgentAvatarData,
  AvatarGenerationStatus,
} from "./avatar-types";

const COLLECTION = "agentAvatars";

function toTimestamp(val: unknown): number | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val.toMillis();
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") return val;
  return undefined;
}

/* ═══════════════════════════════════════
   Create
   ═══════════════════════════════════════ */

export async function createAvatarTask(
  task: Omit<AvatarGenerationTask, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...task,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/* ═══════════════════════════════════════
   Update
   ═══════════════════════════════════════ */

export async function updateAvatarTask(
  taskId: string,
  patch: Partial<AvatarGenerationTask>,
): Promise<void> {
  const ref = doc(db, COLLECTION, taskId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/* ═══════════════════════════════════════
   Read — Single task
   ═══════════════════════════════════════ */

export async function getAvatarTask(
  taskId: string,
): Promise<AvatarGenerationTask | null> {
  const snap = await getDoc(doc(db, COLLECTION, taskId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AvatarGenerationTask;
}

/* ═══════════════════════════════════════
   Read — Active task for agent
   ═══════════════════════════════════════ */

const ACTIVE_STATUSES: AvatarGenerationStatus[] = [
  "pending",
  "generating_3d",
  "refining_3d",
  "rigging",
  "animating",
  "generating_2d",
  "uploading",
];

export async function getActiveAvatarTask(
  agentId: string,
): Promise<AvatarGenerationTask | null> {
  const q = query(
    collection(db, COLLECTION),
    where("agentId", "==", agentId),
    where("status", "in", ACTIVE_STATUSES),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as AvatarGenerationTask;
}

/* ═══════════════════════════════════════
   Read — Completed avatar for agent
   ═══════════════════════════════════════ */

export async function getAgentAvatar(
  agentId: string,
): Promise<AgentAvatarData | null> {
  const q = query(
    collection(db, COLLECTION),
    where("agentId", "==", agentId),
    where("status", "in", ["completed", "partial"]),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const data = snap.docs[0].data() as AvatarGenerationTask;
  return taskToAvatarData(data);
}

/* ═══════════════════════════════════════
   Read — Batch fetch for org (used by OfficeProvider)
   ═══════════════════════════════════════ */

export async function batchGetAvatars(
  orgId: string,
): Promise<Map<string, AgentAvatarData>> {
  const q = query(
    collection(db, COLLECTION),
    where("orgId", "==", orgId),
    where("status", "in", ["completed", "partial"]),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);

  // Keep only the latest per agent
  const map = new Map<string, AgentAvatarData>();
  for (const d of snap.docs) {
    const data = d.data() as AvatarGenerationTask;
    if (!map.has(data.agentId)) {
      const avatar = taskToAvatarData(data);
      if (avatar) map.set(data.agentId, avatar);
    }
  }
  return map;
}

/* ═══════════════════════════════════════
   Helpers
   ═══════════════════════════════════════ */

function taskToAvatarData(
  task: AvatarGenerationTask,
): AgentAvatarData | null {
  const has3d = task.meshy?.gatewayUrl;
  const has2d = task.comfyui?.gatewayUrl;
  if (!has3d && !has2d) return null;

  const animationUrls: Record<string, string> = {};
  if (task.meshy?.animationGlbs) {
    for (const [name, entry] of Object.entries(task.meshy.animationGlbs)) {
      animationUrls[name] = entry.gatewayUrl;
    }
  }

  return {
    agentId: task.agentId,
    modelUrl: task.meshy?.gatewayUrl,
    animationUrls: Object.keys(animationUrls).length > 0 ? animationUrls : undefined,
    spriteUrl: task.comfyui?.gatewayUrl,
    spriteSheetUrl: task.comfyui?.sheetGatewayUrl,
    prompt: task.prompt,
    generatedAt: toTimestamp(task.completedAt) || toTimestamp(task.updatedAt),
  };
}
