/**
 * GET /api/v1/artifacts/decrypt/:cid?orgId=...
 *
 * Retrieve and decrypt an encrypted artifact from IPFS.
 * Content was encrypted with AES-256-GCM using org-specific key derivation.
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { retrieveContent } from "@/lib/storacha/client";
import { getArtifactByCid } from "@/lib/storacha/cid-index";
import { decryptContent, isEncryptionAvailable } from "@/lib/storacha/encryption";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ cid: string }> },
) {
    const { cid } = await params;

    if (!cid) {
        return Response.json({ error: "CID is required" }, { status: 400 });
    }

    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/artifacts/decrypt")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!isEncryptionAvailable()) {
        return Response.json(
            { error: "Content decryption not available (SESSION_SECRET missing)" },
            { status: 503 },
        );
    }

    // Look up artifact metadata
    const artifact = await getArtifactByCid(cid);
    if (!artifact) {
        return Response.json({ error: "Artifact not found" }, { status: 404 });
    }

    // Verify org ownership (prevent cross-org decryption)
    const reqOrgId = req.nextUrl.searchParams.get("orgId");
    if (!reqOrgId) {
        return Response.json(
            { error: "orgId query parameter is required" },
            { status: 400 },
        );
    }
    if (artifact.orgId !== reqOrgId) {
        return Response.json({ error: "Artifact not found" }, { status: 404 });
    }

    // Verify the artifact is actually encrypted
    const isEncrypted = artifact.metadata?.encrypted === true;
    if (!isEncrypted) {
        return Response.json(
            { error: "Artifact is not encrypted. Use /api/v1/artifacts/:cid instead." },
            { status: 400 },
        );
    }

    const orgId = artifact.orgId;

    try {
        // Fetch encrypted content from IPFS
        const response = await retrieveContent(cid);
        const encryptedBuffer = Buffer.from(await response.arrayBuffer());

        // Decrypt
        const decrypted = decryptContent(encryptedBuffer, orgId);
        const ab = decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength) as ArrayBuffer;

        return new Response(ab, {
            status: 200,
            headers: {
                "Content-Type": artifact.mimeType,
                "Content-Disposition": `inline; filename="${artifact.filename.replace(/["\r\n]/g, "_")}"`,
                "X-Content-CID": cid,
                "X-Encrypted": "true",
                "Cache-Control": "private, no-cache", // encrypted content shouldn't be cached publicly
            },
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to decrypt artifact" },
            { status: 502 },
        );
    }
}
