/**
 * GET /api/meshy/stream?orgId=...&taskId=...&taskType=text-to-3d|image-to-3d
 *
 * Server-side SSE relay for Meshy task progress.
 * The browser can't call Meshy directly (needs API key),
 * so this route proxies the SSE stream.
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import { isMeshyConfigured, streamTaskUpdates } from "@/lib/meshy";

export async function GET(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const taskId = req.nextUrl.searchParams.get("taskId");
  const taskType = req.nextUrl.searchParams.get("taskType") as "text-to-3d" | "image-to-3d";

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }
  if (!taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }
  if (!taskType || !["text-to-3d", "image-to-3d"].includes(taskType)) {
    return Response.json({ error: "taskType must be 'text-to-3d' or 'image-to-3d'" }, { status: 400 });
  }

  const orgAuth = await requireOrgMember(req, orgId);
  if (!orgAuth.ok) {
    return Response.json({ error: orgAuth.error }, { status: orgAuth.status || 403 });
  }

  if (!isMeshyConfigured()) {
    return Response.json(
      { error: "Meshy.ai is not configured. Set MESHY_API_KEY." },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const update of streamTaskUpdates(taskType, taskId)) {
          const event = `data: ${JSON.stringify(update)}\n\n`;
          controller.enqueue(encoder.encode(event));

          // Close on terminal states
          if (["SUCCEEDED", "FAILED", "EXPIRED", "CANCELED"].includes(update.status)) {
            controller.close();
            return;
          }
        }
        controller.close();
      } catch (err) {
        const errorEvent = `data: ${JSON.stringify({ error: err instanceof Error ? err.message : "Stream error" })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
