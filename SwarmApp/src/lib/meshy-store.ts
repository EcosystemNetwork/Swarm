/**
 * Meshy Store — Firestore CRUD for Meshy 3D generation jobs and assets.
 *
 * Collections:
 *   meshyJobs   — generation task records (text-to-3D, image-to-3D, rig, animate)
 *   meshyAssets — 3D model files and thumbnails produced by completed tasks
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

export type MeshyJobType = "text-to-3d" | "image-to-3d" | "rig" | "animate";
export type MeshyJobStatus =
  | "pending"
  | "preview"
  | "refining"
  | "rigging"
  | "animating"
  | "completed"
  | "failed"
  | "canceled";

export interface MeshyJob {
  id: string;
  orgId: string;
  userId: string;
  agentId?: string;

  /** Task type */
  jobType: MeshyJobType;
  /** Current pipeline status */
  status: MeshyJobStatus;
  /** Overall progress 0-100 */
  progress: number;

  /** User prompt */
  prompt: string;
  negativePrompt?: string;
  texturePrompt?: string;

  /** Image URL for image-to-3D */
  imageUrl?: string;

  /** Generation config */
  aiModel?: string;
  modelType?: string;
  topology?: string;
  targetPolycount?: number;
  targetFormats?: string[];
  enablePbr?: boolean;
  poseMode?: string;
  symmetryMode?: string;

  /** Meshy task IDs for each pipeline stage */
  previewTaskId?: string;
  refineTaskId?: string;
  rigTaskId?: string;
  animationTaskId?: string;
  animationActionId?: number;

  /** Results */
  thumbnailUrl?: string;
  modelUrls?: Record<string, string>;
  riggedModelUrl?: string;
  animationUrl?: string;

  /** Error info */
  error?: string;

  /** Tags and favorites */
  tags?: string[];
  isFavorite?: boolean;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface MeshyAsset {
  id: string;
  jobId: string;
  orgId: string;
  userId: string;
  agentId?: string;

  /** Asset type: model, thumbnail, texture, animation */
  assetType: "model" | "thumbnail" | "texture" | "animation" | "rigged-model";
  /** File format: glb, fbx, obj, usdz, stl, png */
  format: string;
  /** MIME type */
  mimeType: string;
  /** Download URL (from Meshy or Storacha) */
  url: string;
  /** Storacha CID if uploaded to decentralized storage */
  storachaCid?: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Original filename */
  filename?: string;

  /** Generation prompt (for searchability) */
  prompt?: string;

  createdAt?: Timestamp;
}

/* ═══════════════════════════════════════
   Collection refs
   ═══════════════════════════════════════ */

const jobsCol = () => collection(db, "meshyJobs");
const assetsCol = () => collection(db, "meshyAssets");

/* ═══════════════════════════════════════
   Jobs — CRUD
   ═══════════════════════════════════════ */

export async function createMeshyJob(
  data: Omit<MeshyJob, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const ref = await addDoc(jobsCol(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getMeshyJob(jobId: string): Promise<MeshyJob | null> {
  const snap = await getDoc(doc(jobsCol(), jobId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as MeshyJob;
}

export async function updateMeshyJob(
  jobId: string,
  data: Partial<Omit<MeshyJob, "id">>,
): Promise<void> {
  await updateDoc(doc(jobsCol(), jobId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMeshyJob(jobId: string): Promise<void> {
  await deleteDoc(doc(jobsCol(), jobId));
}

/** List jobs for an org with optional status filter */
export async function getOrgMeshyJobs(
  orgId: string,
  status?: MeshyJobStatus,
  max = 50,
): Promise<MeshyJob[]> {
  const constraints = [
    where("orgId", "==", orgId),
    orderBy("createdAt", "desc"),
    firestoreLimit(max),
  ];
  if (status) constraints.splice(1, 0, where("status", "==", status));

  const snap = await getDocs(query(jobsCol(), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeshyJob);
}

/** Get active (non-terminal) jobs for an org */
export async function getActiveOrgJobs(orgId: string): Promise<MeshyJob[]> {
  const snap = await getDocs(
    query(
      jobsCol(),
      where("orgId", "==", orgId),
      where("status", "in", ["pending", "preview", "refining", "rigging", "animating"]),
      orderBy("createdAt", "desc"),
      firestoreLimit(20),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeshyJob);
}

/** Get completed jobs for gallery view */
export async function getCompletedJobs(
  orgId: string,
  max = 30,
): Promise<MeshyJob[]> {
  const snap = await getDocs(
    query(
      jobsCol(),
      where("orgId", "==", orgId),
      where("status", "==", "completed"),
      orderBy("completedAt", "desc"),
      firestoreLimit(max),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeshyJob);
}

/** Get favorite jobs */
export async function getFavoriteJobs(
  orgId: string,
  max = 50,
): Promise<MeshyJob[]> {
  const snap = await getDocs(
    query(
      jobsCol(),
      where("orgId", "==", orgId),
      where("isFavorite", "==", true),
      orderBy("createdAt", "desc"),
      firestoreLimit(max),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeshyJob);
}

/* ═══════════════════════════════════════
   Assets — CRUD
   ═══════════════════════════════════════ */

export async function createMeshyAsset(
  data: Omit<MeshyAsset, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(assetsCol(), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getMeshyAsset(assetId: string): Promise<MeshyAsset | null> {
  const snap = await getDoc(doc(assetsCol(), assetId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as MeshyAsset;
}

export async function deleteMeshyAsset(assetId: string): Promise<void> {
  await deleteDoc(doc(assetsCol(), assetId));
}

/** Get all assets for a job */
export async function getJobAssets(jobId: string): Promise<MeshyAsset[]> {
  const snap = await getDocs(
    query(assetsCol(), where("jobId", "==", jobId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeshyAsset);
}

/** Get all model assets for an org */
export async function getOrgModelAssets(
  orgId: string,
  max = 50,
): Promise<MeshyAsset[]> {
  const snap = await getDocs(
    query(
      assetsCol(),
      where("orgId", "==", orgId),
      where("assetType", "==", "model"),
      orderBy("createdAt", "desc"),
      firestoreLimit(max),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeshyAsset);
}

/** Delete all assets for a job */
export async function deleteJobAssets(jobId: string): Promise<void> {
  const assets = await getJobAssets(jobId);
  await Promise.all(assets.map((a) => deleteDoc(doc(assetsCol(), a.id))));
}

/* ═══════════════════════════════════════
   Stats
   ═══════════════════════════════════════ */

export async function getOrgMeshyStats(orgId: string): Promise<{
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  totalAssets: number;
}> {
  const [allJobs, assets] = await Promise.all([
    getDocs(query(jobsCol(), where("orgId", "==", orgId))),
    getDocs(query(assetsCol(), where("orgId", "==", orgId))),
  ]);

  let completed = 0;
  let failed = 0;
  let active = 0;
  allJobs.docs.forEach((d) => {
    const s = d.data().status;
    if (s === "completed") completed++;
    else if (s === "failed" || s === "canceled") failed++;
    else active++;
  });

  return {
    totalJobs: allJobs.size,
    completedJobs: completed,
    failedJobs: failed,
    activeJobs: active,
    totalAssets: assets.size,
  };
}
