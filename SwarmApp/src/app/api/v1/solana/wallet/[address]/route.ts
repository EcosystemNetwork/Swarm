/**
 * GET /api/v1/solana/wallet/[address]
 *
 * Returns wallet info for any Solana address (agent wallet or other):
 * public key, SOL balance, token accounts with balances, and stake accounts.
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return Response.json({ error: "Address parameter required" }, { status: 400 });
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(address);
    } catch {
      return Response.json({ error: "Invalid Solana address" }, { status: 400 });
    }

    const [lamports, tokenAccountsResponse, stakeAccounts] = await Promise.all([
      connection.getBalance(pubkey),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }),
      connection.getParsedProgramAccounts(
        new PublicKey("Stake11111111111111111111111111111111111111"),
        {
          filters: [
            { dataSize: 200 },
            { memcmp: { offset: 12, bytes: address } },
          ],
        },
      ),
    ]);

    const solBalance = lamports / LAMPORTS_PER_SOL;
    const stakedLamports = stakeAccounts.reduce((sum, acc) => {
      return sum + (acc.account.lamports || 0);
    }, 0);

    // Parse token accounts
    const tokenAccounts = tokenAccountsResponse.value.map(acc => {
      const parsed = acc.account.data.parsed?.info;
      return {
        mint: parsed?.mint || "unknown",
        balance: parsed?.tokenAmount?.uiAmountString || "0",
        decimals: parsed?.tokenAmount?.decimals || 0,
        uiAmount: parsed?.tokenAmount?.uiAmount || 0,
      };
    });

    return Response.json({
      publicKey: address,
      solBalance: Number(solBalance.toFixed(4)),
      tokenAccounts,
      tokenAccountCount: tokenAccounts.length,
      stakedSol: Number((stakedLamports / LAMPORTS_PER_SOL).toFixed(4)),
      cluster: rpcUrl.includes("devnet") ? "devnet" : rpcUrl.includes("testnet") ? "testnet" : "mainnet-beta",
    });
  } catch (err) {
    console.error("Solana wallet lookup error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch wallet info";
    return Response.json({ error: message }, { status: 500 });
  }
}
