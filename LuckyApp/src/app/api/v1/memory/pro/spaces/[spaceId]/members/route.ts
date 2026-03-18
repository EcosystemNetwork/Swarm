/**
 * GET  /api/v1/memory/pro/spaces/:spaceId/members?orgId=...
 * POST /api/v1/memory/pro/spaces/:spaceId/members  { orgId, subjectType, subjectId, subjectName?, role }
 *
 * List and add space members.
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 * Entitlement: Memory Pro subscription required
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { requireMemoryPro } from "@/lib/storacha/entitlement";
import {
    getSpace,
    getSpaceMembers,
    addSpaceMember,
    checkSpaceAccess,
} from "@/lib/storacha/memory-pro";
import type { SpaceRole, SpaceSubjectType } from "@/lib/storacha/memory-pro-types";

const VALID_ROLES: SpaceRole[] = ["reader", "writer", "admin"];
const VALID_SUBJECT_TYPES: SpaceSubjectType[] = ["user", "agent", "org"];

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ spaceId: string }> },
) {
    const { spaceId } = await params;
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/pro/spaces/:id/members")
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
        return Response.json({ ok: true, count: members.length, members });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to list members" },
            { status: 500 },
        );
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ spaceId: string }> },
) {
    const { spaceId } = await params;
    const wallet = getWalletAddress(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "POST:/v1/memory/pro/spaces/:id/members")
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
    const subjectType = body.subjectType as SpaceSubjectType;
    const subjectId = body.subjectId as string;
    const subjectName = body.subjectName as string | undefined;
    const role = body.role as SpaceRole;

    if (!orgId || !subjectType || !subjectId || !role) {
        return Response.json(
            { error: "Required: orgId, subjectType, subjectId, role" },
            { status: 400 },
        );
    }

    if (!VALID_SUBJECT_TYPES.includes(subjectType)) {
        return Response.json(
            { error: `subjectType must be one of: ${VALID_SUBJECT_TYPES.join(", ")}` },
            { status: 400 },
        );
    }

    if (!VALID_ROLES.includes(role)) {
        return Response.json(
            { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
            { status: 400 },
        );
    }

    const proAccess = await requireMemoryPro(orgId);
    if (!proAccess.allowed) {
        return Response.json({ error: proAccess.reason, requiresSubscription: true }, { status: 403 });
    }

    // Require admin access to add members
    const callerSubjectId = wallet || agentAuth?.agent?.agentId || "";
    const spaceAccess = await checkSpaceAccess(spaceId, callerSubjectId, "admin");
    if (!spaceAccess.allowed) {
        return Response.json({ error: spaceAccess.reason || "Admin access required" }, { status: 403 });
    }

    try {
        const id = await addSpaceMember({
            spaceId,
            orgId,
            subjectType,
            subjectId,
            subjectName,
            role,
            addedBy: callerSubjectId,
        });

        return Response.json({ ok: true, id });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to add member" },
            { status: 500 },
        );
    }
}
