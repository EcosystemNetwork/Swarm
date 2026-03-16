/**
 * POST /api/compute/memory/search — Search memory entries
 */
import { NextRequest } from "next/server";
import { searchMemory } from "@/lib/compute/memory";
import type { MemoryScopeType } from "@/lib/compute/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { scopeType, scopeId, query: searchQuery, limit } = body as {
    scopeType: MemoryScopeType;
    scopeId: string;
    query: string;
    limit?: number;
  };

  if (!scopeType || !scopeId) {
    return Response.json({ error: "scopeType and scopeId required" }, { status: 400 });
  }

  const entries = await searchMemory(scopeType, scopeId, searchQuery || "", { limit });
  return Response.json({ ok: true, entries });
}
