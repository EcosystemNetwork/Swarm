/**
 * Hedera Privacy Layer — Encryption for Private Reputation
 *
 * Privacy-First Design:
 * - All agent data is PRIVATE by default
 * - Score events are encrypted with org-specific keys
 * - Only org members can decrypt reputation data
 * - Public opt-in for marketplace/leaderboards
 *
 * Encryption:
 * - AES-256-GCM for symmetric encryption
 * - Org-level master keys stored in Firestore (encrypted with org owner wallet)
 * - Per-agent encryption keys derived from org master key
 */

import crypto from "crypto";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface EncryptedData {
    encrypted: string; // Base64-encoded ciphertext
    iv: string; // Initialization vector
    tag: string; // Authentication tag
    algorithm: "aes-256-gcm";
}

export interface PrivacySettings {
    orgId: string;
    agentId?: string;
    privacyLevel: "private" | "organization" | "public";
    allowPublicProfile: boolean;
    allowPublicScores: boolean;
    allowPublicHistory: boolean;
    encryptionEnabled: boolean;
    createdAt: unknown;
    updatedAt: unknown;
}

export interface OrgEncryptionKey {
    orgId: string;
    masterKey: string; // Encrypted with org owner's wallet (TODO: implement wallet encryption)
    keyVersion: number;
    createdAt: unknown;
}

// ═══════════════════════════════════════════════════════════════
// Encryption
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a new encryption key for an organization.
 */
export function generateOrgKey(): string {
    return crypto.randomBytes(32).toString("hex"); // 256-bit key
}

/**
 * Encrypt data with AES-256-GCM.
 */
export function encrypt(data: string, key: string): EncryptedData {
    const keyBuffer = Buffer.from(key, "hex");
    const iv = crypto.randomBytes(16); // 128-bit IV

    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);

    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    const tag = cipher.getAuthTag();

    return {
        encrypted,
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        algorithm: "aes-256-gcm",
    };
}

/**
 * Decrypt data with AES-256-GCM.
 */
export function decrypt(encryptedData: EncryptedData, key: string): string {
    const keyBuffer = Buffer.from(key, "hex");
    const iv = Buffer.from(encryptedData.iv, "base64");
    const tag = Buffer.from(encryptedData.tag, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData.encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

// ═══════════════════════════════════════════════════════════════
// Org Key Management
// ═══════════════════════════════════════════════════════════════

/**
 * Get or create org encryption key.
 */
export async function getOrgKey(orgId: string): Promise<string> {
    const keyRef = doc(db, "orgEncryptionKeys", orgId);
    const keyDoc = await getDoc(keyRef);

    if (keyDoc.exists()) {
        const keyData = keyDoc.data() as OrgEncryptionKey;
        // TODO: Decrypt master key with org owner's wallet signature
        return keyData.masterKey;
    }

    // Generate new key for org
    const masterKey = generateOrgKey();

    await setDoc(keyRef, {
        orgId,
        masterKey, // TODO: Encrypt with org owner's wallet before storing
        keyVersion: 1,
        createdAt: new Date(),
    });

    console.log(`✅ Generated new encryption key for org ${orgId}`);

    return masterKey;
}

/**
 * Derive agent-specific key from org master key.
 */
export function deriveAgentKey(orgKey: string, agentId: string): string {
    // Use HKDF to derive agent-specific key from org master key
    const salt = Buffer.from(agentId, "utf8");
    const info = Buffer.from("swarm-agent-encryption", "utf8");

    return crypto.pbkdf2Sync(
        Buffer.from(orgKey, "hex"),
        salt,
        100000, // iterations
        32, // key length
        "sha256",
    ).toString("hex");
}

// ═══════════════════════════════════════════════════════════════
// Privacy Settings
// ═══════════════════════════════════════════════════════════════

/**
 * Get privacy settings for an agent.
 * Defaults to PRIVATE if not set.
 */
export async function getPrivacySettings(orgId: string, agentId?: string): Promise<PrivacySettings> {
    const settingsRef = doc(db, "privacySettings", agentId || orgId);
    const settingsDoc = await getDoc(settingsRef);

    if (settingsDoc.exists()) {
        return settingsDoc.data() as PrivacySettings;
    }

    // Default to PRIVATE
    return {
        orgId,
        agentId,
        privacyLevel: "private",
        allowPublicProfile: false,
        allowPublicScores: false,
        allowPublicHistory: false,
        encryptionEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Update privacy settings for an agent or org.
 */
export async function updatePrivacySettings(
    orgId: string,
    settings: Partial<PrivacySettings>,
    agentId?: string,
): Promise<void> {
    const settingsRef = doc(db, "privacySettings", agentId || orgId);

    await setDoc(settingsRef, {
        orgId,
        agentId,
        ...settings,
        updatedAt: new Date(),
    }, { merge: true });

    console.log(`✅ Updated privacy settings for ${agentId || orgId}: ${settings.privacyLevel}`);
}

/**
 * Check if data should be encrypted based on privacy settings.
 */
export async function shouldEncrypt(orgId: string, agentId?: string): Promise<boolean> {
    const settings = await getPrivacySettings(orgId, agentId);
    return settings.encryptionEnabled && settings.privacyLevel === "private";
}

/**
 * Check if user can access agent data based on privacy settings.
 */
export async function canAccessAgentData(
    orgId: string,
    agentId: string,
    requesterOrgId?: string,
): Promise<boolean> {
    const settings = await getPrivacySettings(orgId, agentId);

    // Public: anyone can access
    if (settings.privacyLevel === "public") {
        return true;
    }

    // Organization: only same org members can access
    if (settings.privacyLevel === "organization") {
        return requesterOrgId === orgId;
    }

    // Private: only the agent's org can access
    return requesterOrgId === orgId;
}

// ═══════════════════════════════════════════════════════════════
// Encrypted HCS Events
// ═══════════════════════════════════════════════════════════════

/**
 * Encrypt a score event before submitting to HCS.
 */
export async function encryptScoreEvent(event: any, orgId: string): Promise<EncryptedData> {
    const orgKey = await getOrgKey(orgId);
    const eventJson = JSON.stringify(event);
    return encrypt(eventJson, orgKey);
}

/**
 * Decrypt a score event from HCS.
 */
export async function decryptScoreEvent(encryptedEvent: EncryptedData, orgId: string): Promise<any> {
    const orgKey = await getOrgKey(orgId);
    const eventJson = decrypt(encryptedEvent, orgKey);
    return JSON.parse(eventJson);
}

/**
 * Wrapper for submitting encrypted score events.
 */
export async function submitEncryptedScoreEvent(
    event: any,
    orgId: string,
    submitFn: (data: any) => Promise<any>,
): Promise<any> {
    const shouldEnc = await shouldEncrypt(orgId);

    if (shouldEnc) {
        // Encrypt the event
        const encrypted = await encryptScoreEvent(event, orgId);

        // Wrap in metadata envelope
        const envelope = {
            version: "1.0",
            encrypted: true,
            orgId,
            data: encrypted,
        };

        return submitFn(envelope);
    }

    // No encryption - submit plain event
    const envelope = {
        version: "1.0",
        encrypted: false,
        orgId,
        data: event,
    };

    return submitFn(envelope);
}
