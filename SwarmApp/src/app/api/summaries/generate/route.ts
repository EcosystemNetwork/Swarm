/**
 * POST /api/summaries/generate
 *
 * Manually trigger daily summary generation for an agent.
 * Body: { orgId, agentId, agentName, date? }
 * Date is optional (defaults to today)
 */

import { NextRequest } from "next/server";
import { generateDailySummary } from "@/lib/daily-summary";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, agentId, agentName, date } = body;

  if (!orgId || !agentId || !agentName) {
    return Response.json(
      { error: "orgId, agentId, and agentName are required" },
      { status: 400 }
    );
  }

  try {
    const summaryId = await generateDailySummary(
      orgId as string,
      agentId as string,
      agentName as string,
      date as string | undefined
    );

    return Response.json({
      ok: true,
      summaryId,
      message: "Daily summary generated successfully",
    });
  } catch (err) {
    console.error("Generate summary error:", err);
    return Response.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
