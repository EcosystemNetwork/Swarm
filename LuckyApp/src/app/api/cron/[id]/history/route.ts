/**
 * GET /api/cron/[id]/history
 *
 * Get execution history for a specific cron job.
 * Query params: limit (optional, default 50)
 */

import { NextRequest } from "next/server";
import { getCronExecutionHistory, calculateCronStats } from "@/lib/cron-history";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const history = await getCronExecutionHistory(id, limit);
    const stats = calculateCronStats(history);

    return Response.json({
      ok: true,
      jobId: id,
      history,
      stats,
      count: history.length,
    });
  } catch (err) {
    console.error("Get cron history error:", err);
    return Response.json(
      { error: "Failed to retrieve cron execution history" },
      { status: 500 }
    );
  }
}
