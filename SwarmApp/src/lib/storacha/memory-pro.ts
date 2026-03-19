/**
 * Memory Pro — Core premium logic for spaces, retrieval, and analytics.
 *
 * Firestore collections:
 *   memorySpaces            — Named shared spaces with visibility
 *   memorySpaceMembers      — Per-space access control
 *   premiumRetrievalLogs    — Query logs for analytics
 *   memoryAnalyticsDaily    — Daily aggregated analytics
 *
 * Follows patterns from cid-index.ts and memory.ts.
 */

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
    orderBy,
    limit as firestoreLimit,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { getStorachaMemoryEntries } from "./cid-index";
import { buildRetrievalUrl } from "./client";
import type {
    MemorySpace,
    SpaceMember,
    SpaceRole,
    SpaceSubjectType,
    SpaceVisibility,
    SpaceAccessResult,
    PremiumRetrievalQuery,
    ScoredMemoryEntry,
    PremiumRetrievalResult,
    RetrievalLogEntry,
    DailyAnalytics,
    AnalyticsDashboardData,
} from "./memory-pro-types";

// ═══════════════════════════════════════════════════════════════
// Collection Names
// ═══════════════════════════════════════════════════════════════

const COLLECTIONS = {
    spaces: "memorySpaces",
    members: "memorySpaceMembers",
    retrievalLogs: "premiumRetrievalLogs",
    dailyAnalytics: "memoryAnalyticsDaily",
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

const ROLE_HIERARCHY: Record<SpaceRole, number> = {
    reader: 1,
    writer: 2,
    admin: 3,
};

function hasRoleLevel(actual: SpaceRole, required: SpaceRole): boolean {
    return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[required];
}

// ═══════════════════════════════════════════════════════════════
// Space CRUD
// ═══════════════════════════════════════════════════════════════

/** Create a new memory space. Automatically adds the creator as admin. */
export async function createSpace(
    data: Omit<MemorySpace, "id" | "entryCount" | "createdAt" | "updatedAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTIONS.spaces), {
        orgId: data.orgId,
        name: data.name,
        description: data.description || "",
        visibility: data.visibility,
        tags: data.tags || [],
        projectId: data.projectId || null,
        createdBy: data.createdBy,
        entryCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    // Auto-add creator as admin
    await addDoc(collection(db, COLLECTIONS.members), {
        spaceId: ref.id,
        orgId: data.orgId,
        subjectType: "user" as SpaceSubjectType,
        subjectId: data.createdBy,
        subjectName: "Creator",
        role: "admin" as SpaceRole,
        addedBy: data.createdBy,
        createdAt: serverTimestamp(),
    });

    return ref.id;
}

/** Get spaces for an org, optionally filtered by visibility. */
export async function getSpaces(
    orgId: string,
    visibility?: SpaceVisibility,
): Promise<MemorySpace[]> {
    const q = visibility
        ? query(
            collection(db, COLLECTIONS.spaces),
            where("orgId", "==", orgId),
            where("visibility", "==", visibility),
            orderBy("createdAt", "desc"),
        )
        : query(
            collection(db, COLLECTIONS.spaces),
            where("orgId", "==", orgId),
            orderBy("createdAt", "desc"),
        );

    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            name: data.name,
            description: data.description,
            visibility: data.visibility,
            tags: data.tags || [],
            projectId: data.projectId,
            createdBy: data.createdBy,
            entryCount: data.entryCount || 0,
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
        } as MemorySpace;
    });
}

/** Get a single space by ID. */
export async function getSpace(spaceId: string): Promise<MemorySpace | null> {
    const snap = await getDoc(doc(db, COLLECTIONS.spaces, spaceId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
        id: snap.id,
        orgId: data.orgId,
        name: data.name,
        description: data.description,
        visibility: data.visibility,
        tags: data.tags || [],
        projectId: data.projectId,
        createdBy: data.createdBy,
        entryCount: data.entryCount || 0,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as MemorySpace;
}

/** Update space metadata. */
export async function updateSpace(
    spaceId: string,
    updates: Partial<Pick<MemorySpace, "name" | "description" | "visibility" | "tags">>,
): Promise<void> {
    await updateDoc(doc(db, COLLECTIONS.spaces, spaceId), {
        ...updates,
        updatedAt: serverTimestamp(),
    });
}

/** Delete a space and all its members. */
export async function deleteSpace(spaceId: string): Promise<void> {
    // Delete all members for this space
    const membersQuery = query(
        collection(db, COLLECTIONS.members),
        where("spaceId", "==", spaceId),
    );
    const members = await getDocs(membersQuery);
    await Promise.all(members.docs.map((d) => deleteDoc(d.ref)));

    // Delete the space itself
    await deleteDoc(doc(db, COLLECTIONS.spaces, spaceId));
}

// ═══════════════════════════════════════════════════════════════
// Space Members / Permissions
// ═══════════════════════════════════════════════════════════════

/** Add a member to a space. */
export async function addSpaceMember(
    data: Omit<SpaceMember, "id" | "createdAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTIONS.members), {
        ...data,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

/** Remove a member from a space. */
export async function removeSpaceMember(memberId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.members, memberId));
}

/** Get all members of a space. */
export async function getSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
    const q = query(
        collection(db, COLLECTIONS.members),
        where("spaceId", "==", spaceId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            spaceId: data.spaceId,
            orgId: data.orgId,
            subjectType: data.subjectType,
            subjectId: data.subjectId,
            subjectName: data.subjectName,
            role: data.role,
            addedBy: data.addedBy,
            createdAt: toDate(data.createdAt),
        } as SpaceMember;
    });
}

/** Check if a subject has access to a space (with optional minimum role requirement). */
export async function checkSpaceAccess(
    spaceId: string,
    subjectId: string,
    requiredRole?: SpaceRole,
): Promise<SpaceAccessResult> {
    // Check explicit membership first
    const q = query(
        collection(db, COLLECTIONS.members),
        where("spaceId", "==", spaceId),
        where("subjectId", "==", subjectId),
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
        const member = snap.docs[0].data();
        const role = member.role as SpaceRole;
        if (requiredRole && !hasRoleLevel(role, requiredRole)) {
            return { allowed: false, role, reason: `Requires ${requiredRole} role` };
        }
        return { allowed: true, role };
    }

    // Fall back to space visibility
    const space = await getSpace(spaceId);
    if (!space) return { allowed: false, reason: "Space not found" };

    if (space.visibility === "public") {
        const fallbackRole: SpaceRole = "reader";
        if (requiredRole && !hasRoleLevel(fallbackRole, requiredRole)) {
            return { allowed: false, role: fallbackRole, reason: `Requires ${requiredRole} role` };
        }
        return { allowed: true, role: fallbackRole };
    }

    if (space.visibility === "org") {
        // org-visible spaces grant reader access to all org members
        const fallbackRole: SpaceRole = "reader";
        if (requiredRole && !hasRoleLevel(fallbackRole, requiredRole)) {
            return { allowed: false, role: fallbackRole, reason: `Requires ${requiredRole} role` };
        }
        return { allowed: true, role: fallbackRole };
    }

    return { allowed: false, reason: "Private space — explicit membership required" };
}

/** Get all spaces accessible to a subject in an org. */
export async function getAccessibleSpaces(
    orgId: string,
    subjectId: string,
): Promise<MemorySpace[]> {
    // Get explicit memberships
    const memberQuery = query(
        collection(db, COLLECTIONS.members),
        where("subjectId", "==", subjectId),
        where("orgId", "==", orgId),
    );
    const memberSnap = await getDocs(memberQuery);
    const memberSpaceIds = new Set(memberSnap.docs.map((d) => d.data().spaceId));

    // Get all org spaces (filter by visibility in app layer)
    const allSpaces = await getSpaces(orgId);

    return allSpaces.filter(
        (s) => memberSpaceIds.has(s.id) || s.visibility === "org" || s.visibility === "public",
    );
}

// ═══════════════════════════════════════════════════════════════
// Premium Retrieval
// ═══════════════════════════════════════════════════════════════

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

function computeTextMatch(queryTerms: string[], title: string, tags: string[]): number {
    if (queryTerms.length === 0) return 0;
    const titleLower = title.toLowerCase();
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    let matched = 0;
    for (const term of queryTerms) {
        if (titleLower.includes(term) || tagSet.has(term)) {
            matched++;
        }
    }
    return matched / queryTerms.length;
}

function computeRecency(createdAt: Date | null, halfLifeDays: number = 30): number {
    if (!createdAt) return 0;
    const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-ageDays / halfLifeDays);
}

function computeTagBoost(queryTerms: string[], tags: string[]): number {
    if (queryTerms.length === 0 || tags.length === 0) return 0;
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    for (const term of queryTerms) {
        if (tagSet.has(term)) return 0.15;
    }
    return 0;
}

/** Execute a premium retrieval query with scoring, ranking, and dedup. */
export async function semanticRetrieve(
    params: PremiumRetrievalQuery,
): Promise<PremiumRetrievalResult> {
    const startTime = Date.now();
    const maxResults = Math.min(params.limit || 10, 50);
    const minConfidence = params.minConfidence ?? 0.1;
    const recencyWeight = params.recencyWeight ?? 0.3;

    // Fetch all memory entries for the org
    const entries = await getStorachaMemoryEntries(
        params.orgId,
        params.agentId,
        params.type as "journal" | "long_term" | "workspace" | "vector" | undefined,
    );

    // Filter by spaceId if specified
    let candidates = params.spaceIds?.length
        ? entries.filter((e) => e.spaceId && params.spaceIds!.includes(e.spaceId))
        : entries;

    const totalCandidates = candidates.length;
    const queryTerms = tokenize(params.query);

    // Score each entry
    const scored: ScoredMemoryEntry[] = candidates.map((entry) => {
        const textMatch = computeTextMatch(queryTerms, entry.title, entry.tags || []);
        const recency = computeRecency(entry.createdAt);
        const agentMatch = params.agentId && entry.agentId === params.agentId ? 0.1 : 0;
        const tagBoost = computeTagBoost(queryTerms, entry.tags || []);

        const rawScore = textMatch * 0.5 + recency * recencyWeight + agentMatch + tagBoost;
        const confidence = Math.min(rawScore, 1);

        return {
            id: entry.id,
            orgId: entry.orgId,
            agentId: entry.agentId,
            agentName: entry.agentName,
            type: entry.type,
            contentCid: entry.contentCid,
            title: entry.title,
            tags: entry.tags,
            sizeBytes: entry.sizeBytes,
            createdAt: entry.createdAt,
            confidence,
            scoreBreakdown: { textMatch, recency, agentMatch, tagBoost },
            spaceId: entry.spaceId,
            gatewayUrl: buildRetrievalUrl(entry.contentCid),
        };
    });

    // Deduplicate by CID (keep highest score)
    const cidMap = new Map<string, ScoredMemoryEntry>();
    for (const entry of scored) {
        const existing = cidMap.get(entry.contentCid);
        if (!existing || entry.confidence > existing.confidence) {
            cidMap.set(entry.contentCid, entry);
        }
    }
    const deduped = Array.from(cidMap.values());
    const deduplicated = scored.length - deduped.length;

    // Filter by confidence threshold, sort, and limit
    const results = deduped
        .filter((e) => e.confidence >= minConfidence)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxResults);

    return {
        ok: true,
        query: params.query,
        results,
        totalCandidates,
        deduplicated,
        retrievalTimeMs: Date.now() - startTime,
    };
}

// ═══════════════════════════════════════════════════════════════
// Retrieval Analytics
// ═══════════════════════════════════════════════════════════════

/** Record a retrieval query for analytics. */
export async function recordRetrieval(
    log: Omit<RetrievalLogEntry, "id" | "createdAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTIONS.retrievalLogs), {
        ...log,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

/** Get retrieval logs for an org (most recent first). */
export async function getRetrievalLogs(
    orgId: string,
    days: number = 30,
    max: number = 100,
): Promise<RetrievalLogEntry[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const q = query(
        collection(db, COLLECTIONS.retrievalLogs),
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
        firestoreLimit(max),
    );
    const snap = await getDocs(q);

    return snap.docs
        .map((d) => {
            const data = d.data();
            return {
                id: d.id,
                orgId: data.orgId,
                query: data.query,
                queryBy: data.queryBy,
                queryByType: data.queryByType,
                resultCount: data.resultCount,
                topConfidence: data.topConfidence,
                retrievalTimeMs: data.retrievalTimeMs,
                spaceIds: data.spaceIds,
                createdAt: toDate(data.createdAt),
            } as RetrievalLogEntry;
        })
        .filter((r) => !r.createdAt || r.createdAt >= cutoff);
}

/** Get daily analytics for an org. */
export async function getDailyAnalytics(
    orgId: string,
    days: number = 30,
): Promise<DailyAnalytics[]> {
    const q = query(
        collection(db, COLLECTIONS.dailyAnalytics),
        where("orgId", "==", orgId),
        orderBy("date", "desc"),
        firestoreLimit(days),
    );
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            date: data.date,
            totalQueries: data.totalQueries || 0,
            totalMemoriesWritten: data.totalMemoriesWritten || 0,
            uniqueAgents: data.uniqueAgents || 0,
            avgConfidence: data.avgConfidence || 0,
            avgRetrievalTimeMs: data.avgRetrievalTimeMs || 0,
            staleEntryCount: data.staleEntryCount || 0,
            totalStorageBytes: data.totalStorageBytes || 0,
            createdAt: toDate(data.createdAt),
        } as DailyAnalytics;
    });
}

/** Compose a full analytics dashboard for an org. */
export async function getAnalyticsDashboard(
    orgId: string,
): Promise<AnalyticsDashboardData> {
    const [logs, daily, spaces] = await Promise.all([
        getRetrievalLogs(orgId, 30, 500),
        getDailyAnalytics(orgId, 30),
        getSpaces(orgId),
    ]);

    // Period summary from logs
    const totalQueries = logs.length;
    const avgConfidence =
        totalQueries > 0
            ? logs.reduce((sum, l) => sum + (l.topConfidence || 0), 0) / totalQueries
            : 0;
    const avgRetrievalTimeMs =
        totalQueries > 0
            ? logs.reduce((sum, l) => sum + l.retrievalTimeMs, 0) / totalQueries
            : 0;

    // Count writes from daily analytics
    const totalWrites = daily.reduce((sum, d) => sum + d.totalMemoriesWritten, 0);

    // Top agents by query count
    const agentCounts = new Map<string, number>();
    for (const log of logs) {
        if (log.queryByType === "agent") {
            agentCounts.set(log.queryBy, (agentCounts.get(log.queryBy) || 0) + 1);
        }
    }
    const topAgents = Array.from(agentCounts.entries())
        .map(([agentId, queryCount]) => ({ agentId, queryCount }))
        .sort((a, b) => b.queryCount - a.queryCount)
        .slice(0, 10);

    // Stale count from most recent daily analytics
    const staleCount = daily.length > 0 ? daily[0].staleEntryCount : 0;

    // Growth: entries this week vs last week
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeekDays = daily.filter((d) => new Date(d.date) >= oneWeekAgo);
    const lastWeekDays = daily.filter(
        (d) => new Date(d.date) >= twoWeeksAgo && new Date(d.date) < oneWeekAgo,
    );

    const entriesThisWeek = thisWeekDays.reduce((s, d) => s + d.totalMemoriesWritten, 0);
    const entriesLastWeek = lastWeekDays.reduce((s, d) => s + d.totalMemoriesWritten, 0);
    const growthPercent =
        entriesLastWeek > 0
            ? ((entriesThisWeek - entriesLastWeek) / entriesLastWeek) * 100
            : entriesThisWeek > 0
                ? 100
                : 0;

    return {
        period: {
            totalQueries,
            totalWrites,
            avgConfidence: Math.round(avgConfidence * 100) / 100,
            avgRetrievalTimeMs: Math.round(avgRetrievalTimeMs),
        },
        daily,
        topAgents,
        staleCount,
        growth: {
            entriesThisWeek,
            entriesLastWeek,
            growthPercent: Math.round(growthPercent * 10) / 10,
        },
        spaces: spaces.map((s) => ({
            spaceId: s.id,
            name: s.name,
            entryCount: s.entryCount,
        })),
    };
}
