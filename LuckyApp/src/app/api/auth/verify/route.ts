/**
 * POST /api/auth/verify
 * Verifies a signed thirdweb SIWE login payload and creates a session.
 * Body: { payload: LoginPayload, signature: string }
 * Returns: { success: true, session: { address, role } }
 * Sets: httpOnly cookie `swarm_session`
 *
 * The domain is read from the request Host header to match what was
 * used when generating the payload (works for localhost + production).
 *
 * Called by ConnectButton's auth.doLogin callback.
 */
import { getThirdwebAuth, getDomainFromRequest } from "../thirdweb-auth";
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
    const { payload, signature } = body;

    if (!payload || !signature) {
      return Response.json(
        { error: "payload and signature are required" },
        { status: 400 }
      );
    }

    // 1. Verify the signed payload using thirdweb auth
    //    Domain is read from the request host to match the payload
    const domain = getDomainFromRequest(req);
    const auth = getThirdwebAuth(domain);

    let result;
    try {
      result = await auth.verifyPayload({ payload, signature });
    } catch (err) {
      console.error("[auth/verify] verifyPayload error:", err);
      return Response.json(
        { error: "Signature verification failed" },
        { status: 401 }
      );
    }

    if (!result.valid) {
      console.warn("[auth/verify] Payload invalid:", result.error);
      return Response.json(
        { error: result.error || "Invalid signature" },
        { status: 401 }
      );
    }

    const address = result.payload.address;

    // 2. Determine role based on org ownership
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

    // 3. Create Firestore session + JWT
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

    // 4. Set httpOnly cookie
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
