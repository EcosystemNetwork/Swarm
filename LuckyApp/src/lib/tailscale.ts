/**
 * Tailscale VPN Integration
 *
 * Register devices on Tailscale network and whitelist IPs for secure agent connections.
 * Provides IP-based access control for hub connections.
 */

import { db } from "./firebase";
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
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { logActivity } from "./activity";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TailscaleDevice {
  id: string;
  orgId: string;
  deviceId: string; // Tailscale device ID
  deviceName: string;
  tailscaleIp: string; // 100.x.x.x
  publicIp?: string;
  agentId?: string;
  agentName?: string;
  status: "active" | "inactive" | "revoked";
  connectedAt: Date | null;
  lastSeenAt?: Date | null;
  os?: string;
  hostname?: string;
  tags?: string[];
}

export interface TailscaleConfig {
  enabled: boolean;
  apiKey?: string;
  tailnet?: string; // Organization tailnet name
  whitelistMode: "disabled" | "warn" | "enforce";
}

// ═══════════════════════════════════════════════════════════════
// IP Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Check if an IP address is a valid Tailscale IP (100.x.x.x range)
 */
export function isTailscaleIP(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const first = parseInt(parts[0], 10);
  return first === 100;
}

/**
 * Normalize IP address (remove ::ffff: prefix if present)
 */
export function normalizeIP(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }
  return ip;
}

/**
 * Check if an IP is whitelisted in Tailscale devices
 */
export async function isIPWhitelisted(
  orgId: string,
  ip: string
): Promise<boolean> {
  const normalizedIP = normalizeIP(ip);

  const q = query(
    collection(db, "tailscaleDevices"),
    where("orgId", "==", orgId),
    where("status", "==", "active")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.some((doc) => {
    const device = doc.data() as TailscaleDevice;
    return (
      device.tailscaleIp === normalizedIP ||
      device.publicIp === normalizedIP
    );
  });
}

// ═══════════════════════════════════════════════════════════════
// Device Management
// ═══════════════════════════════════════════════════════════════

/**
 * Register a Tailscale device
 */
export async function registerTailscaleDevice(
  orgId: string,
  deviceData: {
    deviceId: string;
    deviceName: string;
    tailscaleIp: string;
    publicIp?: string;
    agentId?: string;
    agentName?: string;
    os?: string;
    hostname?: string;
    tags?: string[];
  },
  registeredBy: string
): Promise<string> {
  // Validate Tailscale IP
  if (!isTailscaleIP(deviceData.tailscaleIp)) {
    throw new Error(
      `Invalid Tailscale IP: ${deviceData.tailscaleIp}. Must be in 100.x.x.x range.`
    );
  }

  // Check if device already exists
  const existing = await findDeviceByTailscaleIP(orgId, deviceData.tailscaleIp);
  if (existing) {
    throw new Error(
      `Device with Tailscale IP ${deviceData.tailscaleIp} already registered`
    );
  }

  const device = {
    orgId,
    ...deviceData,
    status: "active" as const,
    connectedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "tailscaleDevices"), device);

  // Log activity
  await logActivity(
    orgId,
    registeredBy,
    registeredBy,
    "config.changed",
    {
      action: "tailscale_device_registered",
      deviceName: deviceData.deviceName,
      tailscaleIp: deviceData.tailscaleIp,
    }
  );

  return ref.id;
}

/**
 * Find device by Tailscale IP
 */
async function findDeviceByTailscaleIP(
  orgId: string,
  tailscaleIp: string
): Promise<TailscaleDevice | null> {
  const q = query(
    collection(db, "tailscaleDevices"),
    where("orgId", "==", orgId),
    where("tailscaleIp", "==", tailscaleIp)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
    connectedAt: doc.data().connectedAt instanceof Timestamp
      ? doc.data().connectedAt.toDate()
      : null,
    lastSeenAt: doc.data().lastSeenAt instanceof Timestamp
      ? doc.data().lastSeenAt.toDate()
      : null,
  } as TailscaleDevice;
}

/**
 * Get all Tailscale devices for an organization
 */
export async function getTailscaleDevices(
  orgId: string
): Promise<TailscaleDevice[]> {
  const q = query(
    collection(db, "tailscaleDevices"),
    where("orgId", "==", orgId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      orgId: data.orgId,
      deviceId: data.deviceId,
      deviceName: data.deviceName,
      tailscaleIp: data.tailscaleIp,
      publicIp: data.publicIp,
      agentId: data.agentId,
      agentName: data.agentName,
      status: data.status || "active",
      connectedAt: data.connectedAt instanceof Timestamp ? data.connectedAt.toDate() : null,
      lastSeenAt: data.lastSeenAt instanceof Timestamp ? data.lastSeenAt.toDate() : null,
      os: data.os,
      hostname: data.hostname,
      tags: data.tags || [],
    } as TailscaleDevice;
  });
}

/**
 * Update device last seen timestamp
 */
export async function updateDeviceLastSeen(
  deviceId: string,
  tailscaleIp: string
): Promise<void> {
  const deviceDoc = await getDoc(doc(db, "tailscaleDevices", deviceId));

  if (deviceDoc.exists()) {
    await updateDoc(doc(db, "tailscaleDevices", deviceId), {
      lastSeenAt: serverTimestamp(),
    });
  }
}

/**
 * Revoke a Tailscale device
 */
export async function revokeTailscaleDevice(
  deviceId: string,
  orgId: string,
  revokedBy: string
): Promise<void> {
  const deviceDoc = await getDoc(doc(db, "tailscaleDevices", deviceId));

  if (!deviceDoc.exists()) {
    throw new Error("Device not found");
  }

  const device = { id: deviceDoc.id, ...deviceDoc.data() } as TailscaleDevice;

  if (device.orgId !== orgId) {
    throw new Error("Device does not belong to this organization");
  }

  await updateDoc(doc(db, "tailscaleDevices", deviceId), {
    status: "revoked",
  });

  // Log activity
  await logActivity(orgId, revokedBy, revokedBy, "config.changed", {
    action: "tailscale_device_revoked",
    deviceName: device.deviceName,
    tailscaleIp: device.tailscaleIp,
  });
}

/**
 * Delete a Tailscale device
 */
export async function deleteTailscaleDevice(
  deviceId: string,
  orgId: string,
  deletedBy: string
): Promise<void> {
  const deviceDoc = await getDoc(doc(db, "tailscaleDevices", deviceId));

  if (!deviceDoc.exists()) {
    throw new Error("Device not found");
  }

  const device = { id: deviceDoc.id, ...deviceDoc.data() } as TailscaleDevice;

  if (device.orgId !== orgId) {
    throw new Error("Device does not belong to this organization");
  }

  await deleteDoc(doc(db, "tailscaleDevices", deviceId));

  // Log activity
  await logActivity(orgId, deletedBy, deletedBy, "config.changed", {
    action: "tailscale_device_deleted",
    deviceName: device.deviceName,
    tailscaleIp: device.tailscaleIp,
  });
}
