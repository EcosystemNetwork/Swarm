/**
 * GET /api/v1/trust/verify-score?asn=ASN-XXX
 *
 * Verify a single agent's score consistency across three tiers:
 * Firestore, HCS-computed (in-memory), and on-chain NFT.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import { verifyAgentScore } from "@/lib/hedera-trust-verification";

export async function GET(req: NextRequest) {
    try {
        const session = await validateSession();
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const asn = searchParams.get("asn");

        if (!asn) {
            return NextResponse.json(
                { error: "Missing required parameter: asn" },
                { status: 400 },
            );
        }

        const result = await verifyAgentScore(asn);
        return NextResponse.json(result);
    } catch (error) {
        console.error("Score verification error:", error);
        return NextResponse.json(
            {
                error: "Failed to verify score",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
