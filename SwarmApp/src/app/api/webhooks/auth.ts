/**
 * Shared webhook auth helper.
 * Validates agent credentials (agentId + apiKey) against Firestore.
 * Rejects agents whose access has been revoked (tokenRevokedAt is set).
 */
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export interface AuthResult {
    agentId: string;
    orgId: string;
    agentName: string;
    agentType: string;
}

/**
 * Authenticate an agent by ID + API key.
 * Returns agent info on success, or null on failure.
 * Also rejects if the agent's access has been revoked.
 */
export async function authenticateAgent(
    agentId: string | null | undefined,
    apiKey: string | null | undefined
): Promise<AuthResult | null> {
    if (!agentId || !apiKey) return null;

    try {
        const agentSnap = await getDoc(doc(db, "agents", agentId));
        if (!agentSnap.exists()) return null;

        const data = agentSnap.data();
        if (data.apiKey !== apiKey) return null;

        // Reject if access has been revoked
        if (data.tokenRevokedAt) return null;

        return {
            agentId,
            orgId: data.orgId || data.organizationId || "",
            agentName: data.name || agentId,
            agentType: data.type || "agent",
        };
    } catch {
        return null;
    }
}

/**
 * Standard 401 JSON response.
 */
export function unauthorized(message = "Invalid credentials") {
    return Response.json({ error: message }, { status: 401 });
}
