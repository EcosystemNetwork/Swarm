/**
 * Wallet configuration for ConnectButton.
 *
 * - inAppWallet: social/email/passkey auth via redirect mode
 * - External wallets: MetaMask, Coinbase, Rainbow, Rabby
 *
 * The redirectUrl for social auth is derived from the current origin
 * (browser) or NEXT_PUBLIC_APP_DOMAIN env var (SSR fallback).
 */
"use client";

import { inAppWallet, createWallet } from "thirdweb/wallets";

const APP_ORIGIN = typeof window !== "undefined"
  ? window.location.origin
  : `https://${process.env.NEXT_PUBLIC_APP_DOMAIN || "swarmprotocol.fun"}`;

export const swarmWallets = [
  inAppWallet({
    auth: {
      mode: "redirect",
      redirectUrl: APP_ORIGIN,
      options: ["google", "email", "passkey"],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("io.rabby"),
];
