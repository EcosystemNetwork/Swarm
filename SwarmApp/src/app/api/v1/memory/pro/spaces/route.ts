/**
 * GET  /api/v1/memory/pro/spaces?orgId=...&visibility=...
 * POST /api/v1/memory/pro/spaces  { orgId, name, description?, visibility, tags?, projectId? }
 *
 * List and create memory spaces (premium feature).
 *
 * Auth: x-wallet-address or agent Ed25519/API key
 * Entitlement: Memory Pro subscription required
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requireAgentAuth } from "@/lib/auth-guard";
import { requireMemoryPro } from "@/lib/storacha/entitlement";
import { createSpace, getAccessibleSpaces, getSpaces } from "@/lib/storacha/memory-pro";
import type { SpaceVisibility } from "@/lib/storacha/memory-pro-types";

const VALID_VISIBILITIES: SpaceVisibility[] = ["private", "org", "public"];

function authenticate(req: NextRequest) {
    return { wallet: getWalletAddress(req) };
}

export async function GET(req: NextRequest) {
    const { wallet } = authenticate(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "GET:/v1/memory/pro/spaces")
        : null;

    if (!wallet && (!agentAuth || !agentAuth.ok)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    const access = await requireMemoryPro(orgId);
    if (!access.allowed) {
        return Response.json({ error: access.reason, requiresSubscription: true }, { status: 403 });
    }

    try {
        const subjectId = wallet || agentAuth?.agent?.agentId || "";
        const spaces = subjectId
            ? await getAccessibleSpaces(orgId, subjectId)
            : await getSpaces(orgId);

        return Response.json({ ok: true, count: spaces.length, spaces });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to list spaces" },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    const { wallet } = authenticate(req);
    const agentAuth = !wallet
        ? await requireAgentAuth(req, "POST:/v1/memory/pro/spaces")
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

    const orgId = (body.orgId as string)?.trim();
    const name = (body.name as string)?.trim().replace(/<[^>]*>/g, "").slice(0, 100);
    const description = (body.description as string)?.trim().replace(/<[^>]*>/g, "").slice(0, 500) || undefined;
    const visibility = body.visibility as SpaceVisibility;
    const tags = Array.isArray(body.tags)
        ? (body.tags as string[]).map((t) => String(t).trim().replace(/<[^>]*>/g, "").slice(0, 50)).filter(Boolean).slice(0, 20)
        : [];
    const projectId = (body.projectId as string)?.trim().slice(0, 100) || undefined;

    if (!orgId || !name || !visibility) {
        return Response.json({ error: "Required: orgId, name, visibility" }, { status: 400 });
    }

    if (!VALID_VISIBILITIES.includes(visibility)) {
        return Response.json(
            { error: `visibility must be one of: ${VALID_VISIBILITIES.join(", ")}` },
            { status: 400 },
        );
    }

    const access = await requireMemoryPro(orgId);
    if (!access.allowed) {
        return Response.json({ error: access.reason, requiresSubscription: true }, { status: 403 });
    }

    try {
        const createdBy = wallet || agentAuth?.agent?.agentId || "unknown";
        const id = await createSpace({
            orgId,
            name,
            description,
            visibility,
            tags,
            projectId,
            createdBy,
        });

        return Response.json({ ok: true, id });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to create space" },
            { status: 500 },
        );
    }
}
