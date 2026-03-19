/**
 * Storacha Client-Side API — Browser-safe helpers for calling Storacha API routes
 *
 * Used by UI components (Memory page, Artifact browser, Upload dialog).
 * These call the server-side API routes — never the Storacha SDK directly.
 */

import type { ArtifactType, ArtifactRecord, StorachaMemoryEntry, StorachaMemoryType } from "./types";

// ═══════════════════════════════════════════════════════════════
// Memory
// ═══════════════════════════════════════════════════════════════

export interface MemoryWriteParams {
    orgId: string;
    agentId: string;
    agentName?: string;
    type: StorachaMemoryType;
    title: string;
    content: string;
    tags?: string[];
}

export interface MemoryWriteResult {
    ok: boolean;
    id: string;
    cid: string;
    sizeBytes: number;
    gatewayUrl: string;
}

export async function writeMemory(
    params: MemoryWriteParams,
    walletAddress: string,
): Promise<MemoryWriteResult> {
    const res = await fetch("/api/v1/memory/write", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
        },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to write memory");
    }
    return res.json();
}

export interface MemoryReadResult {
    ok: boolean;
    cid: string;
    content: string;
    gatewayUrl: string;
}

export async function readMemory(
    cid: string,
    walletAddress: string,
    orgId?: string,
): Promise<MemoryReadResult> {
    const params = new URLSearchParams({ cid });
    if (orgId) params.set("orgId", orgId);
    const res = await fetch(`/api/v1/memory/read?${params}`, {
        headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to read memory");
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Artifacts
// ═══════════════════════════════════════════════════════════════

export interface ArtifactUploadResult {
    ok: boolean;
    id: string;
    cid: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    gatewayUrl: string;
}

export async function uploadArtifact(
    file: File,
    orgId: string,
    artifactType: ArtifactType,
    walletAddress: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown> },
): Promise<ArtifactUploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("orgId", orgId);
    formData.append("artifactType", artifactType);
    if (opts?.agentId) formData.append("agentId", opts.agentId);
    if (opts?.metadata) formData.append("metadata", JSON.stringify(opts.metadata));

    const res = await fetch("/api/v1/artifacts/upload", {
        method: "POST",
        headers: { "x-wallet-address": walletAddress },
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to upload artifact");
    }
    return res.json();
}

export interface ArtifactMetaResult {
    ok: boolean;
    artifact: {
        id: string;
        cid: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        artifactType: ArtifactType;
        metadata?: Record<string, unknown>;
        uploadedBy: string;
        createdAt: Date | null;
        gatewayUrl: string;
    };
}

export async function getArtifactMeta(
    cid: string,
    walletAddress: string,
    orgId: string,
): Promise<ArtifactMetaResult> {
    const res = await fetch(`/api/v1/artifacts/${cid}?meta=true&orgId=${encodeURIComponent(orgId)}`, {
        headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to get artifact metadata");
    }
    return res.json();
}

export function getArtifactDownloadUrl(cid: string, orgId: string): string {
    return `/api/v1/artifacts/${cid}?orgId=${encodeURIComponent(orgId)}`;
}

// ═══════════════════════════════════════════════════════════════
// Encrypted Upload
// ═══════════════════════════════════════════════════════════════

export async function uploadEncryptedArtifact(
    file: File,
    orgId: string,
    artifactType: ArtifactType,
    walletAddress: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown> },
): Promise<ArtifactUploadResult & { encrypted: boolean }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("orgId", orgId);
    formData.append("artifactType", artifactType);
    if (opts?.agentId) formData.append("agentId", opts.agentId);
    if (opts?.metadata) formData.append("metadata", JSON.stringify(opts.metadata));

    const res = await fetch("/api/v1/artifacts/upload-encrypted", {
        method: "POST",
        headers: { "x-wallet-address": walletAddress },
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to upload encrypted artifact");
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Timeline
// ═══════════════════════════════════════════════════════════════

export interface TimelineEntry {
    id: string;
    kind: "memory" | "artifact";
    orgId: string;
    agentId?: string;
    title: string;
    cid: string;
    sizeBytes: number;
    gatewayUrl: string;
    createdAt: string | null;
    memoryType?: string;
    artifactType?: string;
    filename?: string;
    mimeType?: string;
}

export async function getTimeline(
    orgId: string,
    walletAddress: string,
    limit?: number,
): Promise<{ ok: boolean; timeline: TimelineEntry[]; totalAvailable: number }> {
    const params = new URLSearchParams({ orgId });
    if (limit) params.set("limit", String(limit));
    const res = await fetch(`/api/v1/storacha/timeline?${params}`, {
        headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load timeline");
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════

export type { ArtifactType, ArtifactRecord, StorachaMemoryEntry, StorachaMemoryType };
