/**
 * POST /api/compute/computers/[id]/snapshot — Create a snapshot of a computer
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import { getComputer, updateComputer, createSnapshot } from "@/lib/compute/firestore";
import { getComputeProvider } from "@/lib/compute/provider";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const computer = await getComputer(id);
  if (!computer) return Response.json({ error: "Computer not found" }, { status: 404 });

  const auth = await requireOrgMember(req, computer.orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  if (computer.status !== "running" && computer.status !== "stopped") {
    return Response.json(
      { error: `Cannot snapshot computer in "${computer.status}" state` },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const label = (body as Record<string, string>).label || `Snapshot ${new Date().toISOString()}`;

  const prevStatus = computer.status;
  await updateComputer(id, { status: "snapshotting" });

  const provider = getComputeProvider();
  try {
    const providerSnapshotId = computer.providerInstanceId
      ? await provider.createSnapshot(computer.providerInstanceId, label)
      : `snap_${Date.now()}`;

    const snapshotId = await createSnapshot({
      computerId: id,
      providerSnapshotId,
      label,
    });

    await updateComputer(id, { status: prevStatus });
    return Response.json({ ok: true, snapshotId }, { status: 201 });
  } catch (err) {
    console.error("[compute/snapshot] Failed:", err);
    await updateComputer(id, { status: prevStatus });
    return Response.json({ error: "Failed to create snapshot" }, { status: 500 });
  }
}
