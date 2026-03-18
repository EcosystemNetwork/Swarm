/**
 * GET /api/v1/memory/shared?orgId=...&type=...&limit=20
 * POST /api/v1/memory/shared  (write shared memory visible to all agents in org)
 *
 * Shared multi-agent memory — any agent in the org can read/write.
 * GET returns all Storacha memory entries for the org (across all agents).
 * POST writes a shared memory entry (no agentId filter — org-wide).
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import {
    getStorachaMemoryEntries,
    addStorachaMemoryEntry,
    recordCidLink,
} from "@/lib/storacha/cid-index";
import {
    uploadContent,
    isStorachaConfigured,
    buildRetrievalUrl,
    retrieveContent,
} from "@/lib/storacha/client";
import type { StorachaMemoryType } from "@/lib/storacha/types";

const VALID_TYPES: StorachaMemoryType[] = ["journal", "long_term", "workspace", "vector"];

function authenticate(req: NextRequest) {
    return { wallet: getWalletAddress(req) };
}

export async function GET(req: NextRequest) {
    const { wallet } = authenticate(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/shared")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    const type = req.nextUrl.searchParams.get("type") as StorachaMemoryType | null;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const maxEntries = Math.min(parseInt(limitParam || "20", 10) || 20, 100);

    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    try {
        // Get all memory entries for the org (no agentId filter = shared/org-wide)
        const entries = await getStorachaMemoryEntries(orgId, undefined, type || undefined);
        const limited = entries.slice(0, maxEntries);

        // Optionally fetch content for the entries
        const includeContent = req.nextUrl.searchParams.get("content") === "true";

        if (includeContent) {
            const enriched = await Promise.allSettled(
                limited.map(async (entry) => {
                    try {
                        const response = await retrieveContent(entry.contentCid);
                        const content = await response.text();
                        return { ...entry, content, gatewayUrl: buildRetrievalUrl(entry.contentCid) };
                    } catch {
                        return { ...entry, content: null, gatewayUrl: buildRetrievalUrl(entry.contentCid) };
                    }
                }),
            );
            const memories = enriched
                .filter((r) => r.status === "fulfilled")
                .map((r) => (r as PromiseFulfilledResult<unknown>).value);
            return Response.json({ ok: true, count: memories.length, totalAvailable: entries.length, memories });
        }

        return Response.json({
            ok: true,
            count: limited.length,
            totalAvailable: entries.length,
            memories: limited.map((e) => ({
                ...e,
                gatewayUrl: buildRetrievalUrl(e.contentCid),
            })),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to list shared memory" },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    const { wallet } = authenticate(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "POST:/v1/memory/shared")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!isStorachaConfigured()) {
        return Response.json({ error: "Storacha storage not configured" }, { status: 503 });
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const orgId = body.orgId as string;
    const agentId = (body.agentId as string) || "shared";
    const agentName = body.agentName as string | undefined;
    const type = body.type as StorachaMemoryType;
    const title = body.title as string;
    const content = body.content as string;
    const tags = (body.tags as string[]) || [];

    if (!orgId || !type || !title || !content) {
        return Response.json(
            { error: "Required: orgId, type, title, content" },
            { status: 400 },
        );
    }

    if (!VALID_TYPES.includes(type)) {
        return Response.json(
            { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
            { status: 400 },
        );
    }

    const contentBytes = new TextEncoder().encode(content).length;
    if (contentBytes > 10 * 1024 * 1024) {
        return Response.json({ error: "Content exceeds 10 MB limit" }, { status: 413 });
    }

    try {
        const { cid, sizeBytes } = await uploadContent(
            Buffer.from(content),
            `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`,
        );

        await recordCidLink(cid, "default-space", sizeBytes);

        const id = await addStorachaMemoryEntry({
            orgId,
            agentId,
            agentName: agentName || "Shared Memory",
            type,
            contentCid: cid,
            title,
            tags: ["shared", ...tags],
            sizeBytes,
        });

        return Response.json({
            ok: true,
            id,
            cid,
            sizeBytes,
            gatewayUrl: buildRetrievalUrl(cid),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to write shared memory" },
            { status: 500 },
        );
    }
}
