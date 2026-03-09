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
    const storedNonce = await consumeNonce(address);
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
    const orgs = await getOrganizationsByWallet(checksummed);
    const ownedOrgIds = orgs
      .filter(
        (o) => o.ownerAddress.toLowerCase() === checksummed.toLowerCase()
      )
      .map((o) => o.id);

    const role = resolveRole(checksummed, ownedOrgIds);

    // 5. Create Firestore session + JWT
    const sessionId = await createSession(checksummed, role);
    const token = await signSessionJWT(checksummed, sessionId, role);

    // 6. Set httpOnly cookie
    await setSessionCookie(token);

    return Response.json({
      success: true,
      session: {
        address: checksummed,
        role,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/verify] Error:", msg, err);
    return Response.json(
      { error: `Authentication failed: ${msg}` },
      { status: 500 }
    );
  }
}
