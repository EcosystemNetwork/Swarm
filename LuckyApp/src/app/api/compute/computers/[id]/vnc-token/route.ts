/**
 * GET /api/compute/computers/[id]/vnc-token — Get VNC/desktop URL for a running computer
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import { getComputer } from "@/lib/compute/firestore";
import { getComputeProvider } from "@/lib/compute/provider";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const computer = await getComputer(id);
  if (!computer) return Response.json({ error: "Computer not found" }, { status: 404 });

  const auth = await requireOrgMember(req, computer.orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  if (computer.status !== "running") {
    return Response.json(
      { error: "Computer must be running to get VNC access" },
      { status: 409 },
    );
  }

  const provider = getComputeProvider();
  try {
    const url = computer.providerInstanceId
      ? await provider.getVncUrl(computer.providerInstanceId)
      : "";
    return Response.json({ ok: true, url });
  } catch (err) {
    console.error("[compute/vnc-token] Failed:", err);
    return Response.json({ error: "Failed to get VNC URL" }, { status: 500 });
  }
}
