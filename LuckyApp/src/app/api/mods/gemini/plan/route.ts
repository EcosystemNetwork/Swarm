/**
 * POST /api/mods/gemini/plan — Create an action plan with Gemini
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { createPlan } from "@/lib/mods/gemini/client";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const { screenshot, task, history } = body as {
    screenshot?: string;
    task: string;
    history?: string;
  };

  if (!task) {
    return Response.json({ error: "task is required" }, { status: 400 });
  }

  try {
    const plan = await createPlan(screenshot || "", task, history);
    return Response.json({ ok: true, plan });
  } catch (err) {
    console.error("[mods/gemini/plan] Failed:", err);
    return Response.json({ error: "Planning failed", detail: (err as Error).message }, { status: 500 });
  }
}
