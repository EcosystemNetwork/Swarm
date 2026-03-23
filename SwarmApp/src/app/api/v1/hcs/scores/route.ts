/**
 * GET /api/v1/hcs/scores?asn=ASN-SWM-2026-XXXX-XXXX-XX
 *
 * Get current computed score state for an agent (from in-memory cache).
 * If no ASN specified, returns all cached scores.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { getScoreState, getAllScoreStates } from "@/lib/hedera-mirror-subscriber";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const asn = searchParams.get("asn");

        if (asn) {
            // Get specific ASN score
            const state = getScoreState(asn);
            if (!state) {
                return NextResponse.json(
                    { error: `No score state found for ASN ${asn}` },
                    { status: 404 },
                );
            }

            return NextResponse.json({
                asn: state.asn,
                agentAddress: state.agentAddress,
                creditScore: state.creditScore,
                trustScore: state.trustScore,
                lastEventTimestamp: state.lastEventTimestamp,
                eventCount: state.eventCount,
            });
        }

        // Get all scores
        const allStates = getAllScoreStates();

        return NextResponse.json({
            count: allStates.length,
            scores: allStates.map(s => ({
                asn: s.asn,
                agentAddress: s.agentAddress,
                creditScore: s.creditScore,
                trustScore: s.trustScore,
                lastEventTimestamp: s.lastEventTimestamp,
                eventCount: s.eventCount,
            })),
        });
    } catch (error) {
        console.error("HCS scores error:", error);
        return NextResponse.json(
            {
                error: "Failed to get scores",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
