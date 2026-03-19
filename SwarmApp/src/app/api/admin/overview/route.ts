/**
 * GET /api/admin/overview
 *
 * Platform-wide stats for the admin dashboard.
 * Returns counts for orgs, agents, marketplace items, subscriptions, reports, publishers.
 */

import { NextRequest } from "next/server";
import { collection, getCountFromServer, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  try {
    const [
      orgsSnap,
      agentsSnap,
      communitySnap,
      agentMarketSnap,
      subsSnap,
      reportsSnap,
      publishersSnap,
      modServicesSnap,
      pendingCommunitySnap,
      pendingAgentsSnap,
    ] = await Promise.all([
      getCountFromServer(collection(db, "organizations")),
      getCountFromServer(collection(db, "agents")),
      getCountFromServer(collection(db, "communityMarketItems")),
      getCountFromServer(collection(db, "marketplaceAgents")),
      getCountFromServer(collection(db, "subscriptions")),
      getCountFromServer(collection(db, "marketplaceReports")),
      getCountFromServer(collection(db, "publisherProfiles")),
      getCountFromServer(collection(db, "modServiceRegistry")),
      getCountFromServer(query(collection(db, "communityMarketItems"), where("status", "==", "pending"))),
      getCountFromServer(query(collection(db, "marketplaceAgents"), where("status", "==", "review"))),
    ]);

    return Response.json({
      ok: true,
      stats: {
        organizations: orgsSnap.data().count,
        agents: agentsSnap.data().count,
        communityItems: communitySnap.data().count,
        marketplaceAgents: agentMarketSnap.data().count,
        subscriptions: subsSnap.data().count,
        reports: reportsSnap.data().count,
        publishers: publishersSnap.data().count,
        modServices: modServicesSnap.data().count,
        pendingReviews: pendingCommunitySnap.data().count + pendingAgentsSnap.data().count,
      },
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to fetch overview",
    }, { status: 500 });
  }
}
