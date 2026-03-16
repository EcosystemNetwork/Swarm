/**
 * GET /api/compute/sessions?computerId=xxx — List sessions
 * GET /api/compute/sessions?workspaceId=xxx — List sessions by workspace
 */
import { NextRequest } from "next/server";
import { getSessions } from "@/lib/compute/firestore";

export async function GET(req: NextRequest) {
  const computerId = req.nextUrl.searchParams.get("computerId") || undefined;
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") || undefined;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

  if (!computerId && !workspaceId) {
    return Response.json({ error: "computerId or workspaceId required" }, { status: 400 });
  }

  const sessions = await getSessions({ computerId, workspaceId, limit });
  return Response.json({ ok: true, sessions });
}
