/**
 * POST /api/auth/nonce
 * Generates a one-time nonce for the wallet challenge flow.
 * Body: { address: string }
 * Returns: { nonce: string, message: string }
 */
import { NextRequest } from "next/server";
import { createNonce, buildChallengeMessage } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = body.address?.trim();

    if (!address || typeof address !== "string") {
      return Response.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    // Basic wallet address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    const nonce = await createNonce(address);
    const domain = req.headers.get("host") || "swarm.app";
    const message = buildChallengeMessage(nonce, domain);

    return Response.json({ nonce, message });
  } catch (err) {
    console.error("[auth/nonce] Error:", err);
    return Response.json(
      { error: "Failed to generate nonce" },
      { status: 500 }
    );
  }
}
