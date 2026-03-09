/**
 * Server-side thirdweb auth helpers.
 *
 * Uses `createAuth` from `thirdweb/auth` to generate login payloads
 * and verify signed payloads. The domain is resolved dynamically from
 * the request Host header so it works in both localhost and production.
 *
 * The ConnectButton `auth` prop on the client wires into these endpoints:
 *   - getLoginPayload  → POST /api/auth/payload
 *   - doLogin          → POST /api/auth/verify
 *   - isLoggedIn       → GET  /api/auth/session
 *   - doLogout         → POST /api/auth/logout
 */
import { createAuth } from "thirdweb/auth";
import { createThirdwebClient } from "thirdweb";

const client = createThirdwebClient({
  // Server-side: use secretKey if available, otherwise clientId for EOA-only verification
  ...(process.env.THIRDWEB_SECRET_KEY
    ? { secretKey: process.env.THIRDWEB_SECRET_KEY }
    : { clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "510999ec2be00a99e36ab07b36f15a72" }),
});

const AUTH_OPTIONS = {
  client,
  login: {
    statement: "Sign in to Swarm — this does not trigger a blockchain transaction or cost gas.",
    payloadExpirationTimeSeconds: 600,
  },
} as const;

/**
 * Create a thirdweb auth instance for a specific domain.
 * The domain MUST match the host the user is visiting, otherwise
 * the SIWE payload domain check will fail.
 */
export function getThirdwebAuth(domain: string) {
  return createAuth({ ...AUTH_OPTIONS, domain });
}

/**
 * Extract the domain from a request's Host header.
 * Falls back to NEXT_PUBLIC_APP_DOMAIN env var or "localhost:3000".
 */
export function getDomainFromRequest(req: Request): string {
  const host = req.headers.get("host")
    || req.headers.get("x-forwarded-host")
    || process.env.NEXT_PUBLIC_APP_DOMAIN
    || "localhost:3000";
  // Strip port for standard ports
  return host.replace(/:443$/, "").replace(/:80$/, "");
}
