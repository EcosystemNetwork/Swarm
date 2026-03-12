/**
 * System Resource Vitals Collector
 *
 * Auto-collect and monitor CPU, memory, and disk usage from agents.
 * Alerts on threshold violations (warning/critical levels).
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface AgentVitals {
  cpu: number; // Percentage (0-100)
  memory: number; // Percentage (0-100)
  disk: number; // Percentage (0-100)
  memoryUsedMB?: number;
  memoryTotalMB?: number;
  diskUsedGB?: number;
  diskTotalGB?: number;
}

export interface VitalsRecord {
  id: string;
  orgId: string;
  agentId: string;
  agentName?: string;
  vitals: AgentVitals;
  timestamp: Date | null;
}

export interface VitalAlert {
  id: string;
  orgId: string;
  agentId: string;
  agentName?: string;
  resource: "cpu" | "memory" | "disk";
  threshold: number;
  currentValue: number;
  severity: "warning" | "critical";
  timestamp: Date | null;
  resolved: boolean;
  resolvedAt?: Date | null;
}

export interface VitalsThresholds {
  cpu: { warning: number; critical: number };
  memory: { warning: number; critical: number };
  disk: { warning: number; critical: number };
}

// Default thresholds
export const DEFAULT_THRESHOLDS: VitalsThresholds = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 75, critical: 90 },
  disk: { warning: 80, critical: 95 },
};

// ═══════════════════════════════════════════════════════════════
// Recording Vitals
// ═══════════════════════════════════════════════════════════════

export async function recordVitals(
  orgId: string,
  agentId: string,
  vitals: AgentVitals,
  agentName?: string
): Promise<string> {
  const ref = await addDoc(collection(db, "agentVitals"), {
    orgId,
    agentId,
    agentName: agentName || agentId,
    vitals,
    timestamp: serverTimestamp(),
  });

  // Check for threshold violations
  await checkThresholds(orgId, agentId, vitals, agentName);

  return ref.id;
}

// ═══════════════════════════════════════════════════════════════
// Threshold Monitoring
// ═══════════════════════════════════════════════════════════════

async function checkThresholds(
  orgId: string,
  agentId: string,
  vitals: AgentVitals,
  agentName?: string
): Promise<void> {
  const thresholds = DEFAULT_THRESHOLDS;

  // Check CPU
  if (vitals.cpu >= thresholds.cpu.critical) {
    await createAlert(
      orgId,
      agentId,
      "cpu",
      thresholds.cpu.critical,
      vitals.cpu,
      "critical",
      agentName
    );
  } else if (vitals.cpu >= thresholds.cpu.warning) {
    await createAlert(
      orgId,
      agentId,
      "cpu",
      thresholds.cpu.warning,
      vitals.cpu,
      "warning",
      agentName
    );
  }

  // Check Memory
  if (vitals.memory >= thresholds.memory.critical) {
    await createAlert(
      orgId,
      agentId,
      "memory",
      thresholds.memory.critical,
      vitals.memory,
      "critical",
      agentName
    );
  } else if (vitals.memory >= thresholds.memory.warning) {
    await createAlert(
      orgId,
      agentId,
      "memory",
      thresholds.memory.warning,
      vitals.memory,
      "warning",
      agentName
    );
  }

  // Check Disk
  if (vitals.disk >= thresholds.disk.critical) {
    await createAlert(
      orgId,
      agentId,
      "disk",
      thresholds.disk.critical,
      vitals.disk,
      "critical",
      agentName
    );
  } else if (vitals.disk >= thresholds.disk.warning) {
    await createAlert(
      orgId,
      agentId,
      "disk",
      thresholds.disk.warning,
      vitals.disk,
      "warning",
      agentName
    );
  }
}

async function createAlert(
  orgId: string,
  agentId: string,
  resource: "cpu" | "memory" | "disk",
  threshold: number,
  currentValue: number,
  severity: "warning" | "critical",
  agentName?: string
): Promise<void> {
  // Check if alert already exists for this resource
  const existingQ = query(
    collection(db, "vitalAlerts"),
    where("orgId", "==", orgId),
    where("agentId", "==", agentId),
    where("resource", "==", resource),
    where("resolved", "==", false)
  );

  const existingSnap = await getDocs(existingQ);

  if (!existingSnap.empty) {
    // Update existing alert
    const alertDoc = existingSnap.docs[0];
    await setDoc(
      doc(db, "vitalAlerts", alertDoc.id),
      {
        currentValue,
        severity,
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    // Create new alert
    await addDoc(collection(db, "vitalAlerts"), {
      orgId,
      agentId,
      agentName: agentName || agentId,
      resource,
      threshold,
      currentValue,
      severity,
      timestamp: serverTimestamp(),
      resolved: false,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Retrieval
// ═══════════════════════════════════════════════════════════════

export async function getVitalsHistory(
  agentId: string,
  hoursBack: number = 24
): Promise<VitalsRecord[]> {
  const since = new Date();
  since.setHours(since.getHours() - hoursBack);

  const q = query(
    collection(db, "agentVitals"),
    where("agentId", "==", agentId),
    where("timestamp", ">=", Timestamp.fromDate(since)),
    orderBy("timestamp", "asc"),
    firestoreLimit(1000)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      orgId: data.orgId,
      agentId: data.agentId,
      agentName: data.agentName,
      vitals: data.vitals,
      timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null,
    };
  });
}

export async function getAllVitalsHistory(
  orgId: string,
  hoursBack: number = 24
): Promise<VitalsRecord[]> {
  const since = new Date();
  since.setHours(since.getHours() - hoursBack);

  const q = query(
    collection(db, "agentVitals"),
    where("orgId", "==", orgId),
    where("timestamp", ">=", Timestamp.fromDate(since)),
    orderBy("timestamp", "desc"),
    firestoreLimit(5000)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      orgId: data.orgId,
      agentId: data.agentId,
      agentName: data.agentName,
      vitals: data.vitals,
      timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null,
    };
  });
}

export async function getLatestVitals(agentId: string): Promise<VitalsRecord | null> {
  const q = query(
    collection(db, "agentVitals"),
    where("agentId", "==", agentId),
    orderBy("timestamp", "desc"),
    firestoreLimit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    orgId: data.orgId,
    agentId: data.agentId,
    agentName: data.agentName,
    vitals: data.vitals,
    timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Alerts
// ═══════════════════════════════════════════════════════════════

export async function getActiveAlerts(orgId: string): Promise<VitalAlert[]> {
  const q = query(
    collection(db, "vitalAlerts"),
    where("orgId", "==", orgId),
    where("resolved", "==", false),
    orderBy("timestamp", "desc")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      orgId: data.orgId,
      agentId: data.agentId,
      agentName: data.agentName,
      resource: data.resource,
      threshold: data.threshold,
      currentValue: data.currentValue,
      severity: data.severity,
      timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null,
      resolved: data.resolved,
      resolvedAt: data.resolvedAt instanceof Timestamp ? data.resolvedAt.toDate() : null,
    };
  });
}

export async function getAlertHistory(
  orgId: string,
  limit: number = 100
): Promise<VitalAlert[]> {
  const q = query(
    collection(db, "vitalAlerts"),
    where("orgId", "==", orgId),
    orderBy("timestamp", "desc"),
    firestoreLimit(limit)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      orgId: data.orgId,
      agentId: data.agentId,
      agentName: data.agentName,
      resource: data.resource,
      threshold: data.threshold,
      currentValue: data.currentValue,
      severity: data.severity,
      timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null,
      resolved: data.resolved,
      resolvedAt: data.resolvedAt instanceof Timestamp ? data.resolvedAt.toDate() : null,
    };
  });
}

export async function resolveAlert(alertId: string): Promise<void> {
  await setDoc(
    doc(db, "vitalAlerts", alertId),
    {
      resolved: true,
      resolvedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function resolveAllAlerts(orgId: string, agentId: string): Promise<void> {
  const q = query(
    collection(db, "vitalAlerts"),
    where("orgId", "==", orgId),
    where("agentId", "==", agentId),
    where("resolved", "==", false)
  );

  const snap = await getDocs(q);
  const updates = snap.docs.map((d) =>
    setDoc(
      doc(db, "vitalAlerts", d.id),
      { resolved: true, resolvedAt: serverTimestamp() },
      { merge: true }
    )
  );

  await Promise.all(updates);
}

// ═══════════════════════════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════════════════════════

export interface VitalsStats {
  avgCpu: number;
  avgMemory: number;
  avgDisk: number;
  maxCpu: number;
  maxMemory: number;
  maxDisk: number;
  recordCount: number;
}

export function calculateVitalsStats(records: VitalsRecord[]): VitalsStats {
  if (records.length === 0) {
    return {
      avgCpu: 0,
      avgMemory: 0,
      avgDisk: 0,
      maxCpu: 0,
      maxMemory: 0,
      maxDisk: 0,
      recordCount: 0,
    };
  }

  const cpuValues = records.map((r) => r.vitals.cpu);
  const memoryValues = records.map((r) => r.vitals.memory);
  const diskValues = records.map((r) => r.vitals.disk);

  return {
    avgCpu: cpuValues.reduce((sum, v) => sum + v, 0) / cpuValues.length,
    avgMemory: memoryValues.reduce((sum, v) => sum + v, 0) / memoryValues.length,
    avgDisk: diskValues.reduce((sum, v) => sum + v, 0) / diskValues.length,
    maxCpu: Math.max(...cpuValues),
    maxMemory: Math.max(...memoryValues),
    maxDisk: Math.max(...diskValues),
    recordCount: records.length,
  };
}
