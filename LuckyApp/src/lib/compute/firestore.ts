/**
 * Swarm Compute — Firestore CRUD
 *
 * All Firestore operations for compute collections.
 * Follows the same patterns as src/lib/firestore.ts.
 */

import { db } from "../firebase";
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
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  Workspace,
  Computer,
  ComputerSnapshot,
  ComputerSession,
  ComputerAction,
  ComputeFile,
  ComputeTemplate,
  MemoryEntry,
  EmbedToken,
  UsageRecord,
  ComputerStatus,
  TemplateCategory,
  MemoryScopeType,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Collection Names
// ═══════════════════════════════════════════════════════════════

const COLLECTIONS = {
  workspaces: "computeWorkspaces",
  members: "computeWorkspaceMembers",
  computers: "computeComputers",
  snapshots: "computeSnapshots",
  sessions: "computeSessions",
  actions: "computeActions",
  files: "computeFiles",
  templates: "computeTemplates",
  memory: "computeMemory",
  embedTokens: "computeEmbedTokens",
  usage: "computeUsage",
} as const;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function toDate(val: unknown): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Workspaces
// ═══════════════════════════════════════════════════════════════

export async function createWorkspace(data: Omit<Workspace, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.workspaces), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.workspaces, id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    orgId: d.orgId,
    ownerUserId: d.ownerUserId,
    name: d.name,
    slug: d.slug,
    description: d.description || "",
    planTier: d.planTier || "free",
    defaultAutoStopMinutes: d.defaultAutoStopMinutes ?? 30,
    allowedInstanceSizes: d.allowedInstanceSizes || ["small", "medium", "large", "xl"],
    staticIpEnabled: d.staticIpEnabled ?? false,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export async function getWorkspaces(orgId: string): Promise<Workspace[]> {
  const q = query(collection(db, COLLECTIONS.workspaces), where("orgId", "==", orgId));
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      orgId: d.orgId,
      ownerUserId: d.ownerUserId,
      name: d.name,
      slug: d.slug,
      description: d.description || "",
      planTier: d.planTier || "free",
      defaultAutoStopMinutes: d.defaultAutoStopMinutes ?? 30,
      allowedInstanceSizes: d.allowedInstanceSizes || ["small", "medium", "large", "xl"],
      staticIpEnabled: d.staticIpEnabled ?? false,
      createdAt: toDate(d.createdAt),
      updatedAt: toDate(d.updatedAt),
    };
  });
}

export async function updateWorkspace(id: string, data: Partial<Workspace>): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.workspaces, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.workspaces, id));
}

export function subscribeWorkspaces(orgId: string, cb: (workspaces: Workspace[]) => void): Unsubscribe {
  const q = query(collection(db, COLLECTIONS.workspaces), where("orgId", "==", orgId));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((s) => {
      const d = s.data();
      return {
        id: s.id,
        orgId: d.orgId,
        ownerUserId: d.ownerUserId,
        name: d.name,
        slug: d.slug,
        description: d.description || "",
        planTier: d.planTier || "free",
        defaultAutoStopMinutes: d.defaultAutoStopMinutes ?? 30,
        allowedInstanceSizes: d.allowedInstanceSizes || ["small", "medium", "large", "xl"],
        staticIpEnabled: d.staticIpEnabled ?? false,
        createdAt: toDate(d.createdAt),
        updatedAt: toDate(d.updatedAt),
      };
    });
    cb(items);
  });
}

// ═══════════════════════════════════════════════════════════════
// Computers
// ═══════════════════════════════════════════════════════════════

function parseComputer(id: string, d: Record<string, unknown>): Computer {
  return {
    id,
    workspaceId: d.workspaceId as string,
    orgId: d.orgId as string,
    name: d.name as string,
    status: (d.status as ComputerStatus) || "stopped",
    provider: (d.provider as string) || "stub",
    providerInstanceId: (d.providerInstanceId as string) || null,
    templateId: (d.templateId as string) || null,
    sizeKey: (d.sizeKey as Computer["sizeKey"]) || "small",
    cpuCores: (d.cpuCores as number) || 2,
    ramMb: (d.ramMb as number) || 4096,
    diskGb: (d.diskGb as number) || 20,
    resolutionWidth: (d.resolutionWidth as number) || 1280,
    resolutionHeight: (d.resolutionHeight as number) || 720,
    region: (d.region as Computer["region"]) || "us-east",
    persistenceEnabled: (d.persistenceEnabled as boolean) ?? true,
    staticIpEnabled: (d.staticIpEnabled as boolean) ?? false,
    autoStopMinutes: (d.autoStopMinutes as number) ?? 30,
    controllerType: (d.controllerType as Computer["controllerType"]) || "human",
    modelKey: (d.modelKey as Computer["modelKey"]) || null,
    createdByUserId: (d.createdByUserId as string) || "",
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    lastActiveAt: toDate(d.lastActiveAt),
  };
}

export async function createComputer(data: Omit<Computer, "id" | "createdAt" | "updatedAt" | "lastActiveAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.computers), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getComputer(id: string): Promise<Computer | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.computers, id));
  if (!snap.exists()) return null;
  return parseComputer(snap.id, snap.data());
}

export async function getComputers(orgId: string, filters?: { status?: ComputerStatus; workspaceId?: string }): Promise<Computer[]> {
  let q = query(collection(db, COLLECTIONS.computers), where("orgId", "==", orgId));
  if (filters?.workspaceId) {
    q = query(collection(db, COLLECTIONS.computers), where("orgId", "==", orgId), where("workspaceId", "==", filters.workspaceId));
  }
  const snap = await getDocs(q);
  let items = snap.docs.map((s) => parseComputer(s.id, s.data()));
  if (filters?.status) {
    items = items.filter((c) => c.status === filters.status);
  }
  return items;
}

export async function getComputersByWorkspace(workspaceId: string): Promise<Computer[]> {
  const q = query(collection(db, COLLECTIONS.computers), where("workspaceId", "==", workspaceId));
  const snap = await getDocs(q);
  return snap.docs.map((s) => parseComputer(s.id, s.data()));
}

export async function updateComputer(id: string, data: Partial<Computer>): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.computers, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComputer(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.computers, id));
}

export function subscribeComputers(orgId: string, cb: (computers: Computer[]) => void): Unsubscribe {
  const q = query(collection(db, COLLECTIONS.computers), where("orgId", "==", orgId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((s) => parseComputer(s.id, s.data())));
  });
}

// ═══════════════════════════════════════════════════════════════
// Snapshots
// ═══════════════════════════════════════════════════════════════

export async function createSnapshot(data: Omit<ComputerSnapshot, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.snapshots), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getSnapshots(computerId: string): Promise<ComputerSnapshot[]> {
  const q = query(collection(db, COLLECTIONS.snapshots), where("computerId", "==", computerId));
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      computerId: d.computerId,
      providerSnapshotId: d.providerSnapshotId,
      label: d.label || "",
      createdAt: toDate(d.createdAt),
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// Sessions
// ═══════════════════════════════════════════════════════════════

function parseSession(id: string, d: Record<string, unknown>): ComputerSession {
  return {
    id,
    computerId: d.computerId as string,
    workspaceId: d.workspaceId as string,
    controllerType: (d.controllerType as ComputerSession["controllerType"]) || "human",
    userId: (d.userId as string) || null,
    modelKey: (d.modelKey as ComputerSession["modelKey"]) || null,
    startedAt: toDate(d.startedAt),
    endedAt: toDate(d.endedAt),
    totalActions: (d.totalActions as number) || 0,
    totalScreenshots: (d.totalScreenshots as number) || 0,
    recordingUrl: (d.recordingUrl as string) || null,
    estimatedCostCents: (d.estimatedCostCents as number) || 0,
  };
}

export async function createSession(data: Omit<ComputerSession, "id" | "startedAt" | "endedAt" | "totalActions" | "totalScreenshots" | "estimatedCostCents">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.sessions), {
    ...data,
    startedAt: serverTimestamp(),
    endedAt: null,
    totalActions: 0,
    totalScreenshots: 0,
    estimatedCostCents: 0,
  });
  return ref.id;
}

export async function getSession(id: string): Promise<ComputerSession | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.sessions, id));
  if (!snap.exists()) return null;
  return parseSession(snap.id, snap.data());
}

export async function getSessions(opts: { computerId?: string; workspaceId?: string; limit?: number }): Promise<ComputerSession[]> {
  const constraints = [];
  if (opts.computerId) constraints.push(where("computerId", "==", opts.computerId));
  if (opts.workspaceId) constraints.push(where("workspaceId", "==", opts.workspaceId));
  const q = query(
    collection(db, COLLECTIONS.sessions),
    ...constraints,
    orderBy("startedAt", "desc"),
    firestoreLimit(opts.limit || 50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => parseSession(s.id, s.data()));
}

export async function endSession(id: string, stats: { totalActions: number; totalScreenshots: number; estimatedCostCents: number }): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.sessions, id), {
    endedAt: serverTimestamp(),
    ...stats,
  });
}

// ═══════════════════════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════════════════════

export async function recordAction(data: Omit<ComputerAction, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.actions), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getActions(sessionId: string, max?: number): Promise<ComputerAction[]> {
  const q = query(
    collection(db, COLLECTIONS.actions),
    where("sessionId", "==", sessionId),
    orderBy("createdAt", "desc"),
    firestoreLimit(max || 100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      sessionId: d.sessionId,
      computerId: d.computerId,
      actionType: d.actionType,
      payload: d.payload || {},
      result: d.result || null,
      status: d.status || "pending",
      createdAt: toDate(d.createdAt),
    };
  });
}

export async function updateAction(id: string, data: Partial<ComputerAction>): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.actions, id), rest);
}

// ═══════════════════════════════════════════════════════════════
// Files
// ═══════════════════════════════════════════════════════════════

export async function createFileRecord(data: Omit<ComputeFile, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.files), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getFiles(workspaceId: string, computerId?: string): Promise<ComputeFile[]> {
  const constraints = [where("workspaceId", "==", workspaceId)];
  if (computerId) constraints.push(where("computerId", "==", computerId));
  const q = query(collection(db, COLLECTIONS.files), ...constraints, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      workspaceId: d.workspaceId,
      computerId: d.computerId || null,
      uploaderUserId: d.uploaderUserId,
      storageKey: d.storageKey,
      filename: d.filename,
      mimeType: d.mimeType || "application/octet-stream",
      sizeBytes: d.sizeBytes || 0,
      visibility: d.visibility || "private",
      provenanceType: d.provenanceType || "upload",
      createdAt: toDate(d.createdAt),
    };
  });
}

export async function deleteFileRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.files, id));
}

// ═══════════════════════════════════════════════════════════════
// Templates
// ═══════════════════════════════════════════════════════════════

function parseTemplate(id: string, d: Record<string, unknown>): ComputeTemplate {
  return {
    id,
    workspaceId: (d.workspaceId as string) || null,
    creatorUserId: d.creatorUserId as string,
    name: d.name as string,
    slug: (d.slug as string) || "",
    description: (d.description as string) || "",
    category: (d.category as TemplateCategory) || "dev",
    baseImage: (d.baseImage as string) || "ubuntu:22.04",
    installManifest: (d.installManifest as Record<string, unknown>) || {},
    startupScript: (d.startupScript as string) || "",
    requiredSecrets: (d.requiredSecrets as string[]) || [],
    recommendedModels: (d.recommendedModels as ComputeTemplate["recommendedModels"]) || [],
    isPublic: (d.isPublic as boolean) ?? false,
    paidModReady: (d.paidModReady as boolean) ?? false,
    futurePriceCents: (d.futurePriceCents as number) ?? null,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export async function createTemplate(data: Omit<ComputeTemplate, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.templates), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getTemplate(id: string): Promise<ComputeTemplate | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.templates, id));
  if (!snap.exists()) return null;
  return parseTemplate(snap.id, snap.data());
}

export async function getTemplates(opts?: { workspaceId?: string; category?: TemplateCategory; isPublic?: boolean }): Promise<ComputeTemplate[]> {
  const constraints = [];
  if (opts?.workspaceId) constraints.push(where("workspaceId", "==", opts.workspaceId));
  if (opts?.category) constraints.push(where("category", "==", opts.category));
  if (opts?.isPublic !== undefined) constraints.push(where("isPublic", "==", opts.isPublic));
  const q = constraints.length > 0
    ? query(collection(db, COLLECTIONS.templates), ...constraints)
    : query(collection(db, COLLECTIONS.templates));
  const snap = await getDocs(q);
  return snap.docs.map((s) => parseTemplate(s.id, s.data()));
}

export async function updateTemplate(id: string, data: Partial<ComputeTemplate>): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.templates, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.templates, id));
}

// ═══════════════════════════════════════════════════════════════
// Memory
// ═══════════════════════════════════════════════════════════════

function parseMemory(id: string, d: Record<string, unknown>): MemoryEntry {
  return {
    id,
    scopeType: (d.scopeType as MemoryScopeType) || "workspace",
    scopeId: d.scopeId as string,
    workspaceId: (d.workspaceId as string) || null,
    computerId: (d.computerId as string) || null,
    agentId: (d.agentId as string) || null,
    createdByUserId: (d.createdByUserId as string) || null,
    content: (d.content as string) || "",
    embeddingRef: (d.embeddingRef as string) || null,
    tags: (d.tags as string[]) || [],
    pinned: (d.pinned as boolean) ?? false,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export async function createMemoryEntry(data: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.memory), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getMemoryEntries(scopeType: MemoryScopeType, scopeId: string, opts?: { pinned?: boolean; limit?: number }): Promise<MemoryEntry[]> {
  const constraints = [
    where("scopeType", "==", scopeType),
    where("scopeId", "==", scopeId),
  ];
  if (opts?.pinned !== undefined) constraints.push(where("pinned", "==", opts.pinned));
  const q = query(
    collection(db, COLLECTIONS.memory),
    ...constraints,
    orderBy("createdAt", "desc"),
    firestoreLimit(opts?.limit || 100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => parseMemory(s.id, s.data()));
}

export async function updateMemoryEntry(id: string, data: Partial<MemoryEntry>): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.memory, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMemoryEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.memory, id));
}

// ═══════════════════════════════════════════════════════════════
// Embed Tokens
// ═══════════════════════════════════════════════════════════════

export async function createEmbedToken(data: Omit<EmbedToken, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.embedTokens), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getEmbedTokens(workspaceId: string): Promise<EmbedToken[]> {
  const q = query(collection(db, COLLECTIONS.embedTokens), where("workspaceId", "==", workspaceId));
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      workspaceId: d.workspaceId,
      computerId: d.computerId,
      mode: d.mode || "read_only",
      allowedOrigins: d.allowedOrigins || [],
      expiresAt: toDate(d.expiresAt),
      createdByUserId: d.createdByUserId,
      createdAt: toDate(d.createdAt),
    };
  });
}

export async function deleteEmbedToken(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.embedTokens, id));
}

export async function validateEmbedToken(id: string): Promise<EmbedToken | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.embedTokens, id));
  if (!snap.exists()) return null;
  const d = snap.data();
  const token: EmbedToken = {
    id: snap.id,
    workspaceId: d.workspaceId,
    computerId: d.computerId,
    mode: d.mode || "read_only",
    allowedOrigins: d.allowedOrigins || [],
    expiresAt: toDate(d.expiresAt),
    createdByUserId: d.createdByUserId,
    createdAt: toDate(d.createdAt),
  };
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return null;
  return token;
}

// ═══════════════════════════════════════════════════════════════
// Usage
// ═══════════════════════════════════════════════════════════════

export async function recordUsage(data: Omit<UsageRecord, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.usage), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUsage(workspaceId: string, opts?: { limit?: number }): Promise<UsageRecord[]> {
  const q = query(
    collection(db, COLLECTIONS.usage),
    where("workspaceId", "==", workspaceId),
    orderBy("createdAt", "desc"),
    firestoreLimit(opts?.limit || 100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      workspaceId: d.workspaceId,
      computerId: d.computerId || null,
      metricType: d.metricType,
      quantity: d.quantity || 0,
      periodStart: toDate(d.periodStart),
      periodEnd: toDate(d.periodEnd),
      estimatedCostCents: d.estimatedCostCents || 0,
      createdAt: toDate(d.createdAt),
    };
  });
}
