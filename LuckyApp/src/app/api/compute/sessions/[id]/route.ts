/**
 * GET /api/compute/sessions/[id] — Get session details
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/compute/firestore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  return Response.json({ ok: true, session });
}
