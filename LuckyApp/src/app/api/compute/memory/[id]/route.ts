/**
 * PATCH  /api/compute/memory/[id]  — Update memory entry
 * DELETE /api/compute/memory/[id]  — Delete memory entry
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { updateMemoryEntry, deleteMemoryEntry } from "@/lib/compute/firestore";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const allowed = ["content", "tags", "pinned"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  await updateMemoryEntry(id, update);
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  await deleteMemoryEntry(id);
  return Response.json({ ok: true });
}
