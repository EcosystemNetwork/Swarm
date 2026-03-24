/**
 * GET /api/v1/trust/verify-ownership?type=org&id=XXX
 * GET /api/v1/trust/verify-ownership?type=agent&asn=ASN-XXX
 *
 * Unified org + agent ownership verification.
 * For orgs: delegates to HCS org ownership verification.
 * For agents: delegates to agent identity verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyOrgOwnershipOnHCS } from "@/lib/hedera-org-ownership";
import { verifyAgentIdentity } from "@/lib/hedera-agent-identity-verification";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type");

        if (!type || !["org", "agent"].includes(type)) {
            return NextResponse.json(
                { error: "Missing or invalid parameter: type (must be 'org' or 'agent')" },
                { status: 400 },
            );
        }

        if (type === "org") {
            const orgId = searchParams.get("id");
            if (!orgId) {
                return NextResponse.json(
                    { error: "Missing required parameter: id (org ID)" },
                    { status: 400 },
                );
            }

            const proof = await verifyOrgOwnershipOnHCS(orgId);
            return NextResponse.json({
                type: "org",
                orgId,
                proof,
            });
        }

        if (type === "agent") {
            const asn = searchParams.get("asn");
            if (!asn) {
                return NextResponse.json(
                    { error: "Missing required parameter: asn" },
                    { status: 400 },
                );
            }

            const proof = await verifyAgentIdentity(asn);
            if (!proof) {
                return NextResponse.json(
                    { error: `No identity proof found for ASN ${asn}` },
                    { status: 404 },
                );
            }

            return NextResponse.json({
                type: "agent",
                asn,
                proof,
            });
        }
    } catch (error) {
        console.error("Ownership verification error:", error);
        return NextResponse.json(
            {
                error: "Failed to verify ownership",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
