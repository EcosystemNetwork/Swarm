/**
 * GET /api/admin/marketplace/overview
 *
 * Marketplace-specific stats: queue depth, stage breakdown, listings,
 * publishers, reports, and recent audit entries.
 */

import { NextRequest } from "next/server";
import {
  collection, getDocs, query, where, getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin } from "@/lib/auth-guard";
import { getAuditLog } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  try {
    // Parallel count queries
    const [
      communityPendingSnap,
      agentPendingSnap,
      communityApprovedSnap,
      agentApprovedSnap,
      publisherActiveSnap,
      reportsSnap,
    ] = await Promise.all([
      getCountFromServer(
        query(collection(db, "communityMarketItems"), where("status", "==", "pending")),
      ),
      getCountFromServer(
        query(collection(db, "marketplaceAgents"), where("status", "==", "review")),
      ),
      getCountFromServer(
        query(collection(db, "communityMarketItems"), where("status", "==", "approved")),
      ),
      getCountFromServer(
        query(collection(db, "marketplaceAgents"), where("status", "==", "approved")),
      ),
      getCountFromServer(
        query(collection(db, "publisherProfiles"), where("banned", "==", false)),
      ),
      getCountFromServer(collection(db, "marketplaceReports")),
    ]);

    const queueDepth = communityPendingSnap.data().count + agentPendingSnap.data().count;
    const activeListings = communityApprovedSnap.data().count + agentApprovedSnap.data().count;

    // Stage breakdown — query pending items and group by stage
    const [communityPendingDocs, agentPendingDocs] = await Promise.all([
      getDocs(query(collection(db, "communityMarketItems"), where("status", "==", "pending"))),
      getDocs(query(collection(db, "marketplaceAgents"), where("status", "==", "review"))),
    ]);

    const stageBreakdown: Record<string, number> = {
      intake: 0, security_scan: 0, sandbox: 0, product_review: 0, decision: 0,
    };
    for (const d of [...communityPendingDocs.docs, ...agentPendingDocs.docs]) {
      const stage = (d.data().stage as string) || "intake";
      stageBreakdown[stage] = (stageBreakdown[stage] || 0) + 1;
    }

    // Recent audit entries
    const recentAudit = await getAuditLog({ limit: 10 });

    return Response.json({
      ok: true,
      stats: {
        queueDepth,
        activeListings,
        activePublishers: publisherActiveSnap.data().count,
        openReports: reportsSnap.data().count,
        stageBreakdown,
      },
      recentAudit,
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to fetch overview",
    }, { status: 500 });
  }
}
