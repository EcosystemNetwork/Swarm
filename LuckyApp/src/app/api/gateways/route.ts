/**
 * GET /api/gateways
 *
 * Get all gateways for an organization with health status.
 * Query: ?orgId=xxx
 */

import { NextRequest } from "next/server";
import { getAllGatewaysWithHealth } from "@/lib/gateways";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    const gateways = await getAllGatewaysWithHealth(orgId);

    return Response.json({
      ok: true,
      gateways,
      count: gateways.length,
    });
  } catch (err) {
    console.error("Get gateways error:", err);
    return Response.json(
      { error: "Failed to get gateways" },
      { status: 500 }
    );
  }
}
