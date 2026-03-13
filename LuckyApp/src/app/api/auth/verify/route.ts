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
import { getCachedOrgs, cacheOrgs } from "@/lib/org-cache";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit-firestore";

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
