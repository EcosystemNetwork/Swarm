/**
 * useThirdwebAuth — Shared auth config for all ConnectButton instances.
 *
 * Returns the `auth` prop object for thirdweb's ConnectButton.
 * Wires into our server endpoints:
 *   - getLoginPayload  → POST /api/auth/payload  (thirdweb SIWE payload)
 *   - doLogin          → POST /api/auth/verify    (verify signature, create session)
 *   - isLoggedIn       → GET  /api/auth/session   (check cookie session)
 *   - doLogout         → POST /api/auth/logout    (clear session)
 */
"use client";

import { useMemo } from "react";
import { useSession } from "@/contexts/SessionContext";

export function useThirdwebAuth() {
  const { refresh, logout } = useSession();

  return useMemo(() => ({
    getLoginPayload: async (params: { address: string; chainId?: number }) => {
      const res = await fetch("/api/auth/payload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: params.address, chainId: params.chainId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to get login payload" }));
        throw new Error(err.error || "Failed to get login payload");
      }
      return res.json();
    },
    doLogin: async (params: { payload: unknown; signature: string }) => {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payload: params.payload, signature: params.signature }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Login failed" }));
        console.error("[Swarm] Login failed:", err);
        throw new Error(err.error || "Login failed");
      }
      // Refresh session state so SessionContext picks up the new cookie.
      // Do NOT hard-redirect here — let ConnectButton finish its internal
      // state transition first. The landing page useEffect will handle
      // navigation once `authenticated` flips to true.
      await refresh();
    },
    isLoggedIn: async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        if (!res.ok) return false;
        const data = await res.json();
        return data.authenticated === true;
      } catch {
        return false;
      }
    },
    doLogout: async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
      await logout();
    },
  }), [refresh, logout]);
}
