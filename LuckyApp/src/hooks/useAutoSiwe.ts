/**
 * useAutoSiwe — Automatically triggers SIWE (Sign-In With Ethereum) after wallet connects.
 *
 * When a wallet connects and the user doesn't have an active session,
 * this hook automatically:
 *   1. Fetches a login payload from /api/auth/payload
 *   2. Signs it with the wallet via thirdweb's signLoginPayload
 *   3. Sends the signature to /api/auth/verify to create a session
 *   4. Refreshes the SessionContext
 *
 * When the wallet disconnects, it auto-logs out.
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useActiveAccount, useIsAutoConnecting } from "thirdweb/react";
import { signLoginPayload } from "thirdweb/auth";
import { useSession } from "@/contexts/SessionContext";

export function useAutoSiwe() {
  const account = useActiveAccount();
  const isAutoConnecting = useIsAutoConnecting();
  const { authenticated, loading, refresh, logout } = useSession();
  const [signingIn, setSigningIn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const signingRef = useRef(false);
  const lastAddressRef = useRef<string | null>(null);

  const triggerSiwe = useCallback(
    async (acct: NonNullable<typeof account>) => {
      if (signingRef.current) return;
      signingRef.current = true;
      setSigningIn(true);
      setSignError(null);

      try {
        // 1. Get login payload from server
        const payloadRes = await fetch("/api/auth/payload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: acct.address }),
        });
        if (!payloadRes.ok) {
          const err = await payloadRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to get login payload");
        }
        const payload = await payloadRes.json();

        // 2. Sign payload with the connected wallet
        const { signature } = await signLoginPayload({
          payload,
          account: acct,
        });

        // 3. Verify signature and create session on server
        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payload, signature }),
        });
        if (!verifyRes.ok) {
          const err = await verifyRes.json().catch(() => ({}));
          throw new Error(err.error || "Verification failed");
        }

        // 4. Refresh session context so the app knows we're authenticated
        await refresh();
        lastAddressRef.current = acct.address.toLowerCase();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // User rejected the signing request — don't show as error
        if (
          msg.includes("rejected") ||
          msg.includes("denied") ||
          msg.includes("cancelled") ||
          msg.includes("user closed") ||
          msg.includes("User denied")
        ) {
          console.info("[Swarm] User declined SIWE signature");
        } else {
          console.error("[Swarm] Auto-SIWE failed:", msg);
          setSignError(msg);
        }
      } finally {
        signingRef.current = false;
        setSigningIn(false);
      }
    },
    [refresh]
  );

  useEffect(() => {
    // Wait for auto-connect and session loading to finish
    if (isAutoConnecting || loading) return;

    if (!account) {
      // Wallet disconnected — logout if we had a session
      if (lastAddressRef.current) {
        lastAddressRef.current = null;
        logout();
      }
      return;
    }

    // Already authenticated with this address — nothing to do
    if (authenticated) {
      lastAddressRef.current = account.address.toLowerCase();
      return;
    }

    // Already in the middle of signing — skip
    if (signingRef.current) return;

    // Wallet connected but no session — auto-trigger SIWE
    triggerSiwe(account);
  }, [account, isAutoConnecting, loading, authenticated, triggerSiwe, logout]);

  return { signingIn, signError };
}
