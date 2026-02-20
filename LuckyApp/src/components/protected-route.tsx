'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { primaryWallet, sdkHasLoaded } = useDynamicContext();
  const router = useRouter();

  useEffect(() => {
    if (sdkHasLoaded && !primaryWallet) {
      router.push('/');
    }
  }, [sdkHasLoaded, primaryWallet, router]);

  if (!sdkHasLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!primaryWallet) {
    return null;
  }

  return <>{children}</>;
}
