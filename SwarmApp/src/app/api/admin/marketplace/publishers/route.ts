/**
 * GET /api/admin/marketplace/publishers
 * POST /api/admin/marketplace/publishers
 *
 * Publisher management: list with tier/ban filters, ban/unban,
 * set tier, recalculate stats.
 */

import { NextRequest } from "next/server";
import {
  collection, getDocs, query, where, doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin } from "@/lib/auth-guard";
import { recordAuditEntry } from "@/lib/audit-log";
import { updatePublisherStats } from "@/lib/submission-protocol";

/** GET — List publishers */
export async function GET(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const url = req.nextUrl;
  const tierFilter = url.searchParams.get("tier");
  const bannedFilter = url.searchParams.get("banned");
  const sortBy = url.searchParams.get("sort") || "submissions";
  const searchQuery = url.searchParams.get("q")?.toLowerCase();

  try {
    const constraints = [];
    if (tierFilter !== null && tierFilter !== undefined && tierFilter !== "") {
      constraints.push(where("tier", "==", Number(tierFilter)));
    }
    if (bannedFilter === "true") {
      constraints.push(where("banned", "==", true));
    } else if (bannedFilter === "false") {
      constraints.push(where("banned", "==", false));
    }

    const q = constraints.length
      ? query(collection(db, "publisherProfiles"), ...constraints)
      : query(collection(db, "publisherProfiles"));

    const snap = await getDocs(q);
    let publishers = snap.docs.map((d) => ({
      wallet: d.id,
      ...d.data(),
    })) as Record<string, unknown>[];

    // Client-side search filter
    if (searchQuery) {
      publishers = publishers.filter((p) => {
        const name = ((p.displayName as string) || "").toLowerCase();
        const wallet = ((p.wallet as string) || "").toLowerCase();
        return name.includes(searchQuery) || wallet.includes(searchQuery);
      });
    }

    // Sort
    publishers.sort((a, b) => {
      switch (sortBy) {
        case "installs":
          return ((b.totalInstalls as number) || 0) - ((a.totalInstalls as number) || 0);
        case "rating":
          return ((b.avgRating as number) || 0) - ((a.avgRating as number) || 0);
        case "submissions":
        default:
          return ((b.totalSubmissions as number) || 0) - ((a.totalSubmissions as number) || 0);
      }
    });

    return Response.json({ ok: true, count: publishers.length, publishers });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to fetch publishers",
    }, { status: 500 });
  }
}

/** POST — Publisher admin actions */
export async function POST(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const body = await req.json();
  const { action, wallet, reason, tier } = body as {
    action: "ban" | "unban" | "set-tier" | "recalculate";
    wallet: string;
    reason?: string;
    tier?: number;
  };

  if (!action || !wallet) {
    return Response.json({ error: "action and wallet required" }, { status: 400 });
  }

  const ref = doc(db, "publisherProfiles", wallet);

  try {
    switch (action) {
      case "ban":
        await updateDoc(ref, {
          banned: true,
          banReason: reason || "Policy violation",
          bannedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        break;
      case "unban":
        await updateDoc(ref, {
          banned: false,
          banReason: null,
          bannedAt: null,
          updatedAt: serverTimestamp(),
        });
        break;
      case "set-tier":
        if (tier === undefined || tier < 0 || tier > 3) {
          return Response.json({ error: "tier must be 0-3" }, { status: 400 });
        }
        await updateDoc(ref, { tier, updatedAt: serverTimestamp() });
        break;
      case "recalculate":
        await updatePublisherStats(wallet);
        break;
      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    await recordAuditEntry({
      action: `publisher.${action}`,
      performedBy: "platform-admin",
      targetType: "publisher",
      targetId: wallet,
      metadata: { reason, tier },
    });

    return Response.json({ ok: true, action, wallet });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Action failed",
    }, { status: 500 });
  }
}
