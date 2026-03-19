/**
 * GET /api/v1/storacha/usage?orgId=...
 *
 * Storage analytics — returns usage summary, quota, and breakdown
 * by memory type and artifact type for an organization.
 *
 * Auth: x-wallet-address (org member)
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { getStorageUsage, getStorageQuota } from "@/lib/storacha/cid-index";

export async function GET(req: NextRequest) {
    const wallet = getWalletAddress(req);
    if (!wallet) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) {
        return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    try {
        const [usage, quota] = await Promise.all([
            getStorageUsage(orgId),
            getStorageQuota(orgId),
        ]);

        const usagePercent = quota.maxStorageBytes > 0
            ? (usage.totalSizeBytes / quota.maxStorageBytes) * 100
            : 0;

        return Response.json({
            ok: true,
            usage,
            quota: {
                maxStorageBytes: quota.maxStorageBytes,
                maxArtifactSizeBytes: quota.maxArtifactSizeBytes,
                maxMemoryEntries: quota.maxMemoryEntries,
                maxArtifactRecords: quota.maxArtifactRecords,
            },
            usagePercent: Math.round(usagePercent * 100) / 100,
            withinQuota: usagePercent < 100,
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to compute storage usage" },
            { status: 500 },
        );
    }
}
