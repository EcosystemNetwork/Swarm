/**
 * POST /api/usage/alerts
 * Create a new budget alert
 *
 * Body: { orgId, alertType: "daily" | "weekly" | "monthly", threshold }
 *
 * GET /api/usage/alerts
 * Get all budget alerts for an org
 *
 * Query params: orgId (required)
 */

import { NextRequest } from "next/server";
import {
  createBudgetAlert,
  getBudgetAlerts,
  checkBudgetAlerts,
  type AlertType,
} from "@/lib/cost-intelligence";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, alertType, threshold } = body;

  if (!orgId || !alertType || typeof threshold !== "number") {
    return Response.json(
      { error: "orgId, alertType, and threshold (number) are required" },
      { status: 400 }
    );
  }

  if (!["daily", "weekly", "monthly"].includes(alertType as string)) {
    return Response.json(
      { error: "alertType must be daily, weekly, or monthly" },
      { status: 400 }
    );
  }

  if (threshold <= 0) {
    return Response.json(
      { error: "threshold must be greater than 0" },
      { status: 400 }
    );
  }

  try {
    const alertId = await createBudgetAlert(
      orgId as string,
      alertType as AlertType,
      threshold as number
    );

    return Response.json({
      ok: true,
      alertId,
      message: `${alertType} budget alert created with threshold $${threshold}`,
    });
  } catch (err) {
    console.error("Create alert error:", err);
    return Response.json(
      { error: "Failed to create budget alert" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const check = searchParams.get("check") === "true";

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    if (check) {
      // Check for triggered alerts
      const triggeredAlerts = await checkBudgetAlerts(orgId);
      return Response.json({
        ok: true,
        triggeredAlerts,
        count: triggeredAlerts.length,
      });
    } else {
      // Get all alerts
      const alerts = await getBudgetAlerts(orgId);
      return Response.json({
        ok: true,
        alerts,
        count: alerts.length,
      });
    }
  } catch (err) {
    console.error("Get alerts error:", err);
    return Response.json(
      { error: "Failed to retrieve budget alerts" },
      { status: 500 }
    );
  }
}
