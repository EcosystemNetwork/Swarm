/**
 * POST /api/mods/nova/session — Create a new Nova operator session (Firestore)
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { createModSession } from "@/lib/mods/firestore";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { task, computerId } = body as { task?: string; computerId?: string };

  const sessionId = await createModSession({
    modId: "amazon-nova-operator",
    userId: wallet,
    task,
    computerId,
  });

  return Response.json({
    ok: true,
    session: {
      id: sessionId,
      modId: "amazon-nova-operator",
      status: "idle",
      events: [],
      createdAt: new Date().toISOString(),
    },
  }, { status: 201 });
}
