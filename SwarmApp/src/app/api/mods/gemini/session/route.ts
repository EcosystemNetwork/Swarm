/**
 * POST /api/mods/gemini/session — Create a new Gemini session (Firestore)
 * GET  /api/mods/gemini/session — Get session info
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { createModSession, getModSession } from "@/lib/mods/firestore";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { task, computerId } = body as { task?: string; computerId?: string };

  const sessionId = await createModSession({
    modId: "gemini-live-agent",
    userId: wallet,
    task,
    computerId,
  });

  return Response.json({
    ok: true,
    session: {
      id: sessionId,
      modId: "gemini-live-agent",
      status: "idle",
      events: [],
      createdAt: new Date().toISOString(),
    },
  }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("id");
  if (sessionId) {
    const session = await getModSession(sessionId);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    return Response.json({ ok: true, session });
  }

  // No specific session requested — return empty idle state
  return Response.json({
    ok: true,
    session: {
      id: "none",
      modId: "gemini-live-agent",
      status: "idle",
      events: [],
      createdAt: new Date().toISOString(),
    },
  });
}
