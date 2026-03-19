/**
 * GET /api/vitals/alerts
 *
 * Get vital alerts for an organization.
 * Query params:
 *  - orgId (required)
 *  - active (optional, default true) - show only active alerts
 *  - limit (optional, default 100) - max results for history
 *
 * POST /api/vitals/alerts/resolve
 *
 * Resolve a vital alert.
 * Body: { alertId }
 */

import { NextRequest } from "next/server";
import { getActiveAlerts, getAlertHistory, resolveAlert } from "@/lib/vitals-collector";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const active = searchParams.get("active") !== "false";
  const limit = parseInt(searchParams.get("limit") || "100");

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    const alerts = active
      ? await getActiveAlerts(orgId)
      : await getAlertHistory(orgId, limit);

    return Response.json({
      ok: true,
      alerts,
      count: alerts.length,
      active,
    });
  } catch (err) {
    console.error("Get vitals alerts error:", err);
    return Response.json(
      { error: "Failed to retrieve vitals alerts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { alertId } = body;

  if (!alertId) {
    return Response.json({ error: "alertId is required" }, { status: 400 });
  }

  try {
    await resolveAlert(alertId as string);

    return Response.json({
      ok: true,
      message: "Alert resolved",
    });
  } catch (err) {
    console.error("Resolve alert error:", err);
    return Response.json(
      { error: "Failed to resolve alert" },
      { status: 500 }
    );
  }
}
