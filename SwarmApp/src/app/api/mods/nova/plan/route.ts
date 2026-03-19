/**
 * POST /api/mods/nova/plan — Create a workflow plan with Amazon Nova
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { createWorkflowPlan } from "@/lib/mods/nova/client";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const { goal, pageUrl, screenshot } = body as {
    goal: string;
    pageUrl?: string;
    screenshot?: string;
  };

  if (!goal) {
    return Response.json({ error: "goal is required" }, { status: 400 });
  }

  if (goal.length > 2000) {
    return Response.json({ error: "goal must be at most 2000 characters" }, { status: 400 });
  }

  try {
    const plan = await createWorkflowPlan(goal, pageUrl, screenshot);
    return Response.json({ ok: true, plan });
  } catch (err) {
    console.error("[mods/nova/plan] Failed:", err);
    return Response.json({ error: "Planning failed", detail: (err as Error).message }, { status: 500 });
  }
}
