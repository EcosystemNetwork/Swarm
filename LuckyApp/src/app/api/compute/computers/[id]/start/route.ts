/**
 * POST /api/compute/computers/[id]/start — Start a stopped computer
 */
import { NextRequest } from "next/server";
import { requireOrgMember, getWalletAddress } from "@/lib/auth-guard";
import { getComputer, updateComputer } from "@/lib/compute/firestore";
import { getComputeProvider } from "@/lib/compute/provider";
import { startComputeSession } from "@/lib/compute/sessions";
import { SIZE_PRESETS, DEFAULT_RESOLUTION } from "@/lib/compute/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const wallet = getWalletAddress(req);
  if (!wallet) return Response.json({ error: "Authentication required" }, { status: 401 });

  const computer = await getComputer(id);
  if (!computer) return Response.json({ error: "Computer not found" }, { status: 404 });

  const auth = await requireOrgMember(req, computer.orgId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status || 401 });

  if (computer.status !== "stopped" && computer.status !== "error") {
    return Response.json(
      { error: `Cannot start computer in "${computer.status}" state` },
      { status: 409 },
    );
  }

  await updateComputer(id, { status: "starting" });

  const provider = getComputeProvider();
  try {
    if (computer.providerInstanceId) {
      await provider.startInstance(computer.providerInstanceId);
    } else {
      const result = await provider.createInstance({
        name: computer.name,
        sizeKey: computer.sizeKey,
        cpuCores: computer.cpuCores,
        ramMb: computer.ramMb,
        diskGb: computer.diskGb,
        resolutionWidth: computer.resolutionWidth,
        resolutionHeight: computer.resolutionHeight,
        region: computer.region,
        baseImage: "ubuntu:22.04",
        persistenceEnabled: computer.persistenceEnabled,
      });
      await updateComputer(id, { providerInstanceId: result.providerInstanceId });
    }

    await updateComputer(id, { status: "running", lastActiveAt: new Date() });

    const sessionId = await startComputeSession(
      id,
      computer.workspaceId,
      computer.controllerType,
      wallet,
      computer.modelKey,
    );

    return Response.json({ ok: true, sessionId });
  } catch (err) {
    console.error("[compute/start] Failed:", err);
    await updateComputer(id, { status: "error" });
    return Response.json({ error: "Failed to start computer" }, { status: 500 });
  }
}
