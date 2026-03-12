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
import { debug } from "@/lib/debug";

export function useAutoSiwe() {
  const account = useActiveAccount();
  const { authenticated, loading, refresh, logout } = useSession();
  const [signingIn, setSigningIn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const signingRef = useRef(false);
  const lastAddressRef = useRef<string | null>(null);

  const triggerLogin = useCallback(
    async (address: string) => {
      debug.log("[Swarm:autoLogin] triggerLogin called for", address);
      if (signingRef.current) {
        debug.log("[Swarm:autoLogin] Already signing in, skipping");
        return;
      }
      signingRef.current = true;
      setSigningIn(true);
      setSignError(null);

      try {
        debug.log("[Swarm:autoLogin] POSTing to /api/auth/verify");
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ address }),
        });
        debug.log("[Swarm:autoLogin] Response status:", res.status);

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          debug.error("[Swarm:autoLogin] Verify failed:", err);
          throw new Error(err.error || "Login failed");
        }

        const data = await res.json();
        debug.log("[Swarm:autoLogin] ✅ Verify succeeded:", data);

        debug.log("[Swarm:autoLogin] 🔄 Refreshing session...");
        await refresh();
        debug.log("[Swarm:autoLogin] ✅ Session refreshed successfully");
        lastAddressRef.current = address.toLowerCase();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        debug.error("[Swarm:autoLogin] Error:", msg, err);
        setSignError(msg);
      } finally {
        signingRef.current = false;
        setSigningIn(false);
        debug.log("[Swarm:autoLogin] triggerLogin complete");
      }
    },
    [refresh]
  );

  useEffect(() => {
    debug.log("[Swarm:autoLogin] Effect fired —", {
      account: account?.address ?? null,
      loading,
      authenticated,
      signingRef: signingRef.current,
    });

    // Wait for session check to finish
    if (loading) {
      debug.log("[Swarm:autoLogin] Still loading, waiting...");
      return;
    }

    if (!account) {
      debug.log("[Swarm:autoLogin] No account connected");
      // Wallet disconnected — logout if we had a session
      if (lastAddressRef.current) {
        debug.log("[Swarm:autoLogin] Logging out due to wallet disconnect");
        lastAddressRef.current = null;
        logout();
      }
      return;
    }

    // Already authenticated with this address — nothing to do
    if (authenticated) {
      debug.log("[Swarm:autoLogin] Already authenticated");
      lastAddressRef.current = account.address.toLowerCase();
      return;
    }

    // Already in the middle of logging in — skip
    if (signingRef.current) {
      debug.log("[Swarm:autoLogin] Already in progress");
      return;
    }

    // Wallet connected but no session — auto-login
    debug.log("[Swarm:autoLogin] Triggering auto-login for", account.address);
    triggerLogin(account.address);
  }, [account, loading, authenticated, triggerLogin, logout]);

  return { signingIn, signError };
}
