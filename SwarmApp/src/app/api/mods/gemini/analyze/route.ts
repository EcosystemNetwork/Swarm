/**
 * POST /api/mods/gemini/analyze — Analyze a screenshot with Gemini
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { analyzeScreenshot } from "@/lib/mods/gemini/client";

export async function POST(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const { screenshot, task } = body as { screenshot: string; task: string };

  if (!screenshot || !task) {
    return Response.json({ error: "screenshot (base64) and task are required" }, { status: 400 });
  }

  if (task.length > 2000) {
    return Response.json({ error: "task must be at most 2000 characters" }, { status: 400 });
  }

  try {
    const analysis = await analyzeScreenshot(screenshot, task);
    return Response.json({ ok: true, analysis });
  } catch (err) {
    console.error("[mods/gemini/analyze] Failed:", err);
    return Response.json({ error: "Analysis failed", detail: (err as Error).message }, { status: 500 });
  }
}
