/**
 * Storacha Types — Content-addressed storage data models
 *
 * Shared types for CID-backed memory entries, artifact records,
 * and CID link indexing. Names prefixed with "Storacha" to avoid
 * collision with existing MemoryEntry types in memory.ts and
 * compute/firestore.ts.
 */

// ═══════════════════════════════════════════════════════════════
// Enums / Unions
// ═══════════════════════════════════════════════════════════════

/** Memory types — aligns with existing MemoryType in memory.ts */
export type StorachaMemoryType = "journal" | "long_term" | "workspace" | "vector";

/** Artifact types for CID-indexed uploads */
export type ArtifactType = "screenshot" | "output" | "log" | "report";

// ═══════════════════════════════════════════════════════════════
// CID Links
// ═══════════════════════════════════════════════════════════════

/** Maps a CID to its Storacha space metadata. */
export interface CidLink {
    id: string;
    cid: string;
    storachaSpaceId: string;
    uploadedAt: Date | null;
    sizeBytes: number;
    pinned: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Memory Entries (Storacha-backed)
// ═══════════════════════════════════════════════════════════════

/** A memory entry backed by Storacha content-addressed storage. */
export interface StorachaMemoryEntry {
    id: string;
    orgId: string;
    agentId: string;
    agentName?: string;
    type: StorachaMemoryType;
    contentCid: string;
    title: string;
    tags?: string[];
    sizeBytes?: number;
    /** Optional Memory Pro space association */
    spaceId?: string;
    createdAt: Date | null;
    updatedAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Artifact Records
// ═══════════════════════════════════════════════════════════════

/** An artifact record indexed by CID. */
export interface ArtifactRecord {
    id: string;
    orgId: string;
    agentId?: string;
    artifactType: ArtifactType;
    contentCid: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    metadata?: Record<string, unknown>;
    uploadedBy: string;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Storage Quotas & Analytics
// ═══════════════════════════════════════════════════════════════

/** Storage usage summary for an org. */
export interface StorageUsageSummary {
    orgId: string;
    totalMemoryEntries: number;
    totalArtifacts: number;
    totalCidLinks: number;
    totalSizeBytes: number;
    memoryBreakdown: Record<StorachaMemoryType, { count: number; sizeBytes: number }>;
    artifactBreakdown: Record<ArtifactType, { count: number; sizeBytes: number }>;
    encryptedCount: number;
}

/** Storage quota for an org. */
export interface StorageQuota {
    id: string;
    orgId: string;
    maxStorageBytes: number;       // Default: 5 GB (Mild plan)
    maxArtifactSizeBytes: number;  // Default: 50 MB
    maxMemoryEntries: number;      // Default: 10,000
    maxArtifactRecords: number;    // Default: 5,000
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** Default quotas for free tier (Storacha Mild plan). */
export const DEFAULT_QUOTA: Omit<StorageQuota, "id" | "orgId" | "createdAt" | "updatedAt"> = {
    maxStorageBytes: 5 * 1024 * 1024 * 1024,       // 5 GB
    maxArtifactSizeBytes: 50 * 1024 * 1024,         // 50 MB
    maxMemoryEntries: 10_000,
    maxArtifactRecords: 5_000,
};
