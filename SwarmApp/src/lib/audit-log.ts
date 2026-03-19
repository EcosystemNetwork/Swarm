/**
 * Marketplace Audit Log
 *
 * Thin Firestore helper for recording and querying admin actions
 * in the `marketplaceAuditLog` collection.
 */

import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const AUDIT_COLLECTION = "marketplaceAuditLog";

export interface AuditEntry {
  id?: string;
  action: string; // e.g. "submission.approved", "listing.suspended", "publisher.banned"
  performedBy: string; // admin wallet address
  targetType: "submission" | "listing" | "publisher" | "report" | "mod_service" | "settings" | "ranking" | "transaction";
  targetId: string;
  metadata?: Record<string, unknown>;
  timestamp?: { seconds: number; nanoseconds: number };
}

/** Record an audit entry. Returns the new document ID. */
export async function recordAuditEntry(
  entry: Omit<AuditEntry, "id" | "timestamp">,
): Promise<string> {
  const ref = await addDoc(collection(db, AUDIT_COLLECTION), {
    ...entry,
    timestamp: serverTimestamp(),
  });
  return ref.id;
}

/** Query the audit log with optional filters. */
export async function getAuditLog(opts: {
  limit?: number;
  action?: string;
  targetId?: string;
  targetType?: AuditEntry["targetType"];
}): Promise<AuditEntry[]> {
  const constraints: Parameters<typeof query>[1][] = [];

  if (opts.action) {
    constraints.push(where("action", "==", opts.action));
  }
  if (opts.targetId) {
    constraints.push(where("targetId", "==", opts.targetId));
  }
  if (opts.targetType) {
    constraints.push(where("targetType", "==", opts.targetType));
  }

  constraints.push(orderBy("timestamp", "desc"));
  constraints.push(firestoreLimit(opts.limit || 50));

  const q = query(collection(db, AUDIT_COLLECTION), ...constraints);
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as AuditEntry[];
}
