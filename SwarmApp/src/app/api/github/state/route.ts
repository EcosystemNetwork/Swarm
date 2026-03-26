/** POST /api/github/state — Returns an HMAC-signed OAuth state token for CSRF protection. */
import { NextRequest, NextResponse } from "next/server";
import { signOAuthState } from "@/lib/github";

export async function POST(req: NextRequest) {
  const sessionAddress = req.headers.get("x-session-address");
  if (!sessionAddress) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const orgId = body.orgId;
    if (!orgId || typeof orgId !== "string") {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const signedState = signOAuthState(orgId);
    return NextResponse.json({ state: signedState });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
