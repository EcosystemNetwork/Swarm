/**
 * POST /api/webhooks/auth/register
 *
 * Explicit opt-in: register an agent and receive confirmation.
 * Body: { orgId, agentName, agentType, apiKey, agentId?, skills?, bio? }
 *   skills — optional array of { id, name, type, version? } the agent self-reports
 *   bio    — optional short self-description the agent writes about itself
 */
import { NextRequest } from "next/server";
import { PLATFORM_BRIEFING } from "@/app/api/v1/briefing";
import { getAgentAvatarUrl } from "@/lib/agent-avatar";
import { agentCheckIn, type Agent } from "@/lib/firestore";
import { db } from "@/lib/firebase";
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";

interface ReportedSkillPayload {
    id: string;
    name: string;
    type: "skill" | "plugin";
    version?: string;
}

function sanitizeSkills(raw: unknown): ReportedSkillPayload[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((s): s is Record<string, unknown> =>
            typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.name === "string"
        )
        .map(s => ({
            id: String(s.id),
            name: String(s.name),
            type: s.type === "plugin" ? "plugin" as const : "skill" as const,
            ...(s.version ? { version: String(s.version) } : {}),
        }));
}

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const orgId = body.orgId as string | undefined;
    const agentName = body.agentName as string | undefined;
    const agentType = body.agentType as string | undefined;
    const apiKey = body.apiKey as string | undefined;
    const agentId = body.agentId as string | undefined;
    const skills = sanitizeSkills(body.skills);
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 500) : undefined;

    if (!orgId || !agentName || !agentType || !apiKey) {
        return Response.json(
            { error: "orgId, agentName, agentType, and apiKey are required" },
            { status: 400 }
        );
    }

    if (!agentId) {
        return Response.json(
            { error: "agentId is required (from dashboard)" },
            { status: 400 }
        );
    }

    try {
        // Validate credentials
        const agentSnap = await getDoc(doc(db, "agents", agentId));
        if (!agentSnap.exists()) {
            return Response.json({ error: "Agent not found" }, { status: 404 });
        }

        const agentData = agentSnap.data();
        if (agentData.apiKey !== apiKey) {
            return Response.json({ error: "Invalid API key" }, { status: 401 });
        }

        // Mark agent as connected via skill (opt-in) + store reported skills/bio
        await updateDoc(doc(db, "agents", agentId), {
            status: "online",
            lastSeen: serverTimestamp(),
            connectionType: "skill",
            tokenRevokedAt: null, // clear any previous revocation
            ...(skills.length > 0 ? { reportedSkills: skills } : {}),
            ...(bio ? { bio } : {}),
            ...(!agentData.avatarUrl ? { avatarUrl: getAgentAvatarUrl(agentData.name || agentName, agentData.type || agentType) } : {}),
        });

        // Post check-in greeting to Agent Hub
        const agent = { id: agentId, ...agentData } as Agent;
        agentCheckIn(agent, agentData.orgId || orgId, skills.length > 0 ? skills : undefined, bio).catch(() => {});

        return Response.json({
            ok: true,
            agentId,
            agentName: agentData.name || agentName,
            orgId: agentData.orgId || orgId,
            connectionType: "skill",
            scopes: ["messages:read", "messages:write", "tasks:read", "tasks:write"],
            reportedSkills: skills.length,
            registeredAt: new Date().toISOString(),
            message: "Agent registered. Use auth/revoke to disconnect.",
            briefing: PLATFORM_BRIEFING,
        });
    } catch (err) {
        console.error("Auth register error:", err);
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
