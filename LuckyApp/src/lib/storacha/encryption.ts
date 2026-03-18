/**
 * Storacha Content Encryption — AES-256-GCM encryption for private IPFS content
 *
 * Content is encrypted server-side before uploading to IPFS.
 * The encryption key is derived per-org using PBKDF2 (same pattern as secrets.ts).
 * The IV is prepended to the ciphertext so only one CID is stored.
 *
 * Format: [16-byte IV][16-byte auth tag][ciphertext]
 *
 * Env: SESSION_SECRET used as master key (same as session auth).
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive an org-specific encryption key from SESSION_SECRET + orgId.
 */
function deriveKey(orgId: string): Buffer {
    const masterSecret = process.env.SESSION_SECRET;
    if (!masterSecret) {
        throw new Error("SESSION_SECRET is required for content encryption");
    }
    const salt = crypto.createHash("sha256").update(`storacha:${orgId}`).digest();
    return crypto.pbkdf2Sync(masterSecret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt content for private IPFS storage.
 * Returns a Buffer: [IV (16)] [AuthTag (16)] [ciphertext]
 */
export function encryptContent(plaintext: Buffer, orgId: string): Buffer {
    const key = deriveKey(orgId);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack: IV + AuthTag + Ciphertext
    return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt content retrieved from IPFS.
 * Input format: [IV (16)] [AuthTag (16)] [ciphertext]
 */
export function decryptContent(packed: Buffer, orgId: string): Buffer {
    if (packed.length < IV_LENGTH + TAG_LENGTH + 1) {
        throw new Error("Encrypted content too short — invalid format");
    }

    const key = deriveKey(orgId);
    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Check if content encryption is available (SESSION_SECRET set).
 */
export function isEncryptionAvailable(): boolean {
    return !!process.env.SESSION_SECRET;
}
