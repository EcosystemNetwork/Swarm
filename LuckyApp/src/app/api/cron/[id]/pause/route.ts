/**
 * POST /api/cron/[id]/pause
 *
 * Toggle pause state of a cron job.
 * Body: { paused: boolean }
 */

import { NextRequest } from "next/server";
import { updateCronJob } from "@/lib/cron";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { paused } = body;

  if (typeof paused !== "boolean") {
    return Response.json(
      { error: "paused (boolean) is required" },
      { status: 400 }
    );
  }

  try {
    await updateCronJob(id, { paused });

    return Response.json({
      ok: true,
      message: paused ? `Cron job ${id} has been paused` : `Cron job ${id} has been resumed`,
      paused,
    });
  } catch (err) {
    console.error("Pause cron job error:", err);
    return Response.json(
      { error: "Failed to update cron job" },
      { status: 500 }
    );
  }
}
