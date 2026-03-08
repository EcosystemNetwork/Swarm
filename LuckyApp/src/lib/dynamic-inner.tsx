/** Dynamic Inner — Internal component loaded by the dynamic wrapper after code splitting. */
'use client';
import { useEffect } from 'react';
import { ThirdwebProvider, AutoConnect } from 'thirdweb/react';
import { createThirdwebClient } from 'thirdweb';
import { createWallet, inAppWallet } from 'thirdweb/wallets';

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || 'cbd8abcfa13db759ca2f5fa7d8a5a5e5',
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

/**
 * Domains whose fetch errors we intercept to prevent infinite React Query
 * retry loops inside the thirdweb SDK. When social.thirdweb.com returns 500,
 * the ConnectButton's internal React Query retries endlessly, causing a
 * cascading render loop that crashes the React tree and logs the user out.
 */
const INTERCEPTED_DOMAINS = [
  'social.thirdweb.com',
];

let fetchPatched = false;

function patchFetch() {
  if (fetchPatched || typeof window === 'undefined') return;
  fetchPatched = true;

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Check if this request targets an intercepted domain
    const isIntercepted = INTERCEPTED_DOMAINS.some(d => url.includes(d));

    if (isIntercepted) {
      try {
        const response = await originalFetch.call(this, input, init);
        if (!response.ok) {
          // Return a fake 200 with empty data to prevent infinite retries
          console.warn(`[Swarm] Intercepted failing request to ${new URL(url).hostname} (${response.status})`);
          return new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return response;
      } catch {
        // Network error — return empty 200 to prevent crash
        console.warn(`[Swarm] Intercepted network error for ${url}`);
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return originalFetch.call(this, input, init);
  };
}

export function Web3ProviderInner({ children }: { children: React.ReactNode }) {
  // Patch fetch ONCE to intercept failing thirdweb social API calls
  // that cause infinite React Query retry loops.
  useEffect(() => {
    patchFetch();
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
