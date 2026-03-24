/**
 * GET /api/meshy/health
 *
 * Health check for Meshy.ai connectivity.
 * Returns configuration status and API latency.
 *
 * Auth: wallet address only (any authenticated user)
 */

import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { isMeshyConfigured, healthCheck } from "@/lib/meshy";

export async function GET(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!isMeshyConfigured()) {
    return Response.json({
      ok: false,
      configured: false,
      message: "MESHY_API_KEY not set",
    });
  }

  const result = await healthCheck();

  return Response.json({
    ok: result.ok,
    configured: true,
    latencyMs: result.latencyMs,
    error: result.error,
  });
}
