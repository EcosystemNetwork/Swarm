/**
 * GET /api/meshy/download?orgId=...&url=...
 *
 * Proxy download for Meshy model files.
 * The browser shouldn't download directly from Meshy URLs
 * (they may expire). This route proxies the download.
 *
 * Auth: org member
 */

import { NextRequest } from "next/server";
import { getWalletAddress, requireOrgMember } from "@/lib/auth-guard";
import { downloadModel } from "@/lib/meshy";

export async function GET(req: NextRequest) {
  const wallet = getWalletAddress(req);
  if (!wallet) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const url = req.nextUrl.searchParams.get("url");

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }
  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  // Validate the URL is from Meshy
  if (!url.startsWith("https://assets.meshy.ai/")) {
    return Response.json({ error: "Only Meshy asset URLs are allowed" }, { status: 400 });
  }

  const orgAuth = await requireOrgMember(req, orgId);
  if (!orgAuth.ok) {
    return Response.json({ error: orgAuth.error }, { status: orgAuth.status || 403 });
  }

  try {
    const buffer = await downloadModel(url);

    // Determine content type from URL
    let contentType = "application/octet-stream";
    let filename = "model";
    if (url.endsWith(".glb")) {
      contentType = "model/gltf-binary";
      filename = "model.glb";
    } else if (url.endsWith(".fbx")) {
      contentType = "application/octet-stream";
      filename = "model.fbx";
    } else if (url.endsWith(".obj")) {
      contentType = "text/plain";
      filename = "model.obj";
    } else if (url.endsWith(".usdz")) {
      contentType = "model/vnd.usdz+zip";
      filename = "model.usdz";
    } else if (url.endsWith(".stl")) {
      contentType = "application/sla";
      filename = "model.stl";
    } else if (url.endsWith(".png")) {
      contentType = "image/png";
      filename = "thumbnail.png";
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 },
    );
  }
}
