/**
 * POST /api/v1/mods/register — Mod service self-registration.
 * DELETE /api/v1/mods/register?slug=xxx — Mod service de-registration.
 *
 * Called by mod services on startup/shutdown. Authenticated via MOD_REGISTRATION_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertModService, removeModService } from "@/lib/mod-gateway/registry";
import type { ModServiceRegistration } from "@/lib/mod-gateway/types";

const REGISTRATION_SECRET = process.env.MOD_REGISTRATION_SECRET || "dev-registration-secret";

function verifySecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.replace("Bearer ", "");
  return token === REGISTRATION_SECRET;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Invalid registration secret" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as ModServiceRegistration;

    if (!body.slug || !body.serviceUrl || !body.modId) {
      return NextResponse.json(
        { error: "Missing required fields: slug, serviceUrl, modId" },
        { status: 400 },
      );
    }

    await upsertModService(body);

    return NextResponse.json({
      ok: true,
      registered: true,
      gatewayUrl: `/api/v1/mods/${body.slug}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Invalid registration secret" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }

  try {
    await removeModService(slug);
    return NextResponse.json({ ok: true, removed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "De-registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
