/** Protected Route — HOC that redirects to landing page if no wallet is connected. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useActiveAccount, useActiveWalletConnectionStatus } from 'thirdweb/react';
import { useOrg } from '@/contexts/OrgContext';

// Minimum grace period (ms) after mount before allowing redirects.
// Acts as a safety net in case connectionStatus hasn't settled yet.
const AUTH_GRACE_MS = 3000;

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const connectionStatus = useActiveWalletConnectionStatus();
  const isConnected = !!account;
  const { organizations, loading } = useOrg();
  const router = useRouter();
  const pathname = usePathname();

  // --- Grace period: don't redirect until AUTH_GRACE_MS after mount ---
  const mountTime = useRef(Date.now());
  const [graceOver, setGraceOver] = useState(false);

  useEffect(() => {
    const remaining = AUTH_GRACE_MS - (Date.now() - mountTime.current);
    if (remaining <= 0) {
      setGraceOver(true);
      return;
    }
    const timer = setTimeout(() => setGraceOver(true), remaining);
    return () => clearTimeout(timer);
  }, []);

  // If wallet connects during grace period, end it early
  useEffect(() => {
    if (isConnected && !graceOver) {
      setGraceOver(true);
    }
  }, [isConnected, graceOver]);

  // Wallet is still being reconnected — don't redirect
  const isReconnecting = connectionStatus === 'connecting' || connectionStatus === 'unknown';

  useEffect(() => {
    // Don't redirect during the grace period or while AutoConnect is reconnecting
    if (!graceOver || isReconnecting) return;

    // Wallet is definitively disconnected
    if (!isConnected) {
      router.push('/');
      return;
    }

    // Organization checks (only after loading is complete)
    if (!loading && isConnected) {
      if (organizations.length === 0 && pathname !== '/onboarding') {
        const timer = setTimeout(() => router.push('/onboarding'), 750);
        return () => clearTimeout(timer);
      } else if (organizations.length > 0 && pathname === '/onboarding') {
        const timer = setTimeout(() => router.push('/dashboard'), 750);
        return () => clearTimeout(timer);
      }
    }
  }, [isConnected, organizations.length, loading, router, pathname, graceOver, isReconnecting]);

  // Show nothing while grace period is active, reconnecting, not connected, or loading orgs
  if (!graceOver || isReconnecting || !isConnected || loading) {
    return null;
  }

  // If no orgs and not on onboarding page, show nothing (will redirect)
  if (organizations.length === 0 && pathname !== '/onboarding') {
    return null;
  }

  return <>{children}</>;
}
