'use client';
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

export function Web3ProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider>
      <AutoConnect client={client} wallets={wallets} timeout={15000} />
      {children}
    </ThirdwebProvider>
  );
}

