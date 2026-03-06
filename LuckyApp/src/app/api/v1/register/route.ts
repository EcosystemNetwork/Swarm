/**
 * POST /api/v1/register
 *
 * Register an agent's Ed25519 public key with the hub.
 * No API keys, no tokens — the public key IS the credential.
 *
 * Body: { publicKey, agentName, agentType, orgId, skills?, bio? }
 *   skills — optional array of { id, name, type, version? } the agent self-reports
 *   bio    — optional short self-description the agent writes about itself
 * Returns: { agentId, registered: true }
 */
import { NextRequest } from "next/server";
import { PLATFORM_BRIEFING } from "../briefing";
import { getAgentAvatarUrl } from "@/lib/agent-avatar";
import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    addDoc,
    getDocs,
    updateDoc,
    query,
    where,
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

    const publicKey = body.publicKey as string | undefined;
    const agentName = body.agentName as string | undefined;
    const agentType = body.agentType as string | undefined;
    const orgId = body.orgId as string | undefined;
    const skills = sanitizeSkills(body.skills);
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 500) : undefined;

    if (!publicKey || !agentName || !orgId) {
        return Response.json(
            { error: "publicKey, agentName, and orgId are required" },
            { status: 400 }
        );
    }

    // Validate PEM format
    if (!publicKey.includes("BEGIN PUBLIC KEY")) {
        return Response.json(
            { error: "publicKey must be in PEM format (BEGIN PUBLIC KEY)" },
            { status: 400 }
        );
    }

    try {
        // Check if this public key is already registered
        const existingQ = query(
            collection(db, "agents"),
            where("publicKey", "==", publicKey)
        );
        const existing = await getDocs(existingQ);

        if (!existing.empty) {
            // Update existing agent (same key reconnecting)
            const existingDoc = existing.docs[0];
            await updateDoc(doc(db, "agents", existingDoc.id), {
                status: "online",
                lastSeen: serverTimestamp(),
                connectionType: "ed25519",
                ...(skills.length > 0 ? { reportedSkills: skills } : {}),
                ...(bio ? { bio } : {}),
            });

            return Response.json({
                agentId: existingDoc.id,
                agentName: existingDoc.data().name || agentName,
                registered: true,
                existing: true,
                reportedSkills: skills.length,
                briefing: PLATFORM_BRIEFING,
            });
        }

        // Fallback: check by orgId + name to prevent duplicates when
        // the agent regenerates its keypair (e.g., deleted keys/ folder)
        const nameQ = query(
            collection(db, "agents"),
            where("orgId", "==", orgId),
            where("name", "==", agentName)
        );
        const nameMatch = await getDocs(nameQ);

        if (!nameMatch.empty) {
            // Same org + name → update existing agent with new key
            const matchedDoc = nameMatch.docs[0];
            await updateDoc(doc(db, "agents", matchedDoc.id), {
                publicKey,
                status: "online",
                lastSeen: serverTimestamp(),
                connectionType: "ed25519",
                ...(skills.length > 0 ? { reportedSkills: skills } : {}),
                ...(bio ? { bio } : {}),
            });

            return Response.json({
                agentId: matchedDoc.id,
                agentName: matchedDoc.data().name || agentName,
                registered: true,
                existing: true,
                reportedSkills: skills.length,
                briefing: PLATFORM_BRIEFING,
            });
        }

        // Register new agent
        const ref = await addDoc(collection(db, "agents"), {
            name: agentName,
            type: agentType || "agent",
            orgId,
            organizationId: orgId,
            publicKey,
            status: "online",
            connectionType: "ed25519",
            capabilities: [],
            projectIds: [],
            reportedSkills: skills,
            bio: bio || "",
            avatarUrl: getAgentAvatarUrl(agentName, agentType || "agent"),
            description: `${agentType || "Agent"} connected via Ed25519`,
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
        });

        return Response.json({
            agentId: ref.id,
            agentName,
            registered: true,
            existing: false,
            reportedSkills: skills.length,
            briefing: PLATFORM_BRIEFING,
        });
    } catch (err) {
        console.error("v1/register error:", err);
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
