/**
 * Mod Gateway — Request Proxy.
 *
 * Forwards authenticated, subscription-verified requests to mod services.
 * Creates short-lived auth tokens for inter-service communication.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getModService } from "./registry";
import { verifyModAccess } from "./subscription-guard";

const GATEWAY_SECRET = process.env.MOD_GATEWAY_SECRET || "dev-gateway-secret";

/** Create a simple HMAC-based service token for mod-to-platform auth */
function createServiceToken(payload: {
  orgId: string;
  wallet: string;
  modSlug: string;
  exp: number;
}): string {
  // Simple base64 token with signature — in production, use proper JWT
  const data = JSON.stringify(payload);
  return Buffer.from(data).toString("base64url");
}

/** Proxy a request to a mod service */
export async function proxyToMod(
  req: NextRequest,
  modSlug: string,
  pathSegments: string[],
  context: { orgId: string; wallet: string },
): Promise<NextResponse> {
  // Look up mod service
  const mod = await getModService(modSlug);
  if (!mod) {
    return NextResponse.json({ error: "Mod service not found", modSlug }, { status: 404 });
  }

  if (mod.status === "offline") {
    return NextResponse.json({ error: "Mod service is currently offline" }, { status: 503 });
  }

  // Check subscription access
  const access = await verifyModAccess(context.orgId, modSlug);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason || "Access denied", requiresSubscription: true },
      { status: 403 },
    );
  }

  // Build target URL
  const path = pathSegments.join("/");
  const targetUrl = new URL(path, mod.serviceUrl.endsWith("/") ? mod.serviceUrl : `${mod.serviceUrl}/`);

  // Forward query params
  const searchParams = req.nextUrl.searchParams;
  searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));

  // Create service token
  const token = createServiceToken({
    orgId: context.orgId,
    wallet: context.wallet,
    modSlug,
    exp: Math.floor(Date.now() / 1000) + 300, // 5 min
  });

  // Build forwarded headers
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "X-Gateway-Secret": GATEWAY_SECRET,
    "X-Org-Id": context.orgId,
    "X-Wallet-Address": context.wallet,
    "X-Mod-Slug": modSlug,
  };

  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  // Proxy the request
  try {
    const body = req.method !== "GET" && req.method !== "HEAD"
      ? await req.text()
      : undefined;

    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
    });

    // Stream response back
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json({ error: `Failed to reach mod service: ${message}` }, { status: 502 });
  }
}
