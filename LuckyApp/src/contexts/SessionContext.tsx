/**
 * SessionContext — React context for server-backed session state.
 *
 * Provides the frontend with durable session info (address, role, authenticated status)
 * fetched from the httpOnly cookie via /api/auth/session.
 *
 * This replaces reliance on `useActiveAccount()` as the sole source of truth.
 * The wallet connection is still used for signing transactions, but the *session*
 * is what determines auth state.
 */
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

export type UserRole = "operator" | "org_admin" | "platform_admin";

export interface Session {
  authenticated: boolean;
  address: string | null;
  role: UserRole | null;
  sessionId: string | null;
}

interface SessionContextValue extends Session {
  /** Whether the initial session check is still loading */
  loading: boolean;
  /** Re-fetch session from server */
  refresh: () => Promise<void>;
  /** Request a challenge nonce for a wallet address */
  requestChallenge: (address: string) => Promise<{ nonce: string; message: string }>;
  /** Sign and verify the challenge, creating a session */
  verifyChallenge: (
    address: string,
    signature: string,
    message: string
  ) => Promise<boolean>;
  /** Destroy the current session */
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  authenticated: false,
  address: null,
  role: null,
  sessionId: null,
  loading: true,
  refresh: async () => {},
  requestChallenge: async () => ({ nonce: "", message: "" }),
  verifyChallenge: async () => false,
  logout: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({
    authenticated: false,
    address: null,
    role: null,
    sessionId: null,
  });
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      if (!res.ok) {
        setSession({
          authenticated: false,
          address: null,
          role: null,
          sessionId: null,
        });
        return;
      }

      const data = await res.json();
      setSession({
        authenticated: data.authenticated ?? false,
        address: data.address ?? null,
        role: data.role ?? null,
        sessionId: data.sessionId ?? null,
      });
    } catch {
      setSession({
        authenticated: false,
        address: null,
        role: null,
        sessionId: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch session on mount
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchSession();
    }
  }, [fetchSession]);

  const requestChallenge = useCallback(
    async (address: string): Promise<{ nonce: string; message: string }> => {
      const res = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed to get challenge");
      }

      return res.json();
    },
    []
  );

  const verifyChallenge = useCallback(
    async (
      address: string,
      signature: string,
      message: string
    ): Promise<boolean> => {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ address, signature, message }),
      });

      const data = await res.json().catch(() => ({ error: "Unknown error" }));

      if (!res.ok) {
        console.error("[Swarm] /api/auth/verify failed:", res.status, data);
        throw new Error(data.error || `Verification failed (${res.status})`);
      }

      if (data.success) {
        // Refresh session state from server
        await fetchSession();
        return true;
      }

      return false;
    },
    [fetchSession]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setSession({
        authenticated: false,
        address: null,
        role: null,
        sessionId: null,
      });
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        ...session,
        loading,
        refresh: fetchSession,
        requestChallenge,
        verifyChallenge,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
