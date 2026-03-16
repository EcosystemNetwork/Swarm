/**
 * Mod Sessions & Run Logs — Firestore CRUD
 *
 * Separate collections for mod-specific session tracking and execution logs.
 * Distinct from compute sessions (which handle billing/metering).
 */

import { db } from "../firebase";
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
  limit as firestoreLimit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { ModRunEvent } from "./types";

// ═══════════════════════════════════════════════════════════════
// Collections
// ═══════════════════════════════════════════════════════════════

const COLLECTIONS = {
  sessions: "modSessions",
  runLogs: "modRunLogs",
} as const;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ModSessionRecord {
  id: string;
  modId: string;
  userId: string;
  task?: string;
  computerId?: string;
  status: "idle" | "analyzing" | "planning" | "executing" | "complete" | "error";
  events: ModRunEvent[];
  summary?: string;
  createdAt: Date | null;
  endedAt: Date | null;
}

export interface ModRunLogRecord {
  id: string;
  modId: string;
  userId: string;
  sessionId: string;
  goal: string;
  status: "success" | "partial" | "failed";
  stepCount: number;
  durationMs: number;
  computerId?: string;
  createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === "object" && typeof (val as { toDate?: unknown }).toDate === "function") {
    return (val as { toDate(): Date }).toDate();
  }
  if (typeof val === "number" || typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Mod Sessions
// ═══════════════════════════════════════════════════════════════

export async function createModSession(data: {
  modId: string;
  userId: string;
  task?: string;
  computerId?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.sessions), {
    ...data,
    status: "idle",
    events: [],
    createdAt: serverTimestamp(),
    endedAt: null,
  });
  return ref.id;
}

export async function getModSession(id: string): Promise<ModSessionRecord | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.sessions, id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    modId: d.modId,
    userId: d.userId,
    task: d.task,
    computerId: d.computerId,
    status: d.status || "idle",
    events: d.events || [],
    summary: d.summary,
    createdAt: toDate(d.createdAt),
    endedAt: toDate(d.endedAt),
  };
}

export async function updateModSession(
  id: string,
  data: Partial<Pick<ModSessionRecord, "status" | "events" | "task" | "computerId">>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.sessions, id), data);
}

export async function endModSession(id: string, summary: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.sessions, id), {
    status: "complete",
    summary,
    endedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════
// Mod Run Logs
// ═══════════════════════════════════════════════════════════════

export async function addModRunLog(data: {
  modId: string;
  userId: string;
  sessionId: string;
  goal: string;
  status: "success" | "partial" | "failed";
  stepCount: number;
  durationMs: number;
  computerId?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.runLogs), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getModRunLogs(
  modId: string,
  userId: string,
  max: number = 20,
): Promise<ModRunLogRecord[]> {
  const q = query(
    collection(db, COLLECTIONS.runLogs),
    where("modId", "==", modId),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    firestoreLimit(Math.min(max, 50)),
  );
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      modId: d.modId,
      userId: d.userId,
      sessionId: d.sessionId,
      goal: d.goal,
      status: d.status,
      stepCount: d.stepCount,
      durationMs: d.durationMs,
      computerId: d.computerId,
      createdAt: toDate(d.createdAt),
    };
  });
}
