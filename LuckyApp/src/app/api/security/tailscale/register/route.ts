/**
 * POST /api/security/tailscale/register
 *
 * Register a Tailscale device for IP whitelisting.
 * Body: { orgId, deviceId, deviceName, tailscaleIp, publicIp?, agentId?, agentName?, registeredBy }
 */

import { NextRequest } from "next/server";
import { registerTailscaleDevice } from "@/lib/tailscale";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    orgId,
    deviceId,
    deviceName,
    tailscaleIp,
    publicIp,
    agentId,
    agentName,
    os,
    hostname,
    tags,
    registeredBy,
  } = body;

  if (!orgId || !deviceId || !deviceName || !tailscaleIp || !registeredBy) {
    return Response.json(
      {
        error:
          "orgId, deviceId, deviceName, tailscaleIp, and registeredBy are required",
      },
      { status: 400 }
    );
  }

  try {
    const deviceDocId = await registerTailscaleDevice(
      orgId as string,
      {
        deviceId: deviceId as string,
        deviceName: deviceName as string,
        tailscaleIp: tailscaleIp as string,
        publicIp: publicIp as string | undefined,
        agentId: agentId as string | undefined,
        agentName: agentName as string | undefined,
        os: os as string | undefined,
        hostname: hostname as string | undefined,
        tags: tags as string[] | undefined,
      },
      registeredBy as string
    );

    return Response.json({
      ok: true,
      deviceId: deviceDocId,
      message: "Tailscale device registered successfully",
    });
  } catch (err) {
    console.error("Register Tailscale device error:", err);
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to register Tailscale device",
      },
      { status: 500 }
    );
  }
}
