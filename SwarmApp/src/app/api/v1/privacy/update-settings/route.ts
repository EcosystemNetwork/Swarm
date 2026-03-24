/**
 * POST /api/v1/privacy/update-settings
 *
 * Update privacy settings for an agent or organization.
 *
 * Body: {
 *   agentId?: string,
 *   privacyLevel: "private" | "organization" | "public",
 *   allowPublicProfile?: boolean,
 *   allowPublicScores?: boolean,
 *   allowPublicHistory?: boolean,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { updatePrivacySettings } from "@/lib/hedera-privacy";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Agent } from "@/lib/firestore";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const {
            agentId,
            privacyLevel,
            allowPublicProfile,
            allowPublicScores,
            allowPublicHistory,
        } = await req.json();

        if (!privacyLevel) {
            return NextResponse.json(
                { error: "Missing privacyLevel" },
                { status: 400 },
            );
        }

        if (!["private", "organization", "public"].includes(privacyLevel)) {
            return NextResponse.json(
                { error: "Invalid privacyLevel (must be private, organization, or public)" },
                { status: 400 },
            );
        }

        // Get agent to find orgId
        let orgId: string;

        if (agentId) {
            const agentDoc = await getDocs(
                query(collection(db, "agents"), where("id", "==", agentId)),
            );

            if (agentDoc.empty) {
                return NextResponse.json({ error: "Agent not found" }, { status: 404 });
            }

            const agent = agentDoc.docs[0].data() as Agent;
            orgId = agent.orgId;

            // TODO: Verify user owns this agent/org
        } else {
            // Org-level settings
            // TODO: Get orgId from session
            orgId = "default"; // Placeholder
        }

        // Update privacy settings
        await updatePrivacySettings(
            orgId,
            {
                privacyLevel,
                allowPublicProfile: allowPublicProfile ?? false,
                allowPublicScores: allowPublicScores ?? false,
                allowPublicHistory: allowPublicHistory ?? false,
                encryptionEnabled: privacyLevel === "private",
            },
            agentId,
        );

        // Update agent record
        if (agentId) {
            const agentDoc = await getDocs(
                query(collection(db, "agents"), where("id", "==", agentId)),
            );

            if (!agentDoc.empty) {
                await updateDoc(doc(db, "agents", agentDoc.docs[0].id), {
                    privacyLevel,
                    allowPublicProfile: allowPublicProfile ?? false,
                    allowPublicScores: allowPublicScores ?? false,
                });
            }
        }

        return NextResponse.json({
            success: true,
            privacyLevel,
            encryptionEnabled: privacyLevel === "private",
            message: `✅ Privacy settings updated: ${privacyLevel}`,
        });
    } catch (error) {
        console.error("Update privacy settings error:", error);
        return NextResponse.json(
            {
                error: "Failed to update privacy settings",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
