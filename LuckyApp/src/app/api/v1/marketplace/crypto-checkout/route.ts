/**
 * POST /api/v1/marketplace/crypto-checkout
 *
 * Creates a crypto payment intent for mod subscriptions.
 * Returns a payment ID, recipient address, and amount for the user to pay on-chain.
 *
 * Input: { modId, plan, orgId, chain: "hedera" | "solana" }
 * Returns: { ok, paymentId, recipientAddress, amount, currency, expiresAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SKILL_REGISTRY, type SubscriptionPlan } from "@/lib/skills";
import { getModService } from "@/lib/mod-gateway/registry";

const CRYPTO_PAYMENTS_COLLECTION = "cryptoPayments";

// Platform wallet addresses for receiving payments
const RECIPIENT_ADDRESSES: Record<string, string> = {
  hedera: process.env.HEDERA_TREASURY_ADDRESS || "0.0.0000000",
  solana: process.env.SOLANA_TREASURY_ADDRESS || "11111111111111111111111111111111",
};

// Price multipliers for crypto (relative to USD pricing tiers)
const CRYPTO_CURRENCIES: Record<string, string> = {
  hedera: "HBAR",
  solana: "SOL",
};

export async function POST(req: NextRequest) {
  const wallet = req.headers.get("x-wallet-address")?.toLowerCase();
  if (!wallet) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const { modId, plan, orgId, chain } = body as {
    modId: string;
    plan: SubscriptionPlan;
    orgId: string;
    chain: "hedera" | "solana";
  };

  if (!modId || !plan || !orgId || !chain) {
    return NextResponse.json({ error: "Missing modId, plan, orgId, or chain" }, { status: 400 });
  }

  if (!["hedera", "solana"].includes(chain)) {
    return NextResponse.json({ error: "Invalid chain. Must be hedera or solana" }, { status: 400 });
  }

  // Look up pricing
  const staticMod = SKILL_REGISTRY.find((s) => s.id === modId);
  const remoteMod = !staticMod ? await getModService(modId) : null;
  const pricing = staticMod?.pricing || remoteMod?.pricing;

  if (!pricing || pricing.model === "free") {
    return NextResponse.json({ error: "This mod is free" }, { status: 400 });
  }

  const tier = pricing.tiers?.find((t) => t.plan === plan);
  if (!tier) {
    return NextResponse.json({ error: `Plan "${plan}" not available` }, { status: 400 });
  }

  const recipientAddress = RECIPIENT_ADDRESSES[chain];
  if (!recipientAddress || recipientAddress === "0.0.0000000" || recipientAddress === "11111111111111111111111111111111") {
    return NextResponse.json({ error: `${chain} treasury address not configured` }, { status: 503 });
  }

  const currency = CRYPTO_CURRENCIES[chain];
  // For now, use the USD price directly — in production, convert via oracle
  const amount = tier.price;

  // Create payment intent in Firestore
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min expiry

  try {
    const ref = await addDoc(collection(db, CRYPTO_PAYMENTS_COLLECTION), {
      modId,
      plan,
      orgId,
      chain,
      wallet,
      recipientAddress,
      amount,
      currency,
      status: "pending",
      expiresAt,
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      paymentId: ref.id,
      recipientAddress,
      amount,
      currency,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment intent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
