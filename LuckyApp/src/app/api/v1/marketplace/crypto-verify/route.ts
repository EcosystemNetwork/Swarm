/**
 * POST /api/v1/marketplace/crypto-verify
 *
 * Verifies an on-chain transaction for a crypto payment intent.
 * If verified, activates the subscription.
 *
 * Input: { paymentId, txHash }
 * Returns: { ok, verified, subscriptionId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToItem, type SubscriptionPlan } from "@/lib/skills";

const CRYPTO_PAYMENTS_COLLECTION = "cryptoPayments";

/** Verify a Hedera transaction via Mirror Node REST API */
async function verifyHederaTx(
  txHash: string,
  expectedRecipient: string,
  expectedAmount: number,
): Promise<{ verified: boolean; error?: string }> {
  try {
    const mirrorUrl = process.env.HEDERA_MIRROR_URL || "https://testnet.mirrornode.hedera.com";
    const res = await fetch(`${mirrorUrl}/api/v1/transactions/${txHash}`);
    if (!res.ok) return { verified: false, error: "Transaction not found on Hedera" };

    const data = await res.json();
    const tx = data.transactions?.[0];
    if (!tx) return { verified: false, error: "Transaction not found" };

    if (tx.result !== "SUCCESS") {
      return { verified: false, error: `Transaction status: ${tx.result}` };
    }

    // Check transfers include the expected recipient
    const transfers = tx.transfers || [];
    const recipientTransfer = transfers.find(
      (t: { account: string; amount: number }) =>
        t.account === expectedRecipient && t.amount > 0,
    );

    if (!recipientTransfer) {
      return { verified: false, error: "Recipient not found in transaction transfers" };
    }

    // Convert tinybars to HBAR for amount check (1 HBAR = 100_000_000 tinybars)
    const receivedHbar = recipientTransfer.amount / 100_000_000;
    if (receivedHbar < expectedAmount * 0.95) {
      return { verified: false, error: `Insufficient amount: expected ${expectedAmount} HBAR, got ${receivedHbar}` };
    }

    return { verified: true };
  } catch (err) {
    return { verified: false, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

/** Verify a Solana transaction via RPC */
async function verifySolanaTx(
  txHash: string,
  expectedRecipient: string,
  expectedAmount: number,
): Promise<{ verified: boolean; error?: string }> {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [txHash, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    });

    const data = await res.json();
    const tx = data.result;
    if (!tx) return { verified: false, error: "Transaction not found on Solana" };

    if (tx.meta?.err) {
      return { verified: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
    }

    // Check post-balances for recipient
    const accountKeys = tx.transaction?.message?.accountKeys || [];
    const recipientIdx = accountKeys.findIndex(
      (k: { pubkey: string } | string) =>
        (typeof k === "string" ? k : k.pubkey) === expectedRecipient,
    );

    if (recipientIdx === -1) {
      return { verified: false, error: "Recipient not found in transaction" };
    }

    // Check lamport delta (1 SOL = 1_000_000_000 lamports)
    const preBalance = tx.meta.preBalances[recipientIdx] || 0;
    const postBalance = tx.meta.postBalances[recipientIdx] || 0;
    const receivedSol = (postBalance - preBalance) / 1_000_000_000;

    if (receivedSol < expectedAmount * 0.95) {
      return { verified: false, error: `Insufficient amount: expected ${expectedAmount} SOL, got ${receivedSol}` };
    }

    return { verified: true };
  } catch (err) {
    return { verified: false, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

export async function POST(req: NextRequest) {
  const wallet = req.headers.get("x-wallet-address")?.toLowerCase();
  if (!wallet) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const { paymentId, txHash } = body as { paymentId: string; txHash: string };

  if (!paymentId || !txHash) {
    return NextResponse.json({ error: "Missing paymentId or txHash" }, { status: 400 });
  }

  // Fetch payment intent
  const paymentRef = doc(db, CRYPTO_PAYMENTS_COLLECTION, paymentId);
  const paymentSnap = await getDoc(paymentRef);

  if (!paymentSnap.exists()) {
    return NextResponse.json({ error: "Payment intent not found" }, { status: 404 });
  }

  const payment = paymentSnap.data();

  if (payment.status === "verified") {
    return NextResponse.json({ ok: true, verified: true, alreadyVerified: true });
  }

  if (payment.status !== "pending") {
    return NextResponse.json({ error: `Payment is ${payment.status}` }, { status: 400 });
  }

  // Check expiry
  const expiresAt = payment.expiresAt instanceof Timestamp
    ? payment.expiresAt.toDate()
    : new Date(payment.expiresAt);
  if (expiresAt < new Date()) {
    await updateDoc(paymentRef, { status: "expired" });
    return NextResponse.json({ error: "Payment intent expired" }, { status: 410 });
  }

  // Verify on-chain
  const verifyFn = payment.chain === "hedera" ? verifyHederaTx : verifySolanaTx;
  const result = await verifyFn(txHash, payment.recipientAddress, payment.amount);

  if (!result.verified) {
    return NextResponse.json({
      ok: false,
      verified: false,
      error: result.error || "Transaction verification failed",
    }, { status: 400 });
  }

  // Activate subscription
  try {
    await subscribeToItem(
      payment.orgId,
      payment.modId,
      payment.plan as SubscriptionPlan,
      payment.wallet,
    );

    await updateDoc(paymentRef, {
      status: "verified",
      txHash,
      verifiedAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true, verified: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to activate subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
