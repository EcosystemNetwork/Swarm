/**
 * Secrets Vault - Encrypted Storage
 *
 * AES-256-GCM encryption for sensitive data like API keys, tokens, passwords.
 * Stores encrypted values in Firestore with masked previews.
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
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface Secret {
  id: string;
  orgId: string;
  key: string; // Secret identifier (e.g., "openai_api_key")
  encryptedValue: string; // AES-256-GCM encrypted
  iv: string; // Initialization vector (hex)
  maskedPreview: string; // First 4 + last 4 chars, rest masked
  createdBy: string;
  createdAt: Date | null;
  lastAccessedAt?: Date | null;
  accessCount: number;
  tags?: string[];
  description?: string;
}

// ═══════════════════════════════════════════════════════════════
// Encryption (Browser-Compatible)
// ═══════════════════════════════════════════════════════════════

/**
 * Derive encryption key from organization secret
 * In production, use a proper key management service (KMS)
 */
function deriveKey(orgId: string, masterSecret: string): string {
  // Simple key derivation - in production, use PBKDF2 or similar
  const combined = `${orgId}:${masterSecret}`;
  const hash = crypto.createHash("sha256");
  hash.update(combined);
  return hash.digest("hex");
}

/**
 * Encrypt a value using AES-256-GCM
 * Returns { encryptedValue, iv } in hex format
 */
export function encryptValue(
  value: string,
  orgId: string,
  masterSecret: string
): { encryptedValue: string; iv: string } {
  const key = deriveKey(orgId, masterSecret);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv
  );

  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();
  const combined = encrypted + authTag.toString("hex");

  return {
    encryptedValue: combined,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypt a value using AES-256-GCM
 */
export function decryptValue(
  encryptedValue: string,
  iv: string,
  orgId: string,
  masterSecret: string
): string {
  const key = deriveKey(orgId, masterSecret);

  // Extract auth tag (last 32 hex chars = 16 bytes)
  const authTag = Buffer.from(encryptedValue.slice(-32), "hex");
  const encrypted = encryptedValue.slice(0, -32);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Create a masked preview of a secret value
 * Shows first 4 and last 4 characters
 */
export function maskValue(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  const first = value.slice(0, 4);
  const last = value.slice(-4);
  const masked = "*".repeat(Math.min(12, value.length - 8));

  return `${first}${masked}${last}`;
}

// ═══════════════════════════════════════════════════════════════
// Firestore Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Store an encrypted secret
 */
export async function storeSecret(
  orgId: string,
  key: string,
  value: string,
  createdBy: string,
  masterSecret: string,
  options?: {
    tags?: string[];
    description?: string;
  }
): Promise<string> {
  const { encryptedValue, iv } = encryptValue(value, orgId, masterSecret);
  const maskedPreview = maskValue(value);

  const secretData = {
    orgId,
    key,
    encryptedValue,
    iv,
    maskedPreview,
    createdBy,
    createdAt: serverTimestamp(),
    accessCount: 0,
    tags: options?.tags || [],
    description: options?.description || "",
  };

  const ref = await addDoc(collection(db, "secrets"), secretData);

  // Log activity
  await logActivity(orgId, createdBy, createdBy, "config.changed", {
    action: "secret_created",
    key,
  });

  return ref.id;
}

/**
 * Get all secrets for an organization (masked)
 */
export async function getSecrets(orgId: string): Promise<Secret[]> {
  const q = query(collection(db, "secrets"), where("orgId", "==", orgId));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      orgId: data.orgId,
      key: data.key,
      encryptedValue: data.encryptedValue,
      iv: data.iv,
      maskedPreview: data.maskedPreview,
      createdBy: data.createdBy,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
      lastAccessedAt: data.lastAccessedAt instanceof Timestamp ? data.lastAccessedAt.toDate() : null,
      accessCount: data.accessCount || 0,
      tags: data.tags || [],
      description: data.description || "",
    } as Secret;
  });
}

/**
 * Reveal (decrypt) a secret
 * Updates lastAccessedAt and increments accessCount
 */
export async function revealSecret(
  secretId: string,
  orgId: string,
  masterSecret: string
): Promise<string> {
  const secretDoc = await getDoc(doc(db, "secrets", secretId));

  if (!secretDoc.exists()) {
    throw new Error("Secret not found");
  }

  const secret = { id: secretDoc.id, ...secretDoc.data() } as Secret;

  if (secret.orgId !== orgId) {
    throw new Error("Secret does not belong to this organization");
  }

  // Decrypt
  const decrypted = decryptValue(
    secret.encryptedValue,
    secret.iv,
    orgId,
    masterSecret
  );

  // Update access tracking
  await updateDoc(doc(db, "secrets", secretId), {
    lastAccessedAt: serverTimestamp(),
    accessCount: (secret.accessCount || 0) + 1,
  });

  return decrypted;
}

/**
 * Delete a secret
 */
export async function deleteSecret(
  secretId: string,
  orgId: string,
  deletedBy: string
): Promise<void> {
  const secretDoc = await getDoc(doc(db, "secrets", secretId));

  if (!secretDoc.exists()) {
    throw new Error("Secret not found");
  }

  const secret = { id: secretDoc.id, ...secretDoc.data() } as Secret;

  if (secret.orgId !== orgId) {
    throw new Error("Secret does not belong to this organization");
  }

  await deleteDoc(doc(db, "secrets", secretId));

  // Log activity
  await logActivity(orgId, deletedBy, deletedBy, "config.changed", {
    action: "secret_deleted",
    key: secret.key,
  });
}
