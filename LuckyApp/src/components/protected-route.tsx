'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';
import { useOrg } from '@/contexts/OrgContext';

// Grace period (ms) after mount before allowing auth redirects.
// Gives the global AutoConnect component time to restore the wallet session
// on page refresh / HMR remount, preventing premature logout.
const AUTH_GRACE_MS = 3000;

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
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

  // If wallet connects during grace period, we can end it early
  useEffect(() => {
    if (isConnected && !graceOver) {
      setGraceOver(true);
    }
  }, [isConnected, graceOver]);

  useEffect(() => {
    // Don't redirect during the grace period
    if (!graceOver) return;

    // First check: wallet connection
    if (!isConnected) {
      router.push('/');
      return;
    }

    // Second check: organizations (only after loading is complete)
    if (!loading && isConnected) {
      if (organizations.length === 0 && pathname !== '/onboarding') {
        router.push('/onboarding');
      } else if (organizations.length > 0 && pathname === '/onboarding') {
        router.push('/dashboard');
      }
    }
  }, [isConnected, organizations.length, loading, router, pathname, graceOver]);

  // Show nothing while grace period is active, not connected, or loading orgs
  if (!graceOver || !isConnected || loading) {
    return null;
  }

  // If no orgs and not on onboarding page, show nothing (will redirect)
  if (organizations.length === 0 && pathname !== '/onboarding') {
    return null;
  }

  return <>{children}</>;
}


