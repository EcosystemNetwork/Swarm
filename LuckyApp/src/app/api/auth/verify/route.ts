/**
 * POST /api/auth/verify
 * Creates a session for the given wallet address.
 * Body: { address: string }
 * Returns: { success: true, session: { address, role } }
 * Sets: httpOnly cookie `swarm_session`
 */
import { NextResponse } from "next/server";
import {
  resolveRole,
  createSession,
  signSessionJWT,
  SESSION_COOKIE,
} from "@/lib/session";
import { getOrganizationsByWallet } from "@/lib/firestore";
import { getCachedOrgs, cacheOrgs } from "@/lib/org-cache";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function POST(req: Request) {
  try {
    // Rate limiting: 10 login attempts per IP per minute
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(clientIp, {
      max: 10,
      windowMs: 60 * 1000, // 1 minute
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
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
      return NextResponse.json(
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
      return NextResponse.json(
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
      return NextResponse.json(
        { error: "Failed to create session. Please try again." },
        { status: 500 }
      );
    }

    let token: string;
    try {
      token = await signSessionJWT(address, sessionId, role);
    } catch (err) {
      console.error("[auth/verify] signSessionJWT error:", err);
      return NextResponse.json(
        { error: "Failed to sign session token. Check SESSION_SECRET." },
        { status: 500 }
      );
    }

    // 3. Create response with httpOnly cookie
    const response = NextResponse.json({
      success: true,
      session: {
        address,
        role,
        sessionId,
      },
    });

    // Set cookie directly on response
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    console.log("[auth/verify] ✅ Session created successfully for:", address);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/verify] Unhandled error:", msg, err);
    return Response.json(
      { error: `Authentication failed: ${msg}` },
      { status: 500 }
    );
  }
}
