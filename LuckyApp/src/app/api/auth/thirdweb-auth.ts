/**
 * Server-side thirdweb auth helpers.
 *
 * Uses `createAuth` from `thirdweb/auth` to generate login payloads
 * and verify signed payloads. The domain is resolved dynamically from
 * the request Host header so it works in both localhost and production.
 *
 * Client and auth instances are created lazily on first use so that
 * missing env vars don't crash the serverless function at import time
 * (which produces an opaque 502 on Netlify/Vercel).
 *
 * The ConnectButton `auth` prop on the client wires into these endpoints:
 *   - getLoginPayload  → POST /api/auth/payload
 *   - doLogin          → POST /api/auth/verify
 *   - isLoggedIn       → GET  /api/auth/session
 *   - doLogout         → POST /api/auth/logout
 */
import { createAuth } from "thirdweb/auth";
import { createThirdwebClient } from "thirdweb";

let _client: ReturnType<typeof createThirdwebClient> | null = null;

/**
 * Lazily create the thirdweb client. Throws a descriptive error
 * at call time (inside a try/catch in the route handler) instead
 * of at module load time (which causes 502).
 */
function getClient() {
  if (_client) return _client;

  const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
  const secretKey = process.env.THIRDWEB_SECRET_KEY;

  if (!clientId && !secretKey) {
    throw new Error(
      "Either THIRDWEB_SECRET_KEY or NEXT_PUBLIC_THIRDWEB_CLIENT_ID must be set."
    );
  }

  _client = createThirdwebClient(
    secretKey ? { secretKey } : { clientId: clientId! }
  );
  return _client;
}

/**
 * Create a thirdweb auth instance for a specific domain.
 * The domain MUST match the host the user is visiting, otherwise
 * the SIWE payload domain check will fail.
 */
export function getThirdwebAuth(domain: string) {
  const client = getClient();
  return createAuth({
    client,
    domain,
    login: {
      statement: "Sign in to Swarm — this does not trigger a blockchain transaction or cost gas.",
      payloadExpirationTimeSeconds: 600,
    },
  });
}

/**
 * Extract the domain from a request's Host header.
 * Falls back to NEXT_PUBLIC_APP_DOMAIN env var or "swarmprotocol.fun".
 */
export function getDomainFromRequest(req: Request): string {
  const host = req.headers.get("host")
    || req.headers.get("x-forwarded-host")
    || process.env.NEXT_PUBLIC_APP_DOMAIN
    || "swarmprotocol.fun";
  // Strip port for standard ports
  return host.replace(/:443$/, "").replace(/:80$/, "");
}
