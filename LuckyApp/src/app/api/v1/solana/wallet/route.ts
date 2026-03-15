/**
 * GET /api/v1/solana/wallet
 *
 * Returns the platform Solana wallet's public info from devnet:
 * public key, SOL balance, token account count, and stake account count.
 * All queries use public RPC calls — no private key is exposed.
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getPlatformPublicKey } from "@/lib/solana-keys";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const publicKey = getPlatformPublicKey();
    const connection = new Connection(rpcUrl, "confirmed");
    const pubkey = new PublicKey(publicKey);

    const [lamports, tokenAccounts, stakeAccounts] = await Promise.all([
      connection.getBalance(pubkey),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }),
      connection.getParsedProgramAccounts(
        new PublicKey("Stake11111111111111111111111111111111111111"),
        {
          filters: [
            { dataSize: 200 },
            { memcmp: { offset: 12, bytes: publicKey } },
          ],
        },
      ),
    ]);

    const solBalance = lamports / LAMPORTS_PER_SOL;
    const stakedLamports = stakeAccounts.reduce((sum, acc) => {
      return sum + (acc.account.lamports || 0);
    }, 0);

    return Response.json({
      publicKey,
      solBalance: Number(solBalance.toFixed(4)),
      tokenAccountCount: tokenAccounts.value.length,
      stakedSol: Number((stakedLamports / LAMPORTS_PER_SOL).toFixed(4)),
      cluster: rpcUrl.includes("devnet") ? "devnet" : rpcUrl.includes("testnet") ? "testnet" : "mainnet-beta",
    });
  } catch (err) {
    console.error("Solana wallet info error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch wallet info";
    return Response.json({ error: message }, { status: 500 });
  }
}
