/**
 * Swarm Memory Pro — Types for premium memory features.
 *
 * Memory spaces, permissions, premium retrieval, and analytics.
 * Extends the base Storacha types without modifying them.
 */

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Marketplace item ID for the Memory Pro mod */
export const MEMORY_PRO_ITEM_ID = "memory-pro";

/** Pro quota overrides (higher than DEFAULT_QUOTA) */
export const PRO_QUOTA_OVERRIDES = {
    maxStorageBytes: 25 * 1024 * 1024 * 1024,   // 25 GB (vs 5 GB free)
    maxMemoryEntries: 50_000,                     // vs 10,000 free
    maxArtifactRecords: 25_000,                   // vs 5,000 free
    maxSpaces: 20,
    maxMembersPerSpace: 50,
} as const;

// ═══════════════════════════════════════════════════════════════
// Memory Spaces
// ═══════════════════════════════════════════════════════════════

export type SpaceVisibility = "private" | "org" | "public";

export interface MemorySpace {
    id: string;
    orgId: string;
    name: string;
    description?: string;
    visibility: SpaceVisibility;
    tags?: string[];
    projectId?: string;
    createdBy: string;
    entryCount: number;
    createdAt: Date | null;
    updatedAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Space Membership & Permissions
// ═══════════════════════════════════════════════════════════════

export type SpaceSubjectType = "user" | "agent" | "org";
export type SpaceRole = "reader" | "writer" | "admin";

export interface SpaceMember {
    id: string;
    spaceId: string;
    orgId: string;
    subjectType: SpaceSubjectType;
    /** Wallet address for users, agentId for agents, orgId for orgs */
    subjectId: string;
    subjectName?: string;
    role: SpaceRole;
    addedBy: string;
    createdAt: Date | null;
}

export interface SpaceAccessResult {
    allowed: boolean;
    role?: SpaceRole;
    reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// Premium Retrieval
// ═══════════════════════════════════════════════════════════════

export interface PremiumRetrievalQuery {
    orgId: string;
    query: string;
    spaceIds?: string[];
    agentId?: string;
    type?: string;
    limit?: number;
    minConfidence?: number;
    recencyWeight?: number;
}

export interface ScoreBreakdown {
    textMatch: number;
    recency: number;
    agentMatch: number;
    tagBoost: number;
}

export interface ScoredMemoryEntry {
    id: string;
    orgId: string;
    agentId: string;
    agentName?: string;
    type: string;
    contentCid: string;
    title: string;
    tags?: string[];
    sizeBytes?: number;
    createdAt: Date | null;
    confidence: number;
    scoreBreakdown: ScoreBreakdown;
    spaceId?: string;
    gatewayUrl: string;
}

export interface PremiumRetrievalResult {
    ok: boolean;
    query: string;
    results: ScoredMemoryEntry[];
    totalCandidates: number;
    deduplicated: number;
    retrievalTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════
// Retrieval Analytics
// ═══════════════════════════════════════════════════════════════

export interface RetrievalLogEntry {
    id: string;
    orgId: string;
    query: string;
    queryBy: string;
    queryByType: "user" | "agent";
    resultCount: number;
    topConfidence?: number;
    retrievalTimeMs: number;
    spaceIds?: string[];
    createdAt: Date | null;
}

export interface DailyAnalytics {
    id: string;
    orgId: string;
    date: string;
    totalQueries: number;
    totalMemoriesWritten: number;
    uniqueAgents: number;
    avgConfidence: number;
    avgRetrievalTimeMs: number;
    staleEntryCount: number;
    totalStorageBytes: number;
    createdAt: Date | null;
}

export interface AnalyticsDashboardData {
    period: {
        totalQueries: number;
        totalWrites: number;
        avgConfidence: number;
        avgRetrievalTimeMs: number;
    };
    daily: DailyAnalytics[];
    topAgents: { agentId: string; agentName?: string; queryCount: number }[];
    staleCount: number;
    growth: {
        entriesThisWeek: number;
        entriesLastWeek: number;
        growthPercent: number;
    };
    spaces: { spaceId: string; name: string; entryCount: number }[];
}
