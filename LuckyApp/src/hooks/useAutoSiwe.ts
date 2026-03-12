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
      console.log("[Swarm:autoLogin] triggerLogin called for", address);
      if (signingRef.current) {
        console.log("[Swarm:autoLogin] Already signing in, skipping");
        return;
      }
      signingRef.current = true;
      setSigningIn(true);
      setSignError(null);

      try {
        console.log("[Swarm:autoLogin] POSTing to /api/auth/verify");
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ address }),
        });
        console.log("[Swarm:autoLogin] Response status:", res.status);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("[Swarm:autoLogin] Verify failed:", err);
          throw new Error(err.error || "Login failed");
        }

        console.log("[Swarm:autoLogin] Refreshing session...");
        await refresh();
        console.log("[Swarm:autoLogin] Session refreshed successfully");
        lastAddressRef.current = address.toLowerCase();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Swarm:autoLogin] Error:", msg, err);
        setSignError(msg);
      } finally {
        signingRef.current = false;
        setSigningIn(false);
        console.log("[Swarm:autoLogin] triggerLogin complete");
      }
    },
    [refresh]
  );

  useEffect(() => {
    console.log("[Swarm:autoLogin] Effect fired —", {
      account: account?.address ?? null,
      loading,
      authenticated,
      signingRef: signingRef.current,
    });

    // Wait for session check to finish
    if (loading) {
      console.log("[Swarm:autoLogin] Still loading, waiting...");
      return;
    }

    if (!account) {
      console.log("[Swarm:autoLogin] No account connected");
      // Wallet disconnected — logout if we had a session
      if (lastAddressRef.current) {
        console.log("[Swarm:autoLogin] Logging out due to wallet disconnect");
        lastAddressRef.current = null;
        logout();
      }
      return;
    }

    // Already authenticated with this address — nothing to do
    if (authenticated) {
      console.log("[Swarm:autoLogin] Already authenticated");
      lastAddressRef.current = account.address.toLowerCase();
      return;
    }

    // Already in the middle of logging in — skip
    if (signingRef.current) {
      console.log("[Swarm:autoLogin] Already in progress");
      return;
    }

    // Wallet connected but no session — auto-login
    console.log("[Swarm:autoLogin] Triggering auto-login for", account.address);
    triggerLogin(account.address);
  }, [account, loading, authenticated, triggerLogin, logout]);

  return { signingIn, signError };
}
