/**
 * GET /api/v1/artifacts/:cid
 * GET /api/v1/artifacts/:cid?meta=true  (metadata only)
 *
 * Retrieve an artifact by CID from Storacha (IPFS gateway).
 * Returns raw binary content with appropriate Content-Type,
 * or metadata JSON if ?meta=true is specified.
 *
 * Auth: x-wallet-address (org member) or agent Ed25519/API key
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { retrieveContent, buildRetrievalUrl } from "@/lib/storacha/client";
import { getArtifactByCid } from "@/lib/storacha/cid-index";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ cid: string }> },
) {
    const { cid } = await params;

    if (!cid) {
        return Response.json({ error: "CID is required" }, { status: 400 });
    }

    // ── Auth ──────────────────────────────────────────────
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/artifacts")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json(
            { error: "Authentication required. Provide x-wallet-address header or agent credentials." },
            { status: 401 },
        );
    }

    // ── Look up artifact metadata ────────────────────────
    const artifact = await getArtifactByCid(cid);
    if (!artifact) {
        return Response.json({ error: "Artifact not found" }, { status: 404 });
    }

    // ── Verify org ownership (prevent cross-org access) ──
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) {
        return Response.json(
            { error: "orgId query parameter is required" },
            { status: 400 },
        );
    }
    if (artifact.orgId !== orgId) {
        return Response.json({ error: "Artifact not found" }, { status: 404 });
    }

    // ── Metadata-only mode ───────────────────────────────
    const metaOnly = req.nextUrl.searchParams.get("meta") === "true";
    if (metaOnly) {
        return Response.json({
            ok: true,
            artifact: {
                id: artifact.id,
                cid: artifact.contentCid,
                filename: artifact.filename,
                mimeType: artifact.mimeType,
                sizeBytes: artifact.sizeBytes,
                artifactType: artifact.artifactType,
                metadata: artifact.metadata,
                uploadedBy: artifact.uploadedBy,
                createdAt: artifact.createdAt,
                gatewayUrl: buildRetrievalUrl(cid),
            },
        });
    }

    // ── Retrieve content from Storacha ───────────────────
    try {
        const response = await retrieveContent(cid);
        const blob = await response.blob();

        return new Response(blob.stream(), {
            status: 200,
            headers: {
                "Content-Type": artifact.mimeType,
                "Content-Disposition": `inline; filename="${artifact.filename.replace(/["\r\n]/g, "_")}"`,
                "X-Content-CID": cid,
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to retrieve artifact" },
            { status: 502 },
        );
    }
}
