/**
 * Storacha Client — Singleton adapter for decentralized content-addressed storage
 *
 * Provides upload/retrieve helpers wrapping the @storacha/client SDK.
 * Server-side only — imported by API routes, never client components.
 *
 * Env vars required:
 *   STORACHA_AGENT_KEY          — Ed25519 private key (npx ucan-key ed --json)
 *   STORACHA_DELEGATION_PROOF   — Base64 delegation proof from Storacha CLI
 *   STORACHA_GATEWAY_DOMAIN      — IPFS gateway domain (default: storacha.link)
 */

import * as Client from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import { Signer } from "@storacha/client/principal/ed25519";
import * as Proof from "@storacha/client/proof";

// ═══════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════

type StorachaClient = Awaited<ReturnType<typeof Client.create>>;

let _client: StorachaClient | null = null;

/**
 * Get or create the Storacha client singleton.
 * Uses Ed25519 key + delegated proof from env vars.
 */
export async function getStorachaClient(): Promise<StorachaClient> {
    if (_client) return _client;

    const keyStr = process.env.STORACHA_AGENT_KEY;
    const proofStr = process.env.STORACHA_DELEGATION_PROOF;
    if (!keyStr || !proofStr) {
        throw new Error(
            "Storacha not configured: STORACHA_AGENT_KEY and STORACHA_DELEGATION_PROOF required",
        );
    }

    const principal = Signer.parse(keyStr);
    const store = new StoreMemory();
    const client = await Client.create({ principal, store });

    const proof = await Proof.parse(proofStr);
    const space = await client.addSpace(proof);
    await client.setCurrentSpace(space.did());

    _client = client;
    return client;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** The configured IPFS gateway domain (default: storacha.link). */
export function getGatewayDomain(): string {
    return process.env.STORACHA_GATEWAY_DOMAIN || "storacha.link";
}

/** Check if Storacha is configured (env vars present). */
export function isStorachaConfigured(): boolean {
    return !!(process.env.STORACHA_AGENT_KEY && process.env.STORACHA_DELEGATION_PROOF);
}

/** Build the retrieval URL for a CID via the IPFS gateway (subdomain format). */
export function buildRetrievalUrl(cid: string): string {
    return `https://${cid}.ipfs.${getGatewayDomain()}/`;
}

/**
 * Upload content to Storacha. Returns the root CID string.
 * Accepts a Blob or Buffer and optional filename.
 */
export async function uploadContent(
    data: Blob | Buffer,
    filename?: string,
): Promise<{ cid: string; sizeBytes: number }> {
    const client = await getStorachaClient();

    let blob: Blob;
    if (Buffer.isBuffer(data)) {
        // Convert Buffer → ArrayBuffer → Blob (avoids TS SharedArrayBuffer compat issue)
        const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        blob = new Blob([ab]);
    } else {
        blob = data;
    }

    const uploadBlob = filename ? new File([blob], filename) : blob;
    const cid = await client.uploadFile(uploadBlob);
    return {
        cid: cid.toString(),
        sizeBytes: blob.size,
    };
}

/**
 * Retrieve content from Storacha via IPFS gateway.
 * Returns the raw fetch Response (caller handles streaming/buffering).
 */
export async function retrieveContent(cid: string): Promise<Response> {
    const url = buildRetrievalUrl(cid);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to retrieve CID ${cid}: ${response.status} ${response.statusText}`,
        );
    }
    return response;
}
