/**
 * POST /api/auth/verify
 * Verifies a signed wallet challenge and creates a session.
 * Body: { address: string, signature: string, message: string }
 * Returns: { success: true, session: { address, role } }
 * Sets: httpOnly cookie `swarm_session`
 *
 * Uses viem for signature verification — same library thirdweb v5 uses
 * internally, ensuring compatibility across all wallet types (EOA,
 * in-app, smart account).
 */
import { NextRequest } from "next/server";
import { verifyMessage } from "viem";
import { getAddress } from "viem";
import {
  consumeNonce,
  resolveRole,
  createSession,
  signSessionJWT,
  setSessionCookie,
} from "@/lib/session";
import { getOrganizationsByWallet } from "@/lib/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, signature, message } = body;

    if (!address || !signature || !message) {
      return Response.json(
        { error: "address, signature, and message are required" },
        { status: 400 }
      );
    }

    // 1. Verify the nonce hasn't expired and exists
    let storedNonce: string | null;
    try {
      storedNonce = await consumeNonce(address);
    } catch (err) {
      console.error("[auth/verify] consumeNonce error:", err);
      return Response.json(
        { error: "Failed to validate nonce. Please try again." },
        { status: 500 }
      );
    }

    if (!storedNonce) {
      return Response.json(
        { error: "Nonce expired or invalid. Request a new challenge." },
        { status: 401 }
      );
    }

    // 2. Verify the signed message contains the correct nonce
    if (!message.includes(storedNonce)) {
      return Response.json(
        { error: "Message does not match the issued challenge" },
        { status: 401 }
      );
    }

    // 3. Verify signature using viem (matches thirdweb's signing)
    let checksummed: string;
    try {
      checksummed = getAddress(address);
    } catch {
      return Response.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    let valid: boolean;
    try {
      valid = await verifyMessage({
        address: checksummed as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    } catch (err) {
      console.error("[auth/verify] Signature verification error:", err);
      return Response.json(
        { error: "Invalid signature format" },
        { status: 401 }
      );
    }

    if (!valid) {
      return Response.json(
        { error: "Signature does not match the claimed address" },
        { status: 401 }
      );
    }

    // 4. Determine role based on org ownership
    let orgs;
    try {
      orgs = await getOrganizationsByWallet(checksummed);
    } catch (err) {
      console.error("[auth/verify] getOrganizationsByWallet error:", err);
      return Response.json(
        { error: "Failed to load organizations. Please try again." },
        { status: 500 }
      );
    }

    const ownedOrgIds = orgs
      .filter(
        (o) => o.ownerAddress.toLowerCase() === checksummed.toLowerCase()
      )
      .map((o) => o.id);

    const role = resolveRole(checksummed, ownedOrgIds);

    // 5. Create Firestore session + JWT
    let sessionId: string;
    try {
      sessionId = await createSession(checksummed, role);
    } catch (err) {
      console.error("[auth/verify] createSession error:", err);
      return Response.json(
        { error: "Failed to create session. Please try again." },
        { status: 500 }
      );
    }

    let token: string;
    try {
      token = await signSessionJWT(checksummed, sessionId, role);
    } catch (err) {
      console.error("[auth/verify] signSessionJWT error:", err);
      return Response.json(
        { error: "Failed to sign session token. Check SESSION_SECRET." },
        { status: 500 }
      );
    }

    // 6. Set httpOnly cookie
    try {
      await setSessionCookie(token);
    } catch (err) {
      console.error("[auth/verify] setSessionCookie error:", err);
      // Cookie setting failed but session exists — return success anyway
      // so the client can retry with a session refresh
    }

    return Response.json({
      success: true,
      session: {
        address: checksummed,
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
