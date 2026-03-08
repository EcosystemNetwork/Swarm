/**
 * POST /api/auth/verify
 * Verifies a signed wallet challenge and creates a session.
 * Body: { address: string, signature: string, message: string }
 * Returns: { success: true, session: { address, role } }
 * Sets: httpOnly cookie `swarm_session`
 */
import { NextRequest } from "next/server";
import { verifyMessage, getAddress } from "ethers";
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

    // 3. Recover signer address from signature
    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch {
      return Response.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // 4. Verify recovered address matches claimed address
    const checksummed = getAddress(address);
    if (getAddress(recoveredAddress) !== checksummed) {
      return Response.json(
        { error: "Signature does not match the claimed address" },
        { status: 401 }
      );
    }

    // 5. Determine role based on org ownership
    const orgs = await getOrganizationsByWallet(checksummed);
    const ownedOrgIds = orgs
      .filter(
        (o) => o.ownerAddress.toLowerCase() === checksummed.toLowerCase()
      )
      .map((o) => o.id);

    const role = resolveRole(checksummed, ownedOrgIds);

    // 6. Create Firestore session + JWT
    const sessionId = await createSession(checksummed, role);
    const token = await signSessionJWT(checksummed, sessionId, role);

    // 7. Set httpOnly cookie
    await setSessionCookie(token);

    return Response.json({
      success: true,
      session: {
        address: checksummed,
        role,
      },
    });
  } catch (err) {
    console.error("[auth/verify] Error:", err);
    return Response.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
