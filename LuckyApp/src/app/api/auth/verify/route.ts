/**
 * POST /api/auth/verify
 * Creates a session for the given wallet address.
 * Body: { address: string }
 * Returns: { success: true, session: { address, role } }
 * Sets: httpOnly cookie `swarm_session`
 */
import {
  resolveRole,
  createSession,
  signSessionJWT,
  setSessionCookie,
} from "@/lib/session";
import { getOrganizationsByWallet } from "@/lib/firestore";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const address = (body.address ?? body.payload?.address ?? "").trim();

    if (!address || typeof address !== "string") {
      return Response.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    // 1. Determine role based on org ownership
    let orgs;
    try {
      orgs = await getOrganizationsByWallet(address);
    } catch (err) {
      console.error("[auth/verify] getOrganizationsByWallet error:", err);
      return Response.json(
        { error: "Failed to load organizations. Please try again." },
        { status: 500 }
      );
    }

    const ownedOrgIds = orgs
      .filter(
        (o) => o.ownerAddress.toLowerCase() === address.toLowerCase()
      )
      .map((o) => o.id);

    const role = resolveRole(address, ownedOrgIds);

    // 2. Create Firestore session + JWT
    let sessionId: string;
    try {
      sessionId = await createSession(address, role);
    } catch (err) {
      console.error("[auth/verify] createSession error:", err);
      return Response.json(
        { error: "Failed to create session. Please try again." },
        { status: 500 }
      );
    }

    let token: string;
    try {
      token = await signSessionJWT(address, sessionId, role);
    } catch (err) {
      console.error("[auth/verify] signSessionJWT error:", err);
      return Response.json(
        { error: "Failed to sign session token. Check SESSION_SECRET." },
        { status: 500 }
      );
    }

    // 3. Set httpOnly cookie
    try {
      await setSessionCookie(token);
    } catch (err) {
      console.error("[auth/verify] setSessionCookie error:", err);
    }

    return Response.json({
      success: true,
      session: {
        address,
        role,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/verify] Unhandled error:", msg, err);
    return Response.json(
      { error: `Authentication failed: ${msg}` },
      { status: 500 }
    );
  }
}
