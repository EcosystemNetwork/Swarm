/**
 * POST /api/auth/payload
 * Generates a thirdweb SIWE login payload for the given wallet address.
 * Body: { address: string, chainId?: string }
 * Returns: LoginPayload (thirdweb format — domain, nonce, statement, etc.)
 *
 * The domain is read from the request Host header so it matches the
 * actual site the user is visiting (localhost, swarm-protocol.xyz, etc.)
 *
 * Called by ConnectButton's auth.getLoginPayload callback.
 */
import { getThirdwebAuth, getDomainFromRequest } from "../thirdweb-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const address = body.address?.trim();

    if (!address || typeof address !== "string") {
      return Response.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    const domain = getDomainFromRequest(req);
    const auth = getThirdwebAuth(domain);

    const payload = await auth.generatePayload({
      address,
      chainId: body.chainId ? Number(body.chainId) : undefined,
    });

    return Response.json(payload);
  } catch (err) {
    console.error("[auth/payload] Error:", err);
    return Response.json(
      { error: "Failed to generate login payload" },
      { status: 500 }
    );
  }
}
