/**
 * Ed25519 signature verification for the /v1/ API.
 *
 * Every request to /v1/messages and /v1/send must include a signature.
 * The hub looks up the agent's registered public key and verifies.
 */
import crypto from "crypto";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

/**
 * Verify an Ed25519 signature against a known public key (PEM format).
 */
export function verifySignature(
    publicKeyPem: string,
    message: string,
    signatureBase64: string
): boolean {
    try {
        const publicKey = crypto.createPublicKey({
            key: publicKeyPem,
            format: "pem",
            type: "spki",
        });
        return crypto.verify(
            null, // Ed25519 doesn't use a separate hash algorithm
            Buffer.from(message, "utf-8"),
            publicKey,
            Buffer.from(signatureBase64, "base64")
        );
    } catch {
        return false;
    }
}

/**
 * Look up an agent's public key from Firestore and verify the signature.
 * Returns the agent data on success, or null on failure.
 */
export async function verifyAgentRequest(
    agentId: string,
    message: string,
    signatureBase64: string
): Promise<{
    agentId: string;
    agentName: string;
    orgId: string;
    agentType: string;
} | null> {
    if (!agentId || !signatureBase64) return null;

    try {
        const agentSnap = await getDoc(doc(db, "agents", agentId));
        if (!agentSnap.exists()) return null;

        const data = agentSnap.data();
        const publicKeyPem = data.publicKey;
        if (!publicKeyPem) return null;

        const valid = verifySignature(publicKeyPem, message, signatureBase64);
        if (!valid) return null;

        return {
            agentId,
            agentName: data.name || agentId,
            orgId: data.orgId || data.organizationId || "",
            agentType: data.type || "agent",
        };
    } catch {
        return null;
    }
}

/**
 * Check that a timestamp is not stale (within 2 minutes).
 * Reduced from 5 minutes to minimize replay attack window.
 */
export function isTimestampFresh(timestampMs: number, maxAgeMs = 2 * 60 * 1000): boolean {
    const now = Date.now();
    return Math.abs(now - timestampMs) < maxAgeMs;
}

/**
 * Standard 401 response for failed signature verification.
 */
export function unauthorized(message = "Invalid or missing signature") {
    return Response.json({ error: message }, { status: 401 });
}
