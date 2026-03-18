/**
 * GET /api/v1/storacha/timeline?orgId=...&limit=50
 *
 * Admin evidence timeline — unified chronological view of all Storacha
 * activity (memory writes + artifact uploads) for an organization.
 *
 * Returns a merged, time-sorted list of memory entries and artifact records.
 *
 * Auth: x-wallet-address (org member)
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { getStorachaMemoryEntries, getArtifactRecords } from "@/lib/storacha/cid-index";
import { buildRetrievalUrl } from "@/lib/storacha/client";

interface TimelineEntry {
    id: string;
    kind: "memory" | "artifact";
    orgId: string;
    agentId?: string;
    agentName?: string;
    title: string;
    cid: string;
    sizeBytes: number;
    gatewayUrl: string;
    createdAt: string | null;
    // Memory-specific
    memoryType?: string;
    tags?: string[];
    // Artifact-specific
    artifactType?: string;
    filename?: string;
    mimeType?: string;
    uploadedBy?: string;
}

export async function GET(req: NextRequest) {
    const wallet = getWalletAddress(req);
    if (!wallet) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    const limitParam = req.nextUrl.searchParams.get("limit");
    const maxEntries = Math.min(parseInt(limitParam || "50", 10) || 50, 200);

    try {
        // Fetch both collections in parallel
        const [memories, artifacts] = await Promise.all([
            getStorachaMemoryEntries(orgId),
            getArtifactRecords(orgId),
        ]);

        // Map to unified timeline entries
        const timeline: TimelineEntry[] = [];

        for (const m of memories) {
            timeline.push({
                id: m.id,
                kind: "memory",
                orgId: m.orgId,
                agentId: m.agentId,
                agentName: m.agentName,
                title: m.title,
                cid: m.contentCid,
                sizeBytes: m.sizeBytes || 0,
                gatewayUrl: buildRetrievalUrl(m.contentCid),
                createdAt: m.createdAt?.toISOString() || null,
                memoryType: m.type,
                tags: m.tags,
            });
        }

        for (const a of artifacts) {
            timeline.push({
                id: a.id,
                kind: "artifact",
                orgId: a.orgId,
                agentId: a.agentId,
                title: a.filename,
                cid: a.contentCid,
                sizeBytes: a.sizeBytes,
                gatewayUrl: buildRetrievalUrl(a.contentCid),
                createdAt: a.createdAt?.toISOString() || null,
                artifactType: a.artifactType,
                filename: a.filename,
                mimeType: a.mimeType,
                uploadedBy: a.uploadedBy,
            });
        }

        // Sort by createdAt descending
        timeline.sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });

        return Response.json({
            ok: true,
            count: Math.min(timeline.length, maxEntries),
            totalAvailable: timeline.length,
            timeline: timeline.slice(0, maxEntries),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to load timeline" },
            { status: 500 },
        );
    }
}
