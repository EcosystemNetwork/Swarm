/**
 * GET /api/v1/trust/provenance?asn=ASN-XXX
 *
 * Generate a full score provenance proof for an agent.
 * Traces current score back to contributing HCS events
 * and anchors to a checkpoint with Merkle proof.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import { generateProvenanceProof } from "@/lib/hedera-trust-verification";

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

        const proof = await generateProvenanceProof(asn);
        return NextResponse.json(proof);
    } catch (error) {
        console.error("Provenance proof error:", error);
        return NextResponse.json(
            {
                error: "Failed to generate provenance proof",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
