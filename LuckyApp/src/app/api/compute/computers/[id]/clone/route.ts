/**
 * POST /api/compute/computers/[id]/clone — Clone a computer
 */
import { NextRequest } from "next/server";
import { requireOrgMember, getWalletAddress } from "@/lib/auth-guard";
import { getComputer, createComputer } from "@/lib/compute/firestore";

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

  const body = await req.json().catch(() => ({}));
  const name = (body as Record<string, string>).name || `${computer.name} (copy)`;

  const cloneId = await createComputer({
    workspaceId: computer.workspaceId,
    orgId: computer.orgId,
    name,
    status: "stopped",
    provider: computer.provider,
    providerInstanceId: null,
    templateId: computer.templateId,
    sizeKey: computer.sizeKey,
    cpuCores: computer.cpuCores,
    ramMb: computer.ramMb,
    diskGb: computer.diskGb,
    resolutionWidth: computer.resolutionWidth,
    resolutionHeight: computer.resolutionHeight,
    region: computer.region,
    persistenceEnabled: computer.persistenceEnabled,
    staticIpEnabled: computer.staticIpEnabled,
    autoStopMinutes: computer.autoStopMinutes,
    controllerType: computer.controllerType,
    modelKey: computer.modelKey,
    createdByUserId: wallet,
  });

  return Response.json({ ok: true, id: cloneId }, { status: 201 });
}
