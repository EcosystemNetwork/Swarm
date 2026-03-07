/** Protected Route — HOC that redirects to landing page if no wallet is connected. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useActiveAccount, useActiveWalletConnectionStatus } from 'thirdweb/react';
import { useOrg } from '@/contexts/OrgContext';

// Minimum grace period (ms) after mount before allowing redirects.
// Acts as a safety net in case connectionStatus hasn't settled yet.
const AUTH_GRACE_MS = 3_000;

// Extra delay before redirecting to onboarding.
// Must be long enough for OrgContext's disconnect grace (6s) to settle so
// we never redirect while orgs are still being re-fetched after reconnection.
const ONBOARDING_REDIRECT_DELAY = 2_000;

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const connectionStatus = useActiveWalletConnectionStatus();
  const isConnected = !!account;
  const { organizations, loading } = useOrg();
  const router = useRouter();
  const pathname = usePathname();

  // Track whether we've ever seen orgs so we don't flash to onboarding on transient drops
  const hadOrgs = useRef(false);
  if (organizations.length > 0) hadOrgs.current = true;

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
      // If we previously had orgs, give extra time — wallet may be transiently dropped
      if (hadOrgs.current) {
        const timer = setTimeout(() => {
          // Re-check at fire time — wallet may have reconnected by now
          // (we can't read hooks here, so rely on cleanup cancelling this)
          router.push('/');
        }, ONBOARDING_REDIRECT_DELAY);
        return () => clearTimeout(timer);
      }
      router.push('/');
      return;
    }

    // Organization checks (only after loading is complete)
    if (!loading && isConnected) {
      if (organizations.length === 0 && pathname !== '/onboarding') {
        // Longer delay for org check — OrgContext may still be in its disconnect grace
        const timer = setTimeout(() => router.push('/onboarding'), ONBOARDING_REDIRECT_DELAY);
        return () => clearTimeout(timer);
      } else if (organizations.length > 0 && pathname === '/onboarding') {
        const timer = setTimeout(() => router.push('/dashboard'), 750);
        return () => clearTimeout(timer);
      }
    }
  }, [isConnected, organizations.length, loading, router, pathname, graceOver, isReconnecting]);

  // Show nothing while grace period is active, reconnecting, or not connected
  if (!graceOver || isReconnecting || !isConnected) {
    return null;
  }

  // Wallet is connected but orgs are still loading — show a loading indicator
  // instead of a blank page (which makes users think they need to login again)
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If no orgs and not on onboarding page, show nothing (will redirect)
  if (organizations.length === 0 && pathname !== '/onboarding') {
    return null;
  }

  return <>{children}</>;
}
