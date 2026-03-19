/**
 * DELETE /api/v1/memory/pro/spaces/:spaceId/members/:memberId?orgId=...
 *
 * Remove a member from a space.
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 * Entitlement: Memory Pro subscription required
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { requireMemoryPro } from "@/lib/storacha/entitlement";
import { checkSpaceAccess, removeSpaceMember } from "@/lib/storacha/memory-pro";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ spaceId: string; memberId: string }> },
) {
    const { spaceId, memberId } = await params;
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "DELETE:/v1/memory/pro/spaces/:id/members/:mid")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    const proAccess = await requireMemoryPro(orgId);
    if (!proAccess.allowed) {
        return Response.json({ error: proAccess.reason, requiresSubscription: true }, { status: 403 });
    }

    // Require admin access to remove members
    const subjectId = wallet || agentAuth?.agent?.agentId || "";
    const spaceAccess = await checkSpaceAccess(spaceId, subjectId, "admin");
    if (!spaceAccess.allowed) {
        return Response.json({ error: spaceAccess.reason || "Admin access required" }, { status: 403 });
    }

    try {
        await removeSpaceMember(memberId);
        return Response.json({ ok: true });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to remove member" },
            { status: 500 },
        );
    }
}
