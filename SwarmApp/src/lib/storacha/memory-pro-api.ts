/**
 * Memory Pro Client-Side API — Browser-safe helpers for premium memory features.
 *
 * Used by UI components (Memory Pro dashboard, Spaces page, Analytics).
 * These call the server-side API routes — never Firestore directly.
 */

import type {
    MemorySpace,
    SpaceMember,
    SpaceRole,
    SpaceSubjectType,
    SpaceVisibility,
    PremiumRetrievalResult,
    AnalyticsDashboardData,
} from "./memory-pro-types";

// ═══════════════════════════════════════════════════════════════
// Spaces
// ═══════════════════════════════════════════════════════════════

export async function getSpaces(
    orgId: string,
    walletAddress: string,
): Promise<{ ok: boolean; count: number; spaces: MemorySpace[] }> {
    const res = await fetch(`/api/v1/memory/pro/spaces?orgId=${orgId}`, {
        headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load spaces");
    }
    return res.json();
}

export interface CreateSpaceParams {
    orgId: string;
    name: string;
    description?: string;
    visibility: SpaceVisibility;
    tags?: string[];
    projectId?: string;
}

export async function createSpace(
    data: CreateSpaceParams,
    walletAddress: string,
): Promise<{ ok: boolean; id: string }> {
    const res = await fetch("/api/v1/memory/pro/spaces", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to create space");
    }
    return res.json();
}

export interface UpdateSpaceParams {
    orgId: string;
    name?: string;
    description?: string;
    visibility?: SpaceVisibility;
    tags?: string[];
}

export async function updateSpace(
    spaceId: string,
    data: UpdateSpaceParams,
    walletAddress: string,
): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/v1/memory/pro/spaces/${spaceId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to update space");
    }
    return res.json();
}

export async function deleteSpace(
    spaceId: string,
    orgId: string,
    walletAddress: string,
): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/v1/memory/pro/spaces/${spaceId}?orgId=${orgId}`, {
        method: "DELETE",
        headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to delete space");
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Members
// ═══════════════════════════════════════════════════════════════

export async function getSpaceMembers(
    spaceId: string,
    orgId: string,
    walletAddress: string,
): Promise<{ ok: boolean; count: number; members: SpaceMember[] }> {
    const res = await fetch(
        `/api/v1/memory/pro/spaces/${spaceId}/members?orgId=${orgId}`,
        { headers: { "x-wallet-address": walletAddress } },
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load members");
    }
    return res.json();
}

export interface AddMemberParams {
    orgId: string;
    subjectType: SpaceSubjectType;
    subjectId: string;
    subjectName?: string;
    role: SpaceRole;
}

export async function addSpaceMember(
    spaceId: string,
    data: AddMemberParams,
    walletAddress: string,
): Promise<{ ok: boolean; id: string }> {
    const res = await fetch(`/api/v1/memory/pro/spaces/${spaceId}/members`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to add member");
    }
    return res.json();
}

export async function removeSpaceMember(
    spaceId: string,
    memberId: string,
    orgId: string,
    walletAddress: string,
): Promise<{ ok: boolean }> {
    const res = await fetch(
        `/api/v1/memory/pro/spaces/${spaceId}/members/${memberId}?orgId=${orgId}`,
        {
            method: "DELETE",
            headers: { "x-wallet-address": walletAddress },
        },
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to remove member");
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Premium Retrieval
// ═══════════════════════════════════════════════════════════════

export interface RetrieveParams {
    orgId: string;
    query: string;
    spaceIds?: string[];
    agentId?: string;
    type?: string;
    limit?: number;
    minConfidence?: number;
    recencyWeight?: number;
}

export async function premiumRetrieve(
    params: RetrieveParams,
    walletAddress: string,
): Promise<PremiumRetrievalResult> {
    const res = await fetch("/api/v1/memory/pro/retrieve", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
        },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to execute retrieval");
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Analytics & Dashboard
// ═══════════════════════════════════════════════════════════════

export async function getAnalytics(
    orgId: string,
    walletAddress: string,
    days?: number,
): Promise<{ ok: boolean } & AnalyticsDashboardData> {
    const params = new URLSearchParams({ orgId });
    if (days) params.set("days", String(days));
    const res = await fetch(`/api/v1/memory/pro/analytics?${params}`, {
        headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load analytics");
    }
    return res.json();
}

export async function getDashboard(
    orgId: string,
    walletAddress: string,
): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/v1/memory/pro/dashboard?orgId=${orgId}`, {
        headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to load dashboard");
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════

export type {
    MemorySpace,
    SpaceMember,
    SpaceRole,
    SpaceSubjectType,
    SpaceVisibility,
    PremiumRetrievalResult,
    AnalyticsDashboardData,
};
