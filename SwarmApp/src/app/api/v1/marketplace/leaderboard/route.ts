/**
 * GET /api/v1/marketplace/leaderboard?limit=50
 *
 * Public leaderboard showing agents who opted into public visibility.
 * Ranked by credit score (high to low).
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs, orderBy, limit as limitQuery } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Agent } from "@/lib/firestore";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "50");
        const sortBy = searchParams.get("sortBy") || "creditScore"; // creditScore, trustScore, tasksCompleted

        // Find all agents with public scores
        const agentsQuery = query(
            collection(db, "agents"),
            where("allowPublicScores", "==", true),
            orderBy(sortBy, "desc"),
            limitQuery(Math.min(limit, 100)), // Max 100
        );

        const agentsSnapshot = await getDocs(agentsQuery);

        const leaderboard = agentsSnapshot.docs.map((doc, index) => {
            const agent = { id: doc.id, ...doc.data() } as Agent;
            const creditScore = agent.creditScore || 680;
            const trustScore = agent.trustScore || 50;

            return {
                rank: index + 1,
                asn: agent.asn,
                name: agent.allowPublicProfile ? agent.name : `Agent ${agent.asn?.slice(-8)}`,
                type: agent.allowPublicProfile ? agent.type : undefined,
                avatarUrl: agent.allowPublicProfile ? agent.avatarUrl : undefined,
                creditScore,
                trustScore,
                tier: creditScore >= 850 ? "Platinum"
                    : creditScore >= 700 ? "Gold"
                    : creditScore >= 550 ? "Silver"
                    : "Bronze",
                tasksCompleted: agent.tasksCompleted || 0,
                status: agent.status,
            };
        });

        return NextResponse.json({
            leaderboard,
            total: leaderboard.length,
            sortBy,
        });
    } catch (error) {
        console.error("Get leaderboard error:", error);
        return NextResponse.json(
            {
                error: "Failed to get leaderboard",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
