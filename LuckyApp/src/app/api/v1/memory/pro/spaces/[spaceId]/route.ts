/**
 * GET    /api/v1/memory/pro/spaces/:spaceId?orgId=...
 * PATCH  /api/v1/memory/pro/spaces/:spaceId  { orgId, name?, description?, visibility?, tags? }
 * DELETE /api/v1/memory/pro/spaces/:spaceId?orgId=...
 *
 * Single space operations.
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 * Entitlement: Memory Pro subscription required
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { requireMemoryPro } from "@/lib/storacha/entitlement";
import {
    getSpace,
    updateSpace,
    deleteSpace,
    checkSpaceAccess,
    getSpaceMembers,
} from "@/lib/storacha/memory-pro";
import type { SpaceVisibility } from "@/lib/storacha/memory-pro-types";

const VALID_VISIBILITIES: SpaceVisibility[] = ["private", "org", "public"];

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ spaceId: string }> },
) {
    const { spaceId } = await params;
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/pro/spaces/:id")
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

    try {
        const space = await getSpace(spaceId);
        if (!space || space.orgId !== orgId) {
            return Response.json({ error: "Space not found" }, { status: 404 });
        }

        const members = await getSpaceMembers(spaceId);
        return Response.json({ ok: true, space, memberCount: members.length });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to get space" },
            { status: 500 },
        );
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ spaceId: string }> },
) {
    const { spaceId } = await params;
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "PATCH:/v1/memory/pro/spaces/:id")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const orgId = body.orgId as string;
    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    const proAccess = await requireMemoryPro(orgId);
    if (!proAccess.allowed) {
        return Response.json({ error: proAccess.reason, requiresSubscription: true }, { status: 403 });
    }

    // Check admin access
    const subjectId = wallet || agentAuth?.agent?.agentId || "";
    const spaceAccess = await checkSpaceAccess(spaceId, subjectId, "admin");
    if (!spaceAccess.allowed) {
        return Response.json({ error: spaceAccess.reason || "Admin access required" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.visibility) {
        if (!VALID_VISIBILITIES.includes(body.visibility as SpaceVisibility)) {
            return Response.json(
                { error: `visibility must be one of: ${VALID_VISIBILITIES.join(", ")}` },
                { status: 400 },
            );
        }
        updates.visibility = body.visibility;
    }
    if (body.tags) updates.tags = body.tags;

    try {
        await updateSpace(spaceId, updates);
        return Response.json({ ok: true });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to update space" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ spaceId: string }> },
) {
    const { spaceId } = await params;
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "DELETE:/v1/memory/pro/spaces/:id")
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

    const subjectId = wallet || agentAuth?.agent?.agentId || "";
    const spaceAccess = await checkSpaceAccess(spaceId, subjectId, "admin");
    if (!spaceAccess.allowed) {
        return Response.json({ error: spaceAccess.reason || "Admin access required" }, { status: 403 });
    }

    try {
        await deleteSpace(spaceId);
        return Response.json({ ok: true });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to delete space" },
            { status: 500 },
        );
    }
}
