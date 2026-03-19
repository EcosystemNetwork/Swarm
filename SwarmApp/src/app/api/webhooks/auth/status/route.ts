/**
 * GET /api/webhooks/auth/status?agentId=X&apiKey=Y
 *
 * Check current auth state: connected/disconnected, revocation status.
 */
import { NextRequest } from "next/server";
import { authenticateAgent, unauthorized } from "../../auth";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get("agentId");
    const apiKey = searchParams.get("apiKey");

    const agent = await authenticateAgent(agentId, apiKey);
    if (!agent) return unauthorized();

    try {
        const agentSnap = await getDoc(doc(db, "agents", agent.agentId));
        if (!agentSnap.exists()) {
            return Response.json({ error: "Agent not found" }, { status: 404 });
        }

        const data = agentSnap.data();
        const revoked = !!data.tokenRevokedAt;

        return Response.json({
            agentId: agent.agentId,
            agentName: agent.agentName,
            orgId: agent.orgId,
            status: data.status || "unknown",
            connectionType: data.connectionType || "none",
            revoked,
            revokedAt: revoked ? data.tokenRevokedAt?.toDate?.()?.toISOString?.() || null : null,
            projects: (data.projectIds || []).length,
            scopes: revoked ? [] : ["messages:read", "messages:write", "tasks:read", "tasks:write"],
        });
    } catch (err) {
        console.error("Auth status error:", err);
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
