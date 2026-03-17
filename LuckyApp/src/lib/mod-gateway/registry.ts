/**
 * Mod Gateway — Service Registry (Firestore-backed).
 *
 * Tracks which mod services are registered, their URLs, health status,
 * and metadata. Used by the gateway proxy to route requests.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ModServiceRegistration, ModServiceEntry } from "./types";

const COLLECTION = "modServiceRegistry";

function toEntry(id: string, data: Record<string, unknown>): ModServiceEntry {
  return {
    modId: data.modId as string,
    slug: data.slug as string,
    name: data.name as string,
    version: data.version as string,
    vendor: data.vendor as string,
    description: data.description as string,
    icon: data.icon as string,
    category: data.category as string,
    tags: (data.tags as string[]) ?? [],
    pricing: data.pricing as ModServiceEntry["pricing"],
    requiredKeys: data.requiredKeys as string[] | undefined,
    requires: data.requires as string[] | undefined,
    serviceUrl: data.serviceUrl as string,
    healthEndpoint: data.healthEndpoint as string,
    apiEndpoints: (data.apiEndpoints as ModServiceEntry["apiEndpoints"]) ?? [],
    uiManifest: data.uiManifest as ModServiceEntry["uiManifest"],
    sidebarConfig: data.sidebarConfig as ModServiceEntry["sidebarConfig"],
    status: (data.status as ModServiceEntry["status"]) ?? "active",
    lastHealthCheck: data.lastHealthCheck
      ? data.lastHealthCheck instanceof Timestamp
        ? data.lastHealthCheck.toDate().toISOString()
        : (data.lastHealthCheck as string)
      : null,
    registeredAt: data.registeredAt instanceof Timestamp
      ? data.registeredAt.toDate().toISOString()
      : (data.registeredAt as string) ?? new Date().toISOString(),
    updatedAt: data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate().toISOString()
      : (data.updatedAt as string) ?? new Date().toISOString(),
  };
}

/** Register or update a mod service */
export async function upsertModService(reg: ModServiceRegistration): Promise<void> {
  const ref = doc(db, COLLECTION, reg.slug);
  await setDoc(ref, {
    ...reg,
    status: "active",
    lastHealthCheck: null,
    registeredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Remove a mod service registration */
export async function removeModService(slug: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, slug));
}

/** Get a single mod service by slug */
export async function getModService(slug: string): Promise<ModServiceEntry | null> {
  const snap = await getDoc(doc(db, COLLECTION, slug));
  if (!snap.exists()) return null;
  return toEntry(snap.id, snap.data());
}

/** List all active mod services */
export async function listActiveModServices(): Promise<ModServiceEntry[]> {
  const q = query(collection(db, COLLECTION), where("status", "in", ["active", "degraded"]));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}

/** List ALL mod services (including offline) */
export async function listAllModServices(): Promise<ModServiceEntry[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}

/** Update health status for a mod service */
export async function updateModServiceHealth(
  slug: string,
  status: "active" | "degraded" | "offline",
): Promise<void> {
  const ref = doc(db, COLLECTION, slug);
  await setDoc(ref, {
    status,
    lastHealthCheck: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
