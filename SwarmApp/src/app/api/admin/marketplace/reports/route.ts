/**
 * GET /api/admin/marketplace/reports
 * POST /api/admin/marketplace/reports
 *
 * Report management: list reports with status filters,
 * dismiss/resolve/suspend-item actions.
 */

import { NextRequest } from "next/server";
import {
  collection, getDocs, query, where, orderBy, limit as firestoreLimit,
  doc, updateDoc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin } from "@/lib/auth-guard";
import { recordAuditEntry } from "@/lib/audit-log";

/** GET — List reports */
export async function GET(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const url = req.nextUrl;
  const statusFilter = url.searchParams.get("status") || "open";
  const sort = url.searchParams.get("sort") || "newest";
  const limitParam = Number(url.searchParams.get("limit")) || 50;

  try {
    const constraints = [];
    if (statusFilter === "open") {
      // Open reports have no resolution field set — fetch all and filter client-side
    } else if (statusFilter === "dismissed") {
      constraints.push(where("resolution", "==", "dismissed"));
    } else if (statusFilter === "resolved") {
      constraints.push(where("resolution", "==", "resolved"));
    }

    constraints.push(orderBy("createdAt", sort === "oldest" ? "asc" : "desc"));
    constraints.push(firestoreLimit(limitParam));

    const q = query(collection(db, "marketplaceReports"), ...constraints);
    const snap = await getDocs(q);

    let reports = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Record<string, unknown>[];

    // For "open" filter, remove reports that have a resolution
    if (statusFilter === "open") {
      reports = reports.filter((r) => !r.resolution);
    }

    return Response.json({ ok: true, count: reports.length, reports });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to fetch reports",
    }, { status: 500 });
  }
}

/** POST — Report resolution actions */
export async function POST(req: NextRequest) {
  const auth = requirePlatformAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const body = await req.json();
  const { action, reportId, resolution, reason } = body as {
    action: "dismiss" | "resolve" | "suspend_item";
    reportId: string;
    resolution?: string;
    reason?: string;
  };

  if (!action || !reportId) {
    return Response.json({ error: "action and reportId required" }, { status: 400 });
  }

  try {
    const reportRef = doc(db, "marketplaceReports", reportId);
    const reportSnap = await getDoc(reportRef);
    if (!reportSnap.exists()) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    const reportData = reportSnap.data();

    switch (action) {
      case "dismiss":
        await updateDoc(reportRef, {
          resolution: "dismissed",
          resolvedAt: serverTimestamp(),
          resolvedBy: "platform-admin",
          resolutionNote: reason || "",
        });
        break;

      case "resolve":
        await updateDoc(reportRef, {
          resolution: resolution || "resolved",
          resolvedAt: serverTimestamp(),
          resolvedBy: "platform-admin",
          resolutionNote: reason || "",
        });
        break;

      case "suspend_item": {
        // Suspend the reported item
        const itemId = reportData.itemId as string;
        const itemCollection = reportData.collection === "agents" ? "marketplaceAgents" : "communityMarketItems";
        const itemRef = doc(db, itemCollection, itemId);
        const itemSnap = await getDoc(itemRef);

        if (itemSnap.exists()) {
          await updateDoc(itemRef, {
            status: "suspended",
            suspendedAt: serverTimestamp(),
            suspendReason: reason || `Suspended due to report: ${reportData.reason}`,
          });

          await recordAuditEntry({
            action: "listing.suspended",
            performedBy: "platform-admin",
            targetType: "listing",
            targetId: itemId,
            metadata: { reportId, reason: reason || reportData.reason },
          });
        }

        // Resolve the report
        await updateDoc(reportRef, {
          resolution: "item_suspended",
          resolvedAt: serverTimestamp(),
          resolvedBy: "platform-admin",
          resolutionNote: reason || "",
        });
        break;
      }

      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    await recordAuditEntry({
      action: `report.${action}`,
      performedBy: "platform-admin",
      targetType: "report",
      targetId: reportId,
      metadata: { resolution: resolution || action, reason },
    });

    return Response.json({ ok: true, action, reportId });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Action failed",
    }, { status: 500 });
  }
}
