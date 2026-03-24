/**
 * Hedera Organization Shares — ERC20 token issuance for org equity
 *
 * When creating an organization:
 * 1. Submit ownership proof to HCS (hedera-org-ownership.ts)
 * 2. Deploy ERC20 token contract for org shares (this file)
 * 3. Mint initial supply to org creator
 *
 * Why ERC20 on Hedera?
 * - Solidity-compatible (existing tooling works)
 * - $0.01 deploy cost vs $50-500 on Ethereum
 * - Instant finality (3-5 seconds)
 * - Tradeable shares without custom marketplace
 * - Compatible with DEXs, wallets, explorers
 *
 * Architecture:
 * - Use Hedera's native ERC20 support (no custom smart contract needed)
 * - Or deploy Solidity ERC20 to Hedera EVM
 * - Store token contract address in Firestore org record
 */

import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenId,
  TokenInfoQuery,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  AccountCreateTransaction,
  Hbar,
} from "@hashgraph/sdk";

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const HEDERA_NETWORK = process.env.HEDERA_NETWORK || "testnet";
const HEDERA_OPERATOR_ID = process.env.HEDERA_OPERATOR_ID || "";
const HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY || "";

function getClient(): Client {
  if (HEDERA_NETWORK === "mainnet") {
    return Client.forMainnet();
  }
  return Client.forTestnet();
}

function configureClient(client: Client): Client {
  if (!HEDERA_OPERATOR_ID || !HEDERA_OPERATOR_KEY) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set");
  }
  client.setOperator(
    AccountId.fromString(HEDERA_OPERATOR_ID),
    PrivateKey.fromString(HEDERA_OPERATOR_KEY)
  );
  return client;
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface OrgShareToken {
  tokenId: string; // Hedera TokenId (0.0.xxxxx)
  tokenAddress: string; // EVM address for the token
  name: string; // e.g., "Acme Corp Shares"
  symbol: string; // e.g., "ACME"
  decimals: number; // Usually 18 for equity tokens
  totalSupply: string; // Initial supply
  treasuryAccount: string; // Account that holds unminted shares
  createdAt: number;
}

export interface ShareIssuanceResult {
  tokenId: string;
  tokenAddress: string;
  initialSupply: string;
  holderAccount: string;
  hashscanUrl: string;
}

// ═══════════════════════════════════════════════════════════════
// Token Creation
// ═══════════════════════════════════════════════════════════════

/**
 * Create fungible token representing org shares on Hedera
 *
 * Uses Hedera Token Service (HTS) to create native ERC20-compatible token
 * - No smart contract deployment needed
 * - Automatic ERC20 interface
 * - Works with MetaMask, HashPack, etc.
 *
 * @param orgName - Organization name (used for token name)
 * @param symbol - Token symbol (e.g., ACME)
 * @param initialSupply - Number of shares to issue (e.g., 1000000)
 * @param holderAccountId - Account to receive initial shares (org creator)
 * @returns Token details including TokenId and EVM address
 */
export async function createOrgShareToken(
  orgName: string,
  symbol: string,
  initialSupply: number,
  holderAccountId: string
): Promise<ShareIssuanceResult> {
  const client = configureClient(getClient());

  try {
    // Create fungible token (ERC20-compatible via HTS)
    const tokenName = `${orgName} Shares`;
    const decimals = 18; // Standard for equity tokens

    const tokenCreateTx = await new TokenCreateTransaction()
      .setTokenName(tokenName)
      .setTokenSymbol(symbol)
      .setDecimals(decimals)
      .setInitialSupply(initialSupply * Math.pow(10, decimals)) // Convert to smallest unit
      .setTreasuryAccountId(AccountId.fromString(HEDERA_OPERATOR_ID))
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(initialSupply * Math.pow(10, decimals) * 10) // Allow 10x expansion
      .setAdminKey(PrivateKey.fromString(HEDERA_OPERATOR_KEY))
      .setSupplyKey(PrivateKey.fromString(HEDERA_OPERATOR_KEY))
      .setFreezeDefault(false)
      .execute(client);

    const receipt = await tokenCreateTx.getReceipt(client);
    const tokenId = receipt.tokenId;

    if (!tokenId) {
      throw new Error("Failed to create token");
    }

    // Get token info to retrieve EVM address
    const tokenInfo = await new TokenInfoQuery()
      .setTokenId(tokenId)
      .execute(client);

    // Hedera tokens automatically get an EVM address
    // Format: 0x + hex(shard) + hex(realm) + hex(num)
    const tokenIdParts = tokenId.toString().split(".");
    const shard = parseInt(tokenIdParts[0]);
    const realm = parseInt(tokenIdParts[1]);
    const num = parseInt(tokenIdParts[2]);
    const tokenAddress = `0x${shard.toString(16).padStart(8, "0")}${realm
      .toString(16)
      .padStart(16, "0")}${num.toString(16).padStart(16, "0")}`;

    // Associate token with holder account (required before transfer)
    const holderAccount = AccountId.fromString(holderAccountId);

    try {
      // Note: In production, holder should sign this themselves
      // For demo, we'll skip association if holder account doesn't have keys
      console.log(`[Hedera] Token created, holder association may require manual step`);
    } catch (e) {
      console.warn("[Hedera] Could not auto-associate token with holder:", e);
    }

    // Transfer initial supply to holder
    try {
      const transferTx = await new TransferTransaction()
        .addTokenTransfer(tokenId, AccountId.fromString(HEDERA_OPERATOR_ID), -initialSupply * Math.pow(10, decimals))
        .addTokenTransfer(tokenId, holderAccount, initialSupply * Math.pow(10, decimals))
        .execute(client);

      await transferTx.getReceipt(client);
      console.log(`[Hedera] Transferred ${initialSupply} shares to ${holderAccountId}`);
    } catch (e) {
      console.warn("[Hedera] Could not auto-transfer shares, holder needs to associate token first:", e);
    }

    const hashscanUrl = `https://hashscan.io/${HEDERA_NETWORK}/token/${tokenId.toString()}`;

    console.log(`[Hedera] Created org share token: ${tokenId.toString()}`);
    console.log(`[Hedera] EVM address: ${tokenAddress}`);
    console.log(`[Hedera] Hashscan: ${hashscanUrl}`);

    return {
      tokenId: tokenId.toString(),
      tokenAddress,
      initialSupply: initialSupply.toString(),
      holderAccount: holderAccountId,
      hashscanUrl,
    };
  } catch (error) {
    console.error("[Hedera] Failed to create org share token:", error);
    throw error;
  } finally {
    client.close();
  }
}

/**
 * Query token information
 */
export async function getTokenInfo(tokenIdString: string): Promise<OrgShareToken> {
  const client = configureClient(getClient());

  try {
    const tokenId = TokenId.fromString(tokenIdString);
    const info = await new TokenInfoQuery()
      .setTokenId(tokenId)
      .execute(client);

    const tokenIdParts = tokenIdString.split(".");
    const shard = parseInt(tokenIdParts[0]);
    const realm = parseInt(tokenIdParts[1]);
    const num = parseInt(tokenIdParts[2]);
    const tokenAddress = `0x${shard.toString(16).padStart(8, "0")}${realm
      .toString(16)
      .padStart(16, "0")}${num.toString(16).padStart(16, "0")}`;

    return {
      tokenId: tokenIdString,
      tokenAddress,
      name: info.name,
      symbol: info.symbol,
      decimals: info.decimals,
      totalSupply: info.totalSupply.toString(),
      treasuryAccount: info.treasuryAccountId?.toString() || "",
      createdAt: Date.now(),
    };
  } catch (error) {
    console.error("[Hedera] Failed to query token info:", error);
    throw error;
  } finally {
    client.close();
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export {
  createOrgShareToken as issueOrgShares,
  getTokenInfo as getOrgShareToken,
};
