/**
 * useAutoLogin — Automatically creates a session when a wallet connects.
 *
 * When a wallet connects and the user doesn't have an active session,
 * this hook automatically:
 *   1. Sends the wallet address to /api/auth/verify
 *   2. Server creates a session and sets the httpOnly cookie
 *   3. Refreshes the SessionContext
 *
 * When the wallet disconnects, it auto-logs out.
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useSession } from "@/contexts/SessionContext";

export function useAutoSiwe() {
  const account = useActiveAccount();
  const { authenticated, loading, refresh, logout } = useSession();
  const [signingIn, setSigningIn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const signingRef = useRef(false);
  const lastAddressRef = useRef<string | null>(null);

  const triggerLogin = useCallback(
    async (address: string) => {
      if (signingRef.current) return;
      signingRef.current = true;
      setSigningIn(true);
      setSignError(null);

      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ address }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Login failed");
        }

        await refresh();
        lastAddressRef.current = address.toLowerCase();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Swarm] Auto-login failed:", msg);
        setSignError(msg);
      } finally {
        signingRef.current = false;
        setSigningIn(false);
      }
    },
    [refresh]
  );

  useEffect(() => {
    // Wait for session check to finish
    if (loading) return;

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

    // Already in the middle of logging in — skip
    if (signingRef.current) return;

    // Wallet connected but no session — auto-login
    triggerLogin(account.address);
  }, [account, loading, authenticated, triggerLogin, logout]);

  return { signingIn, signError };
}
