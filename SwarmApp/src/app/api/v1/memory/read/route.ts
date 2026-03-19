/**
 * GET /api/v1/memory/read?cid=bafybeig...&orgId=abc123
 *
 * Read memory content by CID from Storacha (IPFS gateway).
 * Verifies org ownership to prevent cross-org access.
 *
 * Auth: x-wallet-address (org member) or agent Ed25519/API key
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { retrieveContent, buildRetrievalUrl } from "@/lib/storacha/client";
import { getStorachaMemoryEntries } from "@/lib/storacha/cid-index";

export async function GET(req: NextRequest) {
    // ── Auth ──────────────────────────────────────────────
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/read")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json(
            { error: "Authentication required. Provide x-wallet-address header or agent credentials." },
            { status: 401 },
        );
    }

    // ── Parse query params ───────────────────────────────
    const cid = req.nextUrl.searchParams.get("cid");
    const orgId = req.nextUrl.searchParams.get("orgId");

    if (!cid || !orgId) {
        return Response.json(
            { error: "cid and orgId query parameters are required" },
            { status: 400 },
        );
    }

    // ── Verify org ownership (cross-org access prevention) ─
    const entries = await getStorachaMemoryEntries(orgId);
    const match = entries.find((e) => e.contentCid === cid);
    if (!match) {
        return Response.json(
            { error: "CID not found for this organization" },
            { status: 404 },
        );
    }

    // ── Retrieve from Storacha gateway ───────────────────
    try {
        const response = await retrieveContent(cid);
        const content = await response.text();

        return Response.json({
            ok: true,
            cid,
            content,
            gatewayUrl: buildRetrievalUrl(cid),
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to retrieve content" },
            { status: 502 },
        );
    }
}
