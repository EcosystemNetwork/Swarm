/**
 * POST /api/v1/marketplace/review-artifact
 *
 * Attach an evidence artifact to a marketplace review.
 * Uploads the file to Storacha and returns the CID for inclusion
 * in the ReviewEntry.artifactCids array.
 *
 * Form fields:
 *   file          — Binary file (required)
 *   submissionId  — ID of the submission being reviewed (required)
 *   artifactType  — screenshot | output | log | report (default: screenshot)
 *
 * Auth: x-wallet-address (platform admin only)
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import {
    uploadContent,
    isStorachaConfigured,
    buildRetrievalUrl,
} from "@/lib/storacha/client";
import {
    recordCidLink,
    addArtifactRecord,
} from "@/lib/storacha/cid-index";
import type { ArtifactType } from "@/lib/storacha/types";

const VALID_ARTIFACT_TYPES: ArtifactType[] = ["screenshot", "output", "log", "report"];
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
    const wallet = getWalletAddress(req);
    if (!wallet) {
        return Response.json(
            { error: "Authentication required. Admin wallet address needed." },
            { status: 401 },
        );
    }

    if (!isStorachaConfigured()) {
        return Response.json({ error: "Storacha storage not configured" }, { status: 503 });
    }

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
    const submissionId = (formData.get("submissionId") as string)?.trim();
    const artifactType = ((formData.get("artifactType") as string)?.trim() || "screenshot") as ArtifactType;

    if (!file || !submissionId) {
        return Response.json(
            { error: "Required fields: file, submissionId" },
            { status: 400 },
        );
    }

    if (!VALID_ARTIFACT_TYPES.includes(artifactType)) {
        return Response.json(
            { error: `artifactType must be one of: ${VALID_ARTIFACT_TYPES.join(", ")}` },
            { status: 400 },
        );
    }

    if (file.size > MAX_SIZE) {
        return Response.json({ error: "File exceeds 50 MB limit" }, { status: 413 });
    }

    try {
        const { cid, sizeBytes } = await uploadContent(file, file.name);

        await recordCidLink(cid, "default-space", sizeBytes);

        await addArtifactRecord({
            orgId: `review:${submissionId}`,
            artifactType,
            contentCid: cid,
            filename: file.name || "review-evidence",
            mimeType: file.type || "application/octet-stream",
            sizeBytes,
            metadata: { submissionId, reviewContext: true },
            uploadedBy: wallet,
        });

        return Response.json({
            ok: true,
            cid,
            filename: file.name || "review-evidence",
            sizeBytes,
            gatewayUrl: buildRetrievalUrl(cid),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to upload review artifact" },
            { status: 500 },
        );
    }
}
