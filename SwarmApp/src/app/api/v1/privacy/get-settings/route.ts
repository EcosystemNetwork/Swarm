/**
 * GET /api/v1/privacy/get-settings?agentId=xxx
 *
 * Get privacy settings for an agent or organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { getPrivacySettings, canAccessAgentData } from "@/lib/hedera-privacy";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Agent } from "@/lib/firestore";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const agentId = searchParams.get("agentId");

        if (!agentId) {
            return NextResponse.json(
                { error: "Missing agentId" },
                { status: 400 },
            );
        }

        // Get agent to find orgId
        const agentDoc = await getDocs(
            query(collection(db, "agents"), where("id", "==", agentId)),
        );

        if (agentDoc.empty) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        const agent = agentDoc.docs[0].data() as Agent;
        const orgId = agent.orgId;

        // Get privacy settings
        const settings = await getPrivacySettings(orgId, agentId);

        // Check if requester can access (for display purposes)
        // TODO: Get requester's orgId from session
        const canAccess = await canAccessAgentData(orgId, agentId, orgId);

        return NextResponse.json({
            ...settings,
            canAccess,
        });
    } catch (error) {
        console.error("Get privacy settings error:", error);
        return NextResponse.json(
            {
                error: "Failed to get privacy settings",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
