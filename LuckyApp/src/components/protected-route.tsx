'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';
import { useOrg } from '@/contexts/OrgContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const isConnected = !!account;
  const { organizations, loading } = useOrg();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // First check: wallet connection
    if (!isConnected) {
      router.push('/');
      return;
    }

    // Second check: organizations (only after loading is complete)
    if (!loading && isConnected) {
      // If user has no orgs and is not already on onboarding page, redirect
      if (organizations.length === 0 && pathname !== '/onboarding') {
        router.push('/onboarding');
      }
      // If user has orgs and is on onboarding page, redirect to dashboard
      else if (organizations.length > 0 && pathname === '/onboarding') {
        router.push('/dashboard');
      }
    }
  }, [isConnected, organizations.length, loading, router, pathname]);

  // Show nothing while loading or if not connected
  if (!isConnected || loading) {
    return null;
  }

  // If no orgs and not on onboarding page, show nothing (will redirect)
  if (organizations.length === 0 && pathname !== '/onboarding') {
    return null;
  }

  return <>{children}</>;
}
