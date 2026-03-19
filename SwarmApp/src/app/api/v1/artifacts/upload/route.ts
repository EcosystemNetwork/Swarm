/**
 * POST /api/v1/artifacts/upload
 *
 * Upload an artifact to Storacha content-addressed storage.
 * Accepts multipart/form-data with a file and metadata fields.
 * Returns the CID and gateway URL for retrieval.
 *
 * Form fields:
 *   file          — Binary file (required)
 *   orgId         — Organization ID (required)
 *   agentId       — Agent ID (optional)
 *   artifactType  — screenshot | output | log | report (required)
 *   metadata      — JSON string with additional metadata (optional)
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
    addArtifactRecord,
    checkQuota,
} from "@/lib/storacha/cid-index";
import type { ArtifactType } from "@/lib/storacha/types";

const VALID_ARTIFACT_TYPES: ArtifactType[] = ["screenshot", "output", "log", "report"];
const MAX_ARTIFACT_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_PREFIXES = [
    "image/", "text/", "application/json", "application/pdf",
    "application/octet-stream", "application/zip", "application/gzip",
];

/** Sanitize filename — strip path traversal and non-ASCII control chars */
function sanitizeFilename(name: string): string {
    return name
        .replace(/[/\\]/g, "_")       // strip path separators
        .replace(/\.\./g, "_")        // strip directory traversal
        .replace(/[\x00-\x1f]/g, "")  // strip control chars
        .slice(0, 255) || "unnamed";
}

export async function POST(req: NextRequest) {
    // ── Auth ──────────────────────────────────────────────
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "POST:/v1/artifacts/upload")
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

    // ── Parse multipart form data ────────────────────────
    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return Response.json(
            { error: "Invalid form data. Content-Type must be multipart/form-data." },
            { status: 400 },
        );
    }

    const file = formData.get("file") as File | null;
    const orgId = (formData.get("orgId") as string)?.trim();
    const agentId = (formData.get("agentId") as string)?.trim() || undefined;
    const artifactType = (formData.get("artifactType") as string)?.trim();
    const metadataStr = formData.get("metadata") as string | null;

    // ── Validate ─────────────────────────────────────────
    if (!file || !orgId || !artifactType) {
        return Response.json(
            { error: "Required fields: file, orgId, artifactType" },
            { status: 400 },
        );
    }

    if (!VALID_ARTIFACT_TYPES.includes(artifactType as ArtifactType)) {
        return Response.json(
            { error: `artifactType must be one of: ${VALID_ARTIFACT_TYPES.join(", ")}` },
            { status: 400 },
        );
    }

    if (file.size > MAX_ARTIFACT_SIZE) {
        return Response.json(
            { error: "File exceeds 50 MB limit" },
            { status: 413 },
        );
    }

    // ── MIME type validation ──────────────────────────────
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
        return Response.json(
            { error: `Unsupported file type: ${mimeType}` },
            { status: 415 },
        );
    }

    // ── Quota check ───────────────────────────────────────
    const quotaError = await checkQuota(orgId, file.size);
    if (quotaError) {
        return Response.json({ error: quotaError }, { status: 413 });
    }

    // Parse optional metadata
    let metadata: Record<string, unknown> | undefined;
    if (metadataStr) {
        try {
            metadata = JSON.parse(metadataStr);
        } catch {
            // Ignore invalid metadata JSON
        }
    }

    // ── Upload to Storacha ───────────────────────────────
    try {
        const safeFilename = sanitizeFilename(file.name);
        const { cid, sizeBytes } = await uploadContent(file, safeFilename);

        // Record CID link
        await recordCidLink(cid, "default-space", sizeBytes);

        // Record artifact
        const uploadedBy = wallet || agentAuth?.agent?.agentId || "unknown";
        const id = await addArtifactRecord({
            orgId,
            agentId,
            artifactType: artifactType as ArtifactType,
            contentCid: cid,
            filename: safeFilename,
            mimeType,
            sizeBytes,
            metadata,
            uploadedBy,
        });

        return Response.json({
            ok: true,
            id,
            cid,
            filename: safeFilename,
            mimeType,
            sizeBytes,
            gatewayUrl: buildRetrievalUrl(cid),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to upload artifact" },
            { status: 500 },
        );
    }
}
