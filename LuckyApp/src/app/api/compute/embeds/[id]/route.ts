/**
 * DELETE /api/compute/embeds/[id] — Revoke an embed token
 */
import { NextRequest } from "next/server";
import { getWalletAddress } from "@/lib/auth-guard";
import { deleteEmbedToken } from "@/lib/compute/firestore";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  await deleteEmbedToken(id);
  return Response.json({ ok: true });
}
