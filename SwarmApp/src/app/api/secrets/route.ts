/**
 * GET /api/secrets - List all secrets (masked)
 * POST /api/secrets - Create new encrypted secret
 *
 * Query: ?orgId=xxx
 * Body: { orgId, key, value, createdBy, masterSecret, tags?, description? }
 */

import { NextRequest } from "next/server";
import { getSecrets, storeSecret } from "@/lib/secrets";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    const secrets = await getSecrets(orgId);

    // Remove sensitive fields before sending
    const masked = secrets.map((s) => ({
      id: s.id,
      key: s.key,
      maskedPreview: s.maskedPreview,
      createdBy: s.createdBy,
      createdAt: s.createdAt,
      lastAccessedAt: s.lastAccessedAt,
      accessCount: s.accessCount,
      tags: s.tags,
      description: s.description,
    }));

    return Response.json({
      ok: true,
      secrets: masked,
      count: masked.length,
    });
  } catch (err) {
    console.error("Get secrets error:", err);
    return Response.json(
      { error: "Failed to get secrets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, key, value, createdBy, masterSecret, tags, description } = body;

  if (!orgId || !key || !value || !createdBy || !masterSecret) {
    return Response.json(
      {
        error: "orgId, key, value, createdBy, and masterSecret are required",
      },
      { status: 400 }
    );
  }

  try {
    const secretId = await storeSecret(
      orgId as string,
      key as string,
      value as string,
      createdBy as string,
      masterSecret as string,
      {
        tags: tags as string[] | undefined,
        description: description as string | undefined,
      }
    );

    return Response.json({
      ok: true,
      secretId,
      message: "Secret stored successfully",
    });
  } catch (err) {
    console.error("Store secret error:", err);
    return Response.json(
      { error: "Failed to store secret" },
      { status: 500 }
    );
  }
}
