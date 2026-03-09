/** Dynamic Inner — Internal component loaded by the dynamic wrapper after code splitting. */
'use client';
import { useEffect } from 'react';
import { ThirdwebProvider, AutoConnect } from 'thirdweb/react';
import { createThirdwebClient } from 'thirdweb';
import { createWallet, inAppWallet } from 'thirdweb/wallets';
import { installFetchInterceptor } from './fetch-interceptor';

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || '510999ec2be00a99e36ab07b36f15a72',
});

// Wallets used in the app — must match what ConnectButton offers
// so AutoConnect can find and reconnect the last-used wallet.
const wallets = [
  inAppWallet(),
  createWallet('io.metamask'),
  createWallet('com.coinbase.wallet'),
  createWallet('me.rainbow'),
  createWallet('io.rabby'),
  createWallet('app.phantom'),
];

/** Known non-fatal thirdweb auto-connect errors — log them instead of crashing */
const SUPPRESSED_PATTERNS = [
  'connect() before enable()',
  'Cannot set a wallet without an account as active',
];

export function Web3ProviderInner({ children }: { children: React.ReactNode }) {
  // Install circuit-breaker fetch interceptor for unreliable thirdweb APIs.
  // Replaces the old fake-200 pattern with retry/backoff + circuit breaker +
  // observable degraded state. See fetch-interceptor.ts for details.
  useEffect(() => {
    installFetchInterceptor();
  }, []);

  // Catch known thirdweb SDK auto-connect errors that fire during
  // wallet reconnection when the previous session is stale.
  // Log them visibly so they can be debugged, but prevent them from crashing the app.
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message || e.reason || '');
      if (SUPPRESSED_PATTERNS.some((p) => msg.includes(p))) {
        console.warn('[Swarm] AutoConnect issue (non-fatal):', msg);
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return (
    <ThirdwebProvider>
      <AutoConnect client={client} wallets={wallets} timeout={15_000} />
      {children}
    </ThirdwebProvider>
  );
}
