/**
 * GET  /api/v1/ton/fees  — Get platform fee config for an org
 * POST /api/v1/ton/fees  — Create or update fee config
 *
 * GET query: orgId
 * POST body: { orgId, feeBps, feeRecipientAddress, minFeeBountyNano, enabled, updatedBy }
 * Returns: { feeConfig, stats }
 */
import { NextRequest } from "next/server";
import {
    getTonFeeConfig,
    upsertTonFeeConfig,
    getBounties,
    computeBountyStats,
    DEFAULT_FEE_CONFIG,
} from "@/lib/ton-bounty";
import { nanoToTon } from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const [feeConfig, { bounties }] = await Promise.all([
        getTonFeeConfig(orgId),
        getBounties(orgId, 1000), // large limit for stats — no cursor needed here
    ]);

    const stats = computeBountyStats(bounties);

    return Response.json({
        feeConfig: feeConfig ?? { ...DEFAULT_FEE_CONFIG, id: null, orgId, configured: false },
        stats,
        revenue: {
            totalFeeTon: stats.totalFeeTon,
            totalPayoutTon: stats.totalPayoutTon,
            releasedBounties: stats.released,
        },
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, feeBps, feeRecipientAddress, minFeeBountyNano, enabled, updatedBy } = body as {
            orgId: string;
            feeBps?: number;
            feeRecipientAddress?: string;
            minFeeBountyNano?: string;
            enabled?: boolean;
            updatedBy: string;
        };

        if (!orgId || !updatedBy) {
            return Response.json({ error: "orgId and updatedBy are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        if (feeBps !== undefined && (feeBps < 0 || feeBps > 1000)) {
            return Response.json({ error: "feeBps must be 0–1000 (max 10%)" }, { status: 400 });
        }

        const existing = await getTonFeeConfig(orgId);
        const feeConfig = await upsertTonFeeConfig(orgId, {
            feeBps: feeBps ?? existing?.feeBps ?? DEFAULT_FEE_CONFIG.feeBps,
            feeRecipientAddress: feeRecipientAddress ?? existing?.feeRecipientAddress ?? "",
            minFeeBountyNano: minFeeBountyNano ?? existing?.minFeeBountyNano ?? DEFAULT_FEE_CONFIG.minFeeBountyNano,
            enabled: enabled ?? existing?.enabled ?? true,
            updatedBy,
        });

        return Response.json({
            feeConfig,
            feePercent: feeConfig.feeBps / 100,
            minFeeTon: nanoToTon(feeConfig.minFeeBountyNano),
        });
    } catch (err) {
        console.error("[ton/fees POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
