/**
 * GET /api/admin/marketplace/listings
 * POST /api/admin/marketplace/listings
 *
 * Listing management: browse all items with status/type filters,
 * and perform admin actions (suspend, feature, recalculate rank).
 */

import { NextRequest } from "next/server";
import {
  collection, getDocs, query, where, doc, updateDoc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin } from "@/lib/auth-guard";
import { recordAuditEntry } from "@/lib/audit-log";
import { computeRankingScore, type PublisherProfile } from "@/lib/submission-protocol";
import { getMarketplaceSettings } from "@/lib/marketplace-settings";

/** GET — List marketplace items */
export async function GET(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const url = req.nextUrl;
  const statusFilter = url.searchParams.get("status") || "all";
  const typeFilter = url.searchParams.get("type");
  const sortBy = url.searchParams.get("sort") || "newest";
  const searchQuery = url.searchParams.get("q")?.toLowerCase();

  try {
    const results: Record<string, unknown>[] = [];

    // Community items
    const communityConstraints = [];
    if (statusFilter !== "all") {
      communityConstraints.push(where("status", "==", statusFilter));
    }
    const communitySnap = await getDocs(
      communityConstraints.length
        ? query(collection(db, "communityMarketItems"), ...communityConstraints)
        : query(collection(db, "communityMarketItems")),
    );
    for (const d of communitySnap.docs) {
      const data = d.data();
      if (typeFilter && data.type !== typeFilter && data.itemType !== typeFilter) continue;
      if (searchQuery && !(data.name || "").toLowerCase().includes(searchQuery)) continue;

      results.push({
        id: d.id,
        source: "community",
        name: data.name || "Untitled",
        type: data.type || data.itemType || "unknown",
        submittedBy: data.submittedBy || "unknown",
        status: data.status || "unknown",
        installs: data.installCount || 0,
        avgRating: data.avgRating || 0,
        ratingCount: data.ratingCount || 0,
        rankingScore: data.rankingScore || 0,
        featured: data.featured || false,
        submittedAt: data.submittedAt,
        publishedAt: data.publishedAt,
      });
    }

    // Agent packages
    const agentConstraints = [];
    if (statusFilter !== "all") {
      const mappedStatus = statusFilter === "pending" ? "review" : statusFilter;
      agentConstraints.push(where("status", "==", mappedStatus));
    }
    const agentSnap = await getDocs(
      agentConstraints.length
        ? query(collection(db, "marketplaceAgents"), ...agentConstraints)
        : query(collection(db, "marketplaceAgents")),
    );
    for (const d of agentSnap.docs) {
      const data = d.data();
      if (typeFilter && typeFilter !== "agent") continue;
      if (searchQuery && !(data.name || "").toLowerCase().includes(searchQuery)) continue;

      results.push({
        id: d.id,
        source: "agents",
        name: data.name || "Untitled",
        type: "agent",
        submittedBy: data.authorWallet || "unknown",
        status: data.status || "unknown",
        installs: data.installCount || 0,
        avgRating: data.avgRating || 0,
        ratingCount: data.ratingCount || 0,
        rankingScore: data.rankingScore || 0,
        featured: data.featured || false,
        submittedAt: data.submittedAt,
        publishedAt: data.publishedAt,
      });
    }

    // Sort
    results.sort((a, b) => {
      switch (sortBy) {
        case "ranking":
          return (b.rankingScore as number) - (a.rankingScore as number);
        case "installs":
          return (b.installs as number) - (a.installs as number);
        case "newest":
        default: {
          const aTime = (a.submittedAt as { seconds: number })?.seconds || 0;
          const bTime = (b.submittedAt as { seconds: number })?.seconds || 0;
          return bTime - aTime;
        }
      }
    });

    return Response.json({ ok: true, count: results.length, items: results });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to fetch listings",
    }, { status: 500 });
  }
}

/** POST — Listing admin actions */
export async function POST(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const body = await req.json();
  const { action, itemId, collection: colParam, reason } = body as {
    action: "suspend" | "unsuspend" | "feature" | "unfeature" | "recalculate_rank";
    itemId: string;
    collection?: string;
    reason?: string;
  };

  if (!action || !itemId) {
    return Response.json({ error: "action and itemId required" }, { status: 400 });
  }

  const colName = colParam === "agents" ? "marketplaceAgents" : "communityMarketItems";

  try {
    const ref = doc(db, colName, itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return Response.json({ error: "Item not found" }, { status: 404 });
    }

    const data = snap.data();

    switch (action) {
      case "suspend":
        await updateDoc(ref, { status: "suspended", suspendedAt: serverTimestamp(), suspendReason: reason || "" });
        break;
      case "unsuspend":
        await updateDoc(ref, { status: "approved", suspendedAt: null, suspendReason: null });
        break;
      case "feature": {
        // Enforce max featured items from settings
        const settings = await getMarketplaceSettings();
        let featuredCount = 0;
        const communityFeatured = await getDocs(
          query(collection(db, "communityMarketItems"), where("featured", "==", true)),
        );
        featuredCount += communityFeatured.size;
        const agentFeatured = await getDocs(
          query(collection(db, "marketplaceAgents"), where("featured", "==", true)),
        );
        featuredCount += agentFeatured.size;

        if (featuredCount >= settings.maxFeaturedItems) {
          return Response.json(
            { error: `Maximum featured items reached (${settings.maxFeaturedItems})` },
            { status: 400 },
          );
        }

        await updateDoc(ref, { featured: true, featuredAt: serverTimestamp() });
        break;
      }
      case "unfeature":
        await updateDoc(ref, { featured: false, featuredAt: null });
        break;
      case "recalculate_rank": {
        // Get publisher tier for ranking
        const publisherWallet = data.submittedBy || data.authorWallet;
        let publisherTier = 0;
        if (publisherWallet) {
          const pubRef = doc(db, "publisherProfiles", publisherWallet);
          const pubSnap = await getDoc(pubRef);
          if (pubSnap.exists()) publisherTier = (pubSnap.data() as PublisherProfile).tier;
        }

        const score = computeRankingScore({
          installCount: data.installCount || 0,
          avgRating: data.avgRating || 0,
          ratingCount: data.ratingCount || 0,
          publishedAt: data.publishedAt?.toDate?.() || null,
          publisherTier,
        });
        await updateDoc(ref, { rankingScore: score });
        break;
      }
      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    await recordAuditEntry({
      action: `listing.${action}`,
      performedBy: "platform-admin",
      targetType: "listing",
      targetId: itemId,
      metadata: { collection: colParam || "community", reason },
    });

    return Response.json({ ok: true, action, itemId });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Action failed",
    }, { status: 500 });
  }
}
