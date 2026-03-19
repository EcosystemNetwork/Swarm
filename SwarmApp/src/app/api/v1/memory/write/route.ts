/**
 * POST /api/v1/memory/write
 *
 * Write a memory entry with Storacha content-addressed storage.
 * Content is uploaded to Storacha (IPFS), and the CID is recorded in Firestore.
 * Also writes to legacy agentMemories collection for backward compatibility.
 *
 * Body: { orgId, agentId, agentName?, type, title, content, tags? }
 *
 * Auth: x-wallet-address (org member) or agent Ed25519/API key
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import {
    uploadContent,
    isStorachaConfigured,
    buildRetrievalUrl,
} from "@/lib/storacha/client";
import {
    recordCidLink,
    addStorachaMemoryEntry,
    checkQuota,
} from "@/lib/storacha/cid-index";
import { addMemoryEntry } from "@/lib/memory";
import type { StorachaMemoryType } from "@/lib/storacha/types";

const VALID_TYPES: StorachaMemoryType[] = ["journal", "long_term", "workspace", "vector"];
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
    // ── Auth ──────────────────────────────────────────────
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "POST:/v1/memory/write")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json(
            { error: "Authentication required. Provide x-wallet-address header or agent credentials." },
            { status: 401 },
        );
    }

    // ── Check Storacha configured ────────────────────────
    if (!isStorachaConfigured()) {
        return Response.json(
            { error: "Storacha storage not configured" },
            { status: 503 },
        );
    }

    // ── Parse body ───────────────────────────────────────
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const orgId = (body.orgId as string)?.trim();
    const agentId = (body.agentId as string)?.trim();
    const agentName = (body.agentName as string)?.trim() || undefined;
    const type = body.type as string;
    const title = (body.title as string)?.trim().slice(0, 200);
    const content = body.content as string;
    const tags = Array.isArray(body.tags)
        ? (body.tags as string[]).map((t) => String(t).trim().slice(0, 50)).filter(Boolean).slice(0, 20)
        : undefined;

    if (!orgId || !agentId || !type || !title || !content) {
        return Response.json(
            { error: "Required fields: orgId, agentId, type, title, content" },
            { status: 400 },
        );
    }

    if (!VALID_TYPES.includes(type as StorachaMemoryType)) {
        return Response.json(
            { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
            { status: 400 },
        );
    }

    // ── Validate content size ────────────────────────────
    const contentBuffer = Buffer.from(content, "utf-8");
    if (contentBuffer.byteLength > MAX_CONTENT_SIZE) {
        return Response.json(
            { error: "Content exceeds 10 MB limit" },
            { status: 413 },
        );
    }

    // ── Quota check ────────────────────────────────────────
    const quotaError = await checkQuota(orgId, contentBuffer.byteLength);
    if (quotaError) {
        return Response.json({ error: quotaError }, { status: 413 });
    }

    // ── Upload to Storacha ───────────────────────────────
    try {
        const { cid, sizeBytes } = await uploadContent(
            contentBuffer,
            `${title.replace(/[^a-zA-Z0-9._-]/g, "_")}.md`,
        );

        // Record CID link
        await recordCidLink(cid, "default-space", sizeBytes);

        // Record Storacha memory entry
        const id = await addStorachaMemoryEntry({
            orgId,
            agentId,
            agentName,
            type: type as StorachaMemoryType,
            contentCid: cid,
            title,
            tags,
            sizeBytes,
        });

        // Backward compat: also write to legacy agentMemories (non-blocking)
        addMemoryEntry({
            orgId,
            agentId,
            agentName,
            type: type as StorachaMemoryType,
            title,
            content,
            tags,
            sizeBytes,
        }).catch(() => {}); // non-blocking

        return Response.json({
            ok: true,
            id,
            cid,
            sizeBytes,
            gatewayUrl: buildRetrievalUrl(cid),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to upload to Storacha" },
            { status: 500 },
        );
    }
}
