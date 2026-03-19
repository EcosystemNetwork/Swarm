/**
 * useAutoSiwe — Auto-trigger SIWE login when a wallet connects.
 *
 * Watches `useActiveAccount()` for wallet connections. When a wallet
 * connects and the user is NOT yet authenticated (no server session),
 * this hook automatically:
 *   1. POST /api/auth/payload  → get SIWE login payload
 *   2. Sign payload with wallet
 *   3. POST /api/auth/verify   → verify signature, create session
 *   4. Refresh SessionContext
 *
 * Guards:
 *   - Waits for session loading to complete
 *   - Skips if already authenticated
 *   - Prevents duplicate concurrent logins via signingRef
 *   - Detects wallet changes via lastAddressRef
 */
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { signLoginPayload } from "thirdweb/auth";
import { useSession } from "@/contexts/SessionContext";
import { thirdwebClient } from "@/lib/thirdweb-client";
import { debug } from "@/lib/debug";

export function useAutoSiwe() {
  const account = useActiveAccount();
  const { authenticated, loading, refresh, logout } = useSession();
  const signingRef = useRef(false);
  const lastAddressRef = useRef<string | null>(null);

  const triggerLogin = useCallback(
    async (activeAccount: NonNullable<typeof account>) => {
      if (signingRef.current) {
        debug.log("[Swarm:autoLogin] Already signing, skipping");
        return;
      }

      signingRef.current = true;
      const address = activeAccount.address;
      debug.log("[Swarm:autoLogin] Triggering auto-login for", address);

      try {
        // 1. Get SIWE login payload from server
        const payloadRes = await fetch("/api/auth/payload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });

        if (!payloadRes.ok) {
          const err = await payloadRes.json().catch(() => ({}));
          throw new Error(err.error || `Payload request failed: ${payloadRes.status}`);
        }

        const loginPayload = await payloadRes.json();
        debug.log("[Swarm:autoLogin] Got login payload");

        // 2. Sign the SIWE payload with the connected wallet
        const { signature, payload } = await signLoginPayload({
          account: activeAccount,
          payload: loginPayload,
        });
        debug.log("[Swarm:autoLogin] Payload signed");

        // 3. Verify signature and create session
        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payload, signature }),
        });

        if (!verifyRes.ok) {
          const err = await verifyRes.json().catch(() => ({}));
          throw new Error(err.error || `Verify request failed: ${verifyRes.status}`);
        }

        debug.log("[Swarm:autoLogin] Session created, refreshing context");

        // 4. Refresh session context to pick up the new cookie
        await refresh();
      } catch (err) {
        debug.error("[Swarm:autoLogin] Login failed:", err);
      } finally {
        signingRef.current = false;
      }
    },
    [refresh]
  );

  useEffect(() => {
    debug.log("[Swarm:autoLogin] Effect fired —", {
      hasAccount: !!account,
      address: account?.address?.slice(0, 10),
      loading,
      authenticated,
      signing: signingRef.current,
    });

    // Wait for session check to complete
    if (loading) return;

    // Wallet disconnected → log out if we were authenticated
    if (!account) {
      if (lastAddressRef.current && authenticated) {
        debug.log("[Swarm:autoLogin] Wallet disconnected, logging out");
        lastAddressRef.current = null;
        logout();
      }
      return;
    }

    // Wallet changed → update tracking
    const currentAddress = account.address.toLowerCase();
    if (lastAddressRef.current && lastAddressRef.current !== currentAddress) {
      debug.log("[Swarm:autoLogin] Wallet changed from", lastAddressRef.current, "to", currentAddress);
      // If authenticated with a different wallet, logout first
      if (authenticated) {
        lastAddressRef.current = currentAddress;
        logout();
        return;
      }
    }
    lastAddressRef.current = currentAddress;

    // Already authenticated → nothing to do
    if (authenticated) return;

    // Already signing → skip
    if (signingRef.current) return;

    // Trigger SIWE login
    triggerLogin(account);
  }, [account, loading, authenticated, triggerLogin, logout]);
}
