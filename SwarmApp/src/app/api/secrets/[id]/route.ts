/**
 * DELETE /api/secrets/[id] - Delete a secret
 *
 * Body: { orgId: string }
 */
import { NextRequest } from "next/server";
import { deleteSecret } from "@/lib/secrets";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = body.orgId as string | undefined;
  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    await deleteSecret(id, orgId, orgId);
    return Response.json({ ok: true, message: "Secret deleted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete secret";
    const status = message.includes("not found") ? 404 : message.includes("not belong") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
