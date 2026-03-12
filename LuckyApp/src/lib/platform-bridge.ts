/**
 * Platform Bridge — Unified Interface for Multi-Platform Messaging
 *
 * Connects Telegram, Discord, and Slack to Swarm channels.
 * Enables agents to send/receive messages across all platforms.
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { encryptValue, decryptValue } from "./secrets";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type PlatformType = "native" | "telegram" | "discord" | "slack";

export interface PlatformConnection {
  id: string;
  orgId: string;
  platform: "telegram" | "discord" | "slack";
  /** Encrypted bot token or OAuth credentials (AES-256-GCM) */
  credentials: string;
  /** Initialization vector for AES-256-GCM decryption */
  credentialsIV: string;
  webhookUrl?: string;
  connectedAt: Date | null;
  active: boolean;
  metadata?: {
    botUsername?: string;
    botId?: string;
    guildId?: string;
    teamId?: string;
  };
}

export interface BridgedChannel {
  id: string;
  orgId: string;
  swarmChannelId: string;
  platformType: PlatformType;
  platformChannelId: string;
  platformMetadata?: {
    chatId?: string | number; // Telegram
    channelName?: string; // All platforms
    guildId?: string; // Discord
    teamId?: string; // Slack
  };
  createdAt: Date | null;
}

export interface BridgedMessage {
  id: string;
  swarmMessageId?: string;
  platformMessageId: string;
  channelId: string;
  platform: PlatformType;
  senderId: string;
  senderName: string;
  content: string;
  attachments?: Array<{
    url: string;
    type: string;
    name: string;
  }>;
  timestamp: Date | null;
  direction: "inbound" | "outbound";
}

// ═══════════════════════════════════════════════════════════════
// Platform Connection Management
// ═══════════════════════════════════════════════════════════════

export async function createPlatformConnection(
  orgId: string,
  platform: "telegram" | "discord" | "slack",
  credentials: string,
  masterSecret: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  // Encrypt credentials before storage (AES-256-GCM)
  const { encryptedValue, iv } = encryptValue(credentials, orgId, masterSecret);

  const ref = await addDoc(collection(db, "platformConnections"), {
    orgId,
    platform,
    credentials: encryptedValue,
    credentialsIV: iv,
    webhookUrl: "",
    connectedAt: serverTimestamp(),
    active: true,
    metadata: metadata || {},
  });
  return ref.id;
}

export async function getPlatformConnection(
  orgId: string,
  platform: "telegram" | "discord" | "slack",
  masterSecret: string
): Promise<PlatformConnection | null> {
  const q = query(
    collection(db, "platformConnections"),
    where("orgId", "==", orgId),
    where("platform", "==", platform),
    where("active", "==", true)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data();

  // Decrypt credentials before returning
  const decryptedCredentials = decryptValue(
    data.credentials,
    data.credentialsIV,
    orgId,
    masterSecret
  );

  return {
    id: doc.id,
    orgId: data.orgId,
    platform: data.platform,
    credentials: decryptedCredentials,
    credentialsIV: data.credentialsIV,
    webhookUrl: data.webhookUrl,
    connectedAt: data.connectedAt?.toDate() || null,
    active: data.active,
    metadata: data.metadata,
  };
}

export async function getAllPlatformConnections(
  orgId: string,
  masterSecret: string
): Promise<PlatformConnection[]> {
  const q = query(
    collection(db, "platformConnections"),
    where("orgId", "==", orgId),
    where("active", "==", true)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();

    // Decrypt credentials before returning
    const decryptedCredentials = decryptValue(
      data.credentials,
      data.credentialsIV,
      orgId,
      masterSecret
    );

    return {
      id: d.id,
      orgId: data.orgId,
      platform: data.platform,
      credentials: decryptedCredentials,
      credentialsIV: data.credentialsIV,
      webhookUrl: data.webhookUrl,
      connectedAt: data.connectedAt?.toDate() || null,
      active: data.active,
      metadata: data.metadata,
    };
  });
}

export async function deactivatePlatformConnection(connectionId: string): Promise<void> {
  await setDoc(
    doc(db, "platformConnections", connectionId),
    { active: false },
    { merge: true }
  );
}

// ═══════════════════════════════════════════════════════════════
// Channel Bridging
// ═══════════════════════════════════════════════════════════════

export async function bridgeChannel(
  orgId: string,
  swarmChannelId: string,
  platformType: PlatformType,
  platformChannelId: string,
  platformMetadata?: Record<string, unknown>
): Promise<string> {
  const ref = await addDoc(collection(db, "bridgedChannels"), {
    orgId,
    swarmChannelId,
    platformType,
    platformChannelId,
    platformMetadata: platformMetadata || {},
    createdAt: serverTimestamp(),
  });

  // Update Swarm channel to indicate it's bridged
  await setDoc(
    doc(db, "channels", swarmChannelId),
    {
      platformType,
      platformChannelId,
      platformMetadata: platformMetadata || {},
    },
    { merge: true }
  );

  return ref.id;
}

export async function getBridgedChannel(
  swarmChannelId: string
): Promise<BridgedChannel | null> {
  const q = query(
    collection(db, "bridgedChannels"),
    where("swarmChannelId", "==", swarmChannelId)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    orgId: data.orgId,
    swarmChannelId: data.swarmChannelId,
    platformType: data.platformType,
    platformChannelId: data.platformChannelId,
    platformMetadata: data.platformMetadata,
    createdAt: data.createdAt?.toDate() || null,
  };
}

export async function getBridgedChannelByPlatform(
  platform: PlatformType,
  platformChannelId: string
): Promise<BridgedChannel | null> {
  const q = query(
    collection(db, "bridgedChannels"),
    where("platformType", "==", platform),
    where("platformChannelId", "==", platformChannelId)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    orgId: data.orgId,
    swarmChannelId: data.swarmChannelId,
    platformType: data.platformType,
    platformChannelId: data.platformChannelId,
    platformMetadata: data.platformMetadata,
    createdAt: data.createdAt?.toDate() || null,
  };
}

export async function unbridgeChannel(bridgeId: string): Promise<void> {
  // TODO: Also update the Swarm channel to remove platform fields
  await setDoc(
    doc(db, "bridgedChannels", bridgeId),
    { active: false },
    { merge: true }
  );
}

// ═══════════════════════════════════════════════════════════════
// Message Bridging
// ═══════════════════════════════════════════════════════════════

export async function logBridgedMessage(
  channelId: string,
  platform: PlatformType,
  platformMessageId: string,
  senderId: string,
  senderName: string,
  content: string,
  direction: "inbound" | "outbound",
  swarmMessageId?: string,
  attachments?: Array<{ url: string; type: string; name: string }>
): Promise<string> {
  const ref = await addDoc(collection(db, "bridgedMessages"), {
    swarmMessageId: swarmMessageId || null,
    platformMessageId,
    channelId,
    platform,
    senderId,
    senderName,
    content,
    attachments: attachments || [],
    direction,
    timestamp: serverTimestamp(),
  });
  return ref.id;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function getPlatformIcon(platform: PlatformType): string {
  switch (platform) {
    case "telegram":
      return "📱";
    case "discord":
      return "💬";
    case "slack":
      return "💼";
    case "native":
      return "🌐";
  }
}

export function getPlatformColor(platform: PlatformType): string {
  switch (platform) {
    case "telegram":
      return "text-blue-400";
    case "discord":
      return "text-indigo-400";
    case "slack":
      return "text-purple-400";
    case "native":
      return "text-gray-400";
  }
}
