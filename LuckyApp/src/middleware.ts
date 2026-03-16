/**
 * Next.js Middleware — Server-side session validation.
 *
 * Runs on every matched route BEFORE rendering.
 * Validates the `swarm_session` JWT cookie and injects session headers
 * for downstream API routes and server components.
 *
 * Protected dashboard routes redirect to "/" if no valid session.
 * API routes that need auth get a 401 response.
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "swarm_session";

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET env var must be set (min 32 chars). " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  return new TextEncoder().encode(raw);
}

/** Routes that require a valid session to access */
const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/agents",
  "/swarms",
  "/jobs",
  "/missions",
  "/chat",
  "/settings",
  "/profile",
  "/analytics",
  "/activity",
  "/approvals",
  "/calendar",
  "/cerebro",
  "/chainlink",
  "/cron",
  "/doctor",
  "/gateways",
  "/hbar",
  "/kanban",
  "/logs",
  "/market",
  "/memory",
  "/metrics",
  "/onboarding",
  "/operators",
  "/organizations",
  "/swarm",
  "/usage",
];

/** API routes that require operator session (not agent auth) */
const PROTECTED_API_PREFIXES = [
  "/api/auth/session", // needs cookie read, but doesn't need protection
];

/** API routes that should pass through without session check */
const PUBLIC_API_PREFIXES = [
  "/api/auth/payload",
  "/api/auth/verify",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/webhooks",
  "/api/v1",
  "/api/chainlink",
  "/api/live-feed",
  "/api/cron-jobs",
  "/api/github/webhook",
  "/api/github/callback",
];

interface SessionPayload {
  sub: string;
  sid: string;
  role: string;
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check if this is a public API route — pass through
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Read session cookie
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;

  // Inject session headers for downstream consumption (API routes, server components)
  const response = NextResponse.next();
  if (session) {
    response.headers.set("x-session-address", session.sub);
    response.headers.set("x-session-role", session.role);
    response.headers.set("x-session-id", session.sid);
  }

  // Check protected page routes
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );

  if (isProtectedPage && !session) {
    // No valid session — redirect to landing page
    const loginUrl = new URL("/", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next (static files)
     * - favicon.ico
     * - public files with extensions (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)",
  ],
};
