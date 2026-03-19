/**
 * Storacha CID Index — Firestore CRUD for CID links, memory entries, and artifact records
 *
 * Three collections:
 *   storachaCidLinks          — CID → Storacha space metadata mapping
 *   storachaMemoryEntries     — CID-backed memory entries
 *   storachaArtifactRecords   — CID-backed artifact records
 *
 * Follows the same Firestore patterns as src/lib/memory.ts and src/lib/audit-log.ts.
 */

import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
    CidLink,
    StorachaMemoryEntry,
    StorachaMemoryType,
    ArtifactRecord,
    ArtifactType,
    StorageUsageSummary,
    StorageQuota,
} from "./types";
import { DEFAULT_QUOTA } from "./types";

// ═══════════════════════════════════════════════════════════════
// Collection Names
// ═══════════════════════════════════════════════════════════════

const COLLECTIONS = {
    cidLinks: "storachaCidLinks",
    memoryEntries: "storachaMemoryEntries",
    artifactRecords: "storachaArtifactRecords",
} as const;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function toDate(val: unknown): Date | null {
    if (!val) return null;
    if (val instanceof Timestamp) return val.toDate();
    if (val instanceof Date) return val;
    if (typeof val === "object" && typeof (val as { toDate?: unknown }).toDate === "function") {
        return (val as { toDate(): Date }).toDate();
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// CID Links
// ═══════════════════════════════════════════════════════════════

/** Record a CID-to-space mapping after a successful upload. */
export async function recordCidLink(
    cid: string,
    storachaSpaceId: string,
    sizeBytes: number,
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTIONS.cidLinks), {
        cid,
        storachaSpaceId,
        sizeBytes,
        pinned: true,
        uploadedAt: serverTimestamp(),
    });
    return ref.id;
}

/** Look up a CID link by CID string. */
export async function getCidLink(cid: string): Promise<CidLink | null> {
    const q = query(collection(db, COLLECTIONS.cidLinks), where("cid", "==", cid));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return {
        id: d.id,
        cid: data.cid,
        storachaSpaceId: data.storachaSpaceId,
        uploadedAt: toDate(data.uploadedAt),
        sizeBytes: data.sizeBytes || 0,
        pinned: data.pinned ?? true,
    };
}

// ═══════════════════════════════════════════════════════════════
// Memory Entries (Storacha-backed)
// ═══════════════════════════════════════════════════════════════

/** Add a Storacha-backed memory entry. */
export async function addStorachaMemoryEntry(
    entry: Omit<StorachaMemoryEntry, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTIONS.memoryEntries), {
        ...entry,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
}

/** Get Storacha-backed memory entries for an org, optionally filtered. */
export async function getStorachaMemoryEntries(
    orgId: string,
    agentId?: string,
    type?: StorachaMemoryType,
): Promise<StorachaMemoryEntry[]> {
    let q;
    if (agentId && type) {
        q = query(collection(db, COLLECTIONS.memoryEntries),
            where("orgId", "==", orgId), where("agentId", "==", agentId), where("type", "==", type),
            orderBy("createdAt", "desc"));
    } else if (agentId) {
        q = query(collection(db, COLLECTIONS.memoryEntries),
            where("orgId", "==", orgId), where("agentId", "==", agentId),
            orderBy("createdAt", "desc"));
    } else if (type) {
        q = query(collection(db, COLLECTIONS.memoryEntries),
            where("orgId", "==", orgId), where("type", "==", type),
            orderBy("createdAt", "desc"));
    } else {
        q = query(collection(db, COLLECTIONS.memoryEntries),
            where("orgId", "==", orgId),
            orderBy("createdAt", "desc"));
    }
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            agentId: data.agentId,
            agentName: data.agentName,
            type: data.type,
            contentCid: data.contentCid,
            title: data.title,
            tags: data.tags || [],
            sizeBytes: data.sizeBytes,
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
        } as StorachaMemoryEntry;
    });
}

/** Get a single Storacha memory entry by ID. */
export async function getStorachaMemoryEntry(
    id: string,
): Promise<StorachaMemoryEntry | null> {
    const snap = await getDoc(doc(db, COLLECTIONS.memoryEntries, id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
        id: snap.id,
        orgId: data.orgId,
        agentId: data.agentId,
        agentName: data.agentName,
        type: data.type,
        contentCid: data.contentCid,
        title: data.title,
        tags: data.tags || [],
        sizeBytes: data.sizeBytes,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as StorachaMemoryEntry;
}

// ═══════════════════════════════════════════════════════════════
// Artifact Records
// ═══════════════════════════════════════════════════════════════

/** Record an artifact after upload. */
export async function addArtifactRecord(
    record: Omit<ArtifactRecord, "id" | "createdAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTIONS.artifactRecords), {
        ...record,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

/** Get artifact records for an org, optionally filtered by type or agent. */
export async function getArtifactRecords(
    orgId: string,
    opts?: { agentId?: string; artifactType?: ArtifactType },
): Promise<ArtifactRecord[]> {
    let q;
    if (opts?.agentId && opts?.artifactType) {
        q = query(collection(db, COLLECTIONS.artifactRecords),
            where("orgId", "==", orgId), where("agentId", "==", opts.agentId), where("artifactType", "==", opts.artifactType),
            orderBy("createdAt", "desc"));
    } else if (opts?.agentId) {
        q = query(collection(db, COLLECTIONS.artifactRecords),
            where("orgId", "==", orgId), where("agentId", "==", opts.agentId),
            orderBy("createdAt", "desc"));
    } else if (opts?.artifactType) {
        q = query(collection(db, COLLECTIONS.artifactRecords),
            where("orgId", "==", orgId), where("artifactType", "==", opts.artifactType),
            orderBy("createdAt", "desc"));
    } else {
        q = query(collection(db, COLLECTIONS.artifactRecords),
            where("orgId", "==", orgId),
            orderBy("createdAt", "desc"));
    }
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            agentId: data.agentId,
            artifactType: data.artifactType,
            contentCid: data.contentCid,
            filename: data.filename,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes || 0,
            metadata: data.metadata,
            uploadedBy: data.uploadedBy,
            createdAt: toDate(data.createdAt),
        } as ArtifactRecord;
    });
}

/** Get a single artifact record by CID. */
export async function getArtifactByCid(
    cid: string,
): Promise<ArtifactRecord | null> {
    const q = query(
        collection(db, COLLECTIONS.artifactRecords),
        where("contentCid", "==", cid),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return {
        id: d.id,
        orgId: data.orgId,
        agentId: data.agentId,
        artifactType: data.artifactType,
        contentCid: data.contentCid,
        filename: data.filename,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes || 0,
        metadata: data.metadata,
        uploadedBy: data.uploadedBy,
        createdAt: toDate(data.createdAt),
    } as ArtifactRecord;
}

// ═══════════════════════════════════════════════════════════════
// Storage Analytics
// ═══════════════════════════════════════════════════════════════

/** Compute storage usage summary for an org. */
export async function getStorageUsage(orgId: string): Promise<StorageUsageSummary> {
    const [memories, artifacts] = await Promise.all([
        getStorachaMemoryEntries(orgId),
        getArtifactRecords(orgId),
    ]);

    // Count CID links for this org (via memory + artifact CIDs)
    const allCids = new Set([
        ...memories.map(m => m.contentCid),
        ...artifacts.map(a => a.contentCid),
    ]);

    const memoryBreakdown: StorageUsageSummary["memoryBreakdown"] = {
        journal: { count: 0, sizeBytes: 0 },
        long_term: { count: 0, sizeBytes: 0 },
        workspace: { count: 0, sizeBytes: 0 },
        vector: { count: 0, sizeBytes: 0 },
    };

    let memorySizeTotal = 0;
    for (const m of memories) {
        const size = m.sizeBytes || 0;
        memoryBreakdown[m.type].count++;
        memoryBreakdown[m.type].sizeBytes += size;
        memorySizeTotal += size;
    }

    const artifactBreakdown: StorageUsageSummary["artifactBreakdown"] = {
        screenshot: { count: 0, sizeBytes: 0 },
        output: { count: 0, sizeBytes: 0 },
        log: { count: 0, sizeBytes: 0 },
        report: { count: 0, sizeBytes: 0 },
    };

    let artifactSizeTotal = 0;
    let encryptedCount = 0;
    for (const a of artifacts) {
        artifactBreakdown[a.artifactType].count++;
        artifactBreakdown[a.artifactType].sizeBytes += a.sizeBytes;
        artifactSizeTotal += a.sizeBytes;
        if (a.metadata?.encrypted) encryptedCount++;
    }

    return {
        orgId,
        totalMemoryEntries: memories.length,
        totalArtifacts: artifacts.length,
        totalCidLinks: allCids.size,
        totalSizeBytes: memorySizeTotal + artifactSizeTotal,
        memoryBreakdown,
        artifactBreakdown,
        encryptedCount,
    };
}

// ═══════════════════════════════════════════════════════════════
// Quota Management
// ═══════════════════════════════════════════════════════════════

const QUOTA_COLLECTION = "storachaQuotas";

/** Get or create storage quota for an org (defaults to free tier). */
export async function getStorageQuota(orgId: string): Promise<StorageQuota> {
    const q = query(collection(db, QUOTA_COLLECTION), where("orgId", "==", orgId));
    const snap = await getDocs(q);

    if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            maxStorageBytes: data.maxStorageBytes ?? DEFAULT_QUOTA.maxStorageBytes,
            maxArtifactSizeBytes: data.maxArtifactSizeBytes ?? DEFAULT_QUOTA.maxArtifactSizeBytes,
            maxMemoryEntries: data.maxMemoryEntries ?? DEFAULT_QUOTA.maxMemoryEntries,
            maxArtifactRecords: data.maxArtifactRecords ?? DEFAULT_QUOTA.maxArtifactRecords,
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
        };
    }

    // Create default quota
    const ref = await addDoc(collection(db, QUOTA_COLLECTION), {
        orgId,
        ...DEFAULT_QUOTA,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return {
        id: ref.id,
        orgId,
        ...DEFAULT_QUOTA,
        createdAt: null,
        updatedAt: null,
    };
}

/** Check if an org is within its storage quota. Returns null if OK, or error string. */
export async function checkQuota(
    orgId: string,
    additionalBytes: number,
): Promise<string | null> {
    const [usage, quota] = await Promise.all([
        getStorageUsage(orgId),
        getStorageQuota(orgId),
    ]);

    if (usage.totalSizeBytes + additionalBytes > quota.maxStorageBytes) {
        const usedGB = (usage.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        const maxGB = (quota.maxStorageBytes / (1024 * 1024 * 1024)).toFixed(0);
        return `Storage quota exceeded: ${usedGB} GB used of ${maxGB} GB`;
    }

    if (usage.totalMemoryEntries >= quota.maxMemoryEntries) {
        return `Memory entry limit reached: ${usage.totalMemoryEntries}/${quota.maxMemoryEntries}`;
    }

    if (usage.totalArtifacts >= quota.maxArtifactRecords) {
        return `Artifact limit reached: ${usage.totalArtifacts}/${quota.maxArtifactRecords}`;
    }

    return null;
}
