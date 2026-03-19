/**
 * POST /api/v1/artifacts/upload-encrypted
 *
 * Upload an artifact with server-side AES-256-GCM encryption before IPFS storage.
 * Content is encrypted per-org so only org members can decrypt.
 *
 * Form fields:
 *   file          — Binary file (required)
 *   orgId         — Organization ID (required)
 *   agentId       — Agent ID (optional)
 *   artifactType  — screenshot | output | log | report (required)
 *   metadata      — JSON string with additional metadata (optional)
 *
 * Auth: x-wallet-address or agent Ed25519/API key
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
import { encryptContent, isEncryptionAvailable } from "@/lib/storacha/encryption";
import type { ArtifactType } from "@/lib/storacha/types";

const VALID_ARTIFACT_TYPES: ArtifactType[] = ["screenshot", "output", "log", "report"];
const MAX_ARTIFACT_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_PREFIXES = [
    "image/", "text/", "application/json", "application/pdf",
    "application/octet-stream", "application/zip", "application/gzip",
];

function sanitizeFilename(name: string): string {
    return name
        .replace(/[/\\]/g, "_")
        .replace(/\.\./g, "_")
        .replace(/[\x00-\x1f]/g, "")
        .slice(0, 255) || "unnamed";
}

export async function POST(req: NextRequest) {
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "POST:/v1/artifacts/upload-encrypted")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json(
            { error: "Authentication required." },
            { status: 401 },
        );
    }

    if (!isStorachaConfigured()) {
        return Response.json({ error: "Storacha storage not configured" }, { status: 503 });
    }

    if (!isEncryptionAvailable()) {
        return Response.json({ error: "Content encryption not available (SESSION_SECRET missing)" }, { status: 503 });
    }

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return Response.json(
            { error: "Invalid form data." },
            { status: 400 },
        );
    }

    const file = formData.get("file") as File | null;
    const orgId = (formData.get("orgId") as string)?.trim();
    const agentId = (formData.get("agentId") as string)?.trim() || undefined;
    const artifactType = (formData.get("artifactType") as string)?.trim();
    const metadataStr = formData.get("metadata") as string | null;

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
        return Response.json({ error: "File exceeds 50 MB limit" }, { status: 413 });
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
        return Response.json(
            { error: `Unsupported file type: ${mimeType}` },
            { status: 415 },
        );
    }

    const quotaError = await checkQuota(orgId, file.size);
    if (quotaError) {
        return Response.json({ error: quotaError }, { status: 413 });
    }

    let metadata: Record<string, unknown> | undefined;
    if (metadataStr) {
        try { metadata = JSON.parse(metadataStr); } catch { /* ignore */ }
    }

    try {
        // Read file into Buffer
        const arrayBuffer = await file.arrayBuffer();
        const plaintext = Buffer.from(arrayBuffer);

        // Encrypt content
        const encrypted = encryptContent(plaintext, orgId);

        // Upload encrypted content to IPFS
        const safeFilename = sanitizeFilename(file.name);
        const { cid, sizeBytes } = await uploadContent(
            encrypted,
            `${safeFilename}.enc`,
        );

        await recordCidLink(cid, "default-space", sizeBytes);

        const uploadedBy = wallet || agentAuth?.agent?.agentId || "unknown";
        const id = await addArtifactRecord({
            orgId,
            agentId,
            artifactType: artifactType as ArtifactType,
            contentCid: cid,
            filename: safeFilename,
            mimeType,
            sizeBytes: file.size, // original size
            metadata: { ...metadata, encrypted: true, encryptedSizeBytes: sizeBytes },
            uploadedBy,
        });

        return Response.json({
            ok: true,
            id,
            cid,
            encrypted: true,
            filename: safeFilename,
            mimeType,
            sizeBytes: file.size,
            gatewayUrl: buildRetrievalUrl(cid),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to upload encrypted artifact" },
            { status: 500 },
        );
    }
}
