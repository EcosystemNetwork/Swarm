/**
 * GET /api/admin/reports
 *
 * Lists marketplace reports for admin review.
 *
 * POST /api/admin/reports
 *
 * Admin actions: dismiss, action-taken (resolve report + optionally suspend item).
 */

import { NextRequest } from "next/server";
import {
  collection, getDocs, query, orderBy, doc, updateDoc,
  serverTimestamp, getDoc, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const limitParam = Number(req.nextUrl.searchParams.get("limit")) || 50;

  try {
    const q = query(
      collection(db, "marketplaceReports"),
      orderBy("createdAt", "desc"),
      limit(limitParam),
    );
    const snap = await getDocs(q);
    const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return Response.json({ ok: true, reports });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to fetch reports",
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const body = await req.json();
  const { action, reportId, suspendItem } = body as {
    action: "dismiss" | "action-taken";
    reportId: string;
    suspendItem?: boolean;
  };

  if (!action || !reportId) {
    return Response.json({ error: "Missing action or reportId" }, { status: 400 });
  }

  const reportRef = doc(db, "marketplaceReports", reportId);
  const reportSnap = await getDoc(reportRef);

  if (!reportSnap.exists()) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  const report = reportSnap.data();

  try {
    await updateDoc(reportRef, {
      resolution: action,
      resolvedAt: serverTimestamp(),
      resolvedBy: req.headers.get("x-wallet-address") || "admin",
    });

    // Optionally suspend the reported item
    if (action === "action-taken" && suspendItem && report.itemId && report.collection) {
      const itemRef = doc(db, report.collection, report.itemId);
      await updateDoc(itemRef, {
        status: "suspended",
        suspendedAt: serverTimestamp(),
        suspendReason: `Report ${reportId}: ${report.reason}`,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Action failed",
    }, { status: 500 });
  }
}
