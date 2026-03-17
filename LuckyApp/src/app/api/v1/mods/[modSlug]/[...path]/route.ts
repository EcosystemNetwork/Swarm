/**
 * Catch-all proxy route for mod service APIs.
 *
 * /api/v1/mods/:modSlug/* → proxied to the mod's registered serviceUrl
 *
 * Flow:
 * 1. Extract modSlug + path segments
 * 2. Verify auth (wallet address)
 * 3. Look up mod service in registry
 * 4. Check subscription access
 * 5. Proxy request to mod service with service token
 */

import { type NextRequest } from "next/server";
import { proxyToMod } from "@/lib/mod-gateway/proxy";

function getWallet(req: NextRequest): string | null {
  return req.headers.get("x-wallet-address")?.toLowerCase() || null;
}

function getOrgId(req: NextRequest): string | null {
  return req.headers.get("x-org-id") || req.nextUrl.searchParams.get("orgId") || null;
}

async function handleProxy(
  req: NextRequest,
  { params }: { params: Promise<{ modSlug: string; path: string[] }> },
) {
  const { modSlug, path } = await params;
  const wallet = getWallet(req);
  const orgId = getOrgId(req);

  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!orgId) {
    return Response.json({ error: "Org ID required (x-org-id header or orgId query param)" }, { status: 400 });
  }

  return proxyToMod(req, modSlug, path, { orgId, wallet });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
