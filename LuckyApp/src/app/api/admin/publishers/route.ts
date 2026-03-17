/**
 * GET /api/admin/publishers
 *
 * Lists all publisher profiles for admin review.
 * Supports ?tier=0|1|2|3 and ?banned=true filters.
 *
 * POST /api/admin/publishers
 *
 * Admin actions: ban, unban, set-tier.
 */

import { NextRequest } from "next/server";
import {
  collection, getDocs, query, where, doc, updateDoc,
  serverTimestamp, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const url = req.nextUrl;
  const tierFilter = url.searchParams.get("tier");
  const bannedFilter = url.searchParams.get("banned");

  try {
    let q = query(collection(db, "publisherProfiles"), orderBy("updatedAt", "desc"));

    if (tierFilter !== null) {
      q = query(collection(db, "publisherProfiles"), where("tier", "==", Number(tierFilter)));
    }
    if (bannedFilter === "true") {
      q = query(collection(db, "publisherProfiles"), where("banned", "==", true));
    }

    const snap = await getDocs(q);
    const publishers = snap.docs.map((d) => ({ wallet: d.id, ...d.data() }));

    return Response.json({ ok: true, publishers });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to fetch publishers",
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const body = await req.json();
  const { action, wallet, tier, reason } = body as {
    action: "ban" | "unban" | "set-tier";
    wallet: string;
    tier?: number;
    reason?: string;
  };

  if (!action || !wallet) {
    return Response.json({ error: "Missing action or wallet" }, { status: 400 });
  }

  const ref = doc(db, "publisherProfiles", wallet.toLowerCase());

  try {
    switch (action) {
      case "ban":
        await updateDoc(ref, {
          banned: true,
          banReason: reason || "Banned by admin",
          bannedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        break;
      case "unban":
        await updateDoc(ref, {
          banned: false,
          banReason: null,
          bannedAt: null,
          cooldownUntil: null,
          updatedAt: serverTimestamp(),
        });
        break;
      case "set-tier":
        if (tier === undefined || tier < 0 || tier > 3) {
          return Response.json({ error: "Invalid tier (0-3)" }, { status: 400 });
        }
        await updateDoc(ref, { tier, updatedAt: serverTimestamp() });
        break;
      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Action failed",
    }, { status: 500 });
  }
}
