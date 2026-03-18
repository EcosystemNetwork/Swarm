/**
 * GET /api/v1/memory/restore?orgId=...&agentId=...&type=...&limit=10
 *
 * Restore Storacha-backed memory entries for an agent session.
 * Returns memory content (fetched from IPFS) for the agent to load into context.
 *
 * Auth: x-wallet-address (org member) or agent Ed25519/API key
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { getStorachaMemoryEntries } from "@/lib/storacha/cid-index";
import { retrieveContent, buildRetrievalUrl } from "@/lib/storacha/client";
import type { StorachaMemoryType } from "@/lib/storacha/types";

const VALID_TYPES: StorachaMemoryType[] = ["journal", "long_term", "workspace", "vector"];

export async function GET(req: NextRequest) {
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/restore")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json(
            { error: "Authentication required." },
            { status: 401 },
        );
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    const agentId = req.nextUrl.searchParams.get("agentId");
    const type = req.nextUrl.searchParams.get("type") as StorachaMemoryType | null;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const maxEntries = Math.min(parseInt(limitParam || "10", 10) || 10, 50);

    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    if (type && !VALID_TYPES.includes(type)) {
        return Response.json(
            { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
            { status: 400 },
        );
    }

    try {
        const entries = await getStorachaMemoryEntries(
            orgId,
            agentId || undefined,
            type || undefined,
        );

        const limited = entries.slice(0, maxEntries);

        // Fetch content from IPFS in parallel
        const restored = await Promise.allSettled(
            limited.map(async (entry) => {
                try {
                    const response = await retrieveContent(entry.contentCid);
                    const content = await response.text();
                    return {
                        id: entry.id,
                        agentId: entry.agentId,
                        agentName: entry.agentName,
                        type: entry.type,
                        title: entry.title,
                        content,
                        cid: entry.contentCid,
                        tags: entry.tags,
                        sizeBytes: entry.sizeBytes,
                        createdAt: entry.createdAt,
                        gatewayUrl: buildRetrievalUrl(entry.contentCid),
                    };
                } catch {
                    // If IPFS retrieval fails, return metadata without content
                    return {
                        id: entry.id,
                        agentId: entry.agentId,
                        agentName: entry.agentName,
                        type: entry.type,
                        title: entry.title,
                        content: null,
                        cid: entry.contentCid,
                        tags: entry.tags,
                        sizeBytes: entry.sizeBytes,
                        createdAt: entry.createdAt,
                        gatewayUrl: buildRetrievalUrl(entry.contentCid),
                        error: "Failed to retrieve content from IPFS",
                    };
                }
            }),
        );

        const memories = restored
            .filter((r) => r.status === "fulfilled")
            .map((r) => (r as PromiseFulfilledResult<unknown>).value);

        return Response.json({
            ok: true,
            orgId,
            agentId: agentId || undefined,
            type: type || undefined,
            count: memories.length,
            totalAvailable: entries.length,
            memories,
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to restore memory" },
            { status: 500 },
        );
    }
}
