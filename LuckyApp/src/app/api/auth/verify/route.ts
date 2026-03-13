/**
 * POST /api/auth/verify
 * Verifies a signed SIWE payload and creates an authenticated session.
 * Body: { payload: LoginPayload, signature: string }
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
import { getCachedOrgs, cacheOrgs } from "@/lib/org-cache";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit-firestore";
import { getThirdwebAuth, getDomainFromRequest } from "../thirdweb-auth";

export async function POST(req: Request) {
  try {
    // Rate limiting: 10 login attempts per IP per minute
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(clientIp, {
      max: 10,
      windowMs: 60 * 1000, // 1 minute
    });

    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: "Too many login attempts. Please try again later.",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetTime / 1000)),
          },
        }
      );
    }

    const body = await req.json();
    const { payload, signature } = body;

    if (!payload) {
      return Response.json(
        { error: "payload is required" },
        { status: 400 }
      );
    }

    if (!signature || typeof signature !== "string") {
      return Response.json(
        { error: "signature is required" },
        { status: 400 }
      );
    }

    // Verify the SIWE signature
    console.log("[auth/verify] Verifying SIWE signature...");
    console.log("[auth/verify] Payload:", JSON.stringify(payload, null, 2));
    console.log("[auth/verify] Signature:", signature);
    const domain = getDomainFromRequest(req);
    console.log("[auth/verify] Domain:", domain);
    const auth = getThirdwebAuth(domain);

    let verifiedPayload;
    try {
      verifiedPayload = await auth.verifyPayload({ payload, signature });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[auth/verify] Signature verification failed:", msg);
      return Response.json(
        { error: "Invalid signature. Please try again." },
        { status: 401 }
      );
    }

    // Extract address from verified payload (nested at payload.address)
    const address = verifiedPayload.payload?.address || verifiedPayload.address;
    console.log("[auth/verify] ✅ Signature verified for:", address);

    if (!address) {
      console.error("[auth/verify] No address found in verified payload");
      return Response.json(
        { error: "Invalid payload: no address found" },
        { status: 400 }
      );
    }

    // 1. Determine role based on org ownership
    let orgs;
    try {
      // Check cache first
      orgs = getCachedOrgs(address);
      if (!orgs) {
        // Cache miss - fetch from Firestore
        orgs = await getOrganizationsByWallet(address);
        // Cache the result
        cacheOrgs(address, orgs);
      }
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
      console.log("[auth/verify] ✅ Session cookie set successfully");
    } catch (err) {
      console.error("[auth/verify] setSessionCookie error:", err);
      // Don't fail - cookie might still work
    }

    console.log("[auth/verify] ✅ Session created successfully for:", address);
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
