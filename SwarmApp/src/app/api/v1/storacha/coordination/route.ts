/**
 * GET  /api/v1/storacha/coordination  — List coordination spaces for an org
 * POST /api/v1/storacha/coordination  — Create a new coordination space or add a contribution
 *
 * POST body (create space):   { orgId, action: "create_space", name, description, agentIds, tags, createdBy }
 * POST body (add contribution): { orgId, action: "contribute", spaceId, agentId, cid, contributionType, description, sizeBytes, mimeType, parentCid?, gatewayUrl }
 * POST body (complete space):  { orgId, action: "complete", spaceId }
 * POST body (build chain):    { orgId, action: "chain", spaceId, cid }
 */
import { NextRequest } from "next/server";
import {
    createCoordinationSpace,
    getCoordinationSpaces,
    getCoordinationStats,
    addContribution,
    getContributions,
    completeCoordinationSpace,
    buildCidChain,
} from "@/lib/storacha/agent-coordination";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const statsOnly = url.searchParams.get("stats") === "true";

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    if (statsOnly) {
        const stats = await getCoordinationStats(orgId);
        return Response.json({ stats });
    }

    const statusFilter = url.searchParams.get("status") as "active" | "completed" | "cancelled" | null;
    const spaces = await getCoordinationSpaces(orgId, statusFilter || undefined);
    return Response.json({ count: spaces.length, spaces });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body as { orgId: string; action: string };

        if (!orgId || !action) {
            return Response.json({ error: "orgId and action are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        switch (action) {
            case "create_space": {
                const { name, description, agentIds, tags, createdBy, deadline } = body;
                if (!name || !createdBy) {
                    return Response.json({ error: "name and createdBy are required" }, { status: 400 });
                }
                const space = await createCoordinationSpace({
                    orgId, name, description: description || "",
                    agentIds: agentIds || [], status: "active",
                    deadline: deadline ? new Date(deadline) : null,
                    tags: tags || [], createdBy,
                });
                return Response.json({ space }, { status: 201 });
            }

            case "contribute": {
                const { spaceId, agentId, cid, contributionType, description, sizeBytes, mimeType, parentCid, gatewayUrl, onChainRef } = body;
                if (!spaceId || !agentId || !cid) {
                    return Response.json({ error: "spaceId, agentId, and cid are required" }, { status: 400 });
                }
                const contribution = await addContribution({
                    orgId, spaceId, agentId, cid,
                    contributionType: contributionType || "intermediate",
                    description: description || "",
                    sizeBytes: sizeBytes || 0,
                    mimeType: mimeType || "application/octet-stream",
                    parentCid: parentCid || null,
                    onChainRef: onChainRef || null,
                    gatewayUrl: gatewayUrl || "",
                });
                return Response.json({ contribution }, { status: 201 });
            }

            case "complete": {
                const { spaceId } = body;
                if (!spaceId) return Response.json({ error: "spaceId required" }, { status: 400 });
                await completeCoordinationSpace(spaceId);
                return Response.json({ status: "completed" });
            }

            case "chain": {
                const { spaceId, cid } = body;
                if (!spaceId || !cid) return Response.json({ error: "spaceId and cid required" }, { status: 400 });
                const chain = await buildCidChain(spaceId, cid);
                return Response.json({ chain, length: chain.length });
            }

            case "contributions": {
                const { spaceId, agentId: agentFilter } = body;
                if (!spaceId) return Response.json({ error: "spaceId required" }, { status: 400 });
                const contributions = await getContributions(spaceId, agentFilter);
                return Response.json({ count: contributions.length, contributions });
            }

            default:
                return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (err) {
        console.error("[storacha/coordination POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
