/**
 * POST /api/webhooks/auth/revoke
 *
 * Revokes agent access. The agent can disconnect at any time.
 * Body: { agentId, apiKey }
 */
import { NextRequest } from "next/server";
import { authenticateAgent, unauthorized } from "../../auth";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function POST(request: NextRequest) {
    let body: Record<string, string>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { agentId, apiKey } = body;

    const agent = await authenticateAgent(agentId, apiKey);
    if (!agent) return unauthorized();

    try {
        await updateDoc(doc(db, "agents", agent.agentId), {
            status: "offline",
            tokenRevokedAt: serverTimestamp(),
            connectionType: null,
        });

        return Response.json({
            ok: true,
            agentId: agent.agentId,
            revokedAt: new Date().toISOString(),
            message: "Access revoked. Agent is now disconnected. Re-register to reconnect.",
        });
    } catch (err) {
        console.error("Auth revoke error:", err);
        return Response.json(
            { error: "Failed to revoke access" },
            { status: 500 }
        );
    }
}
