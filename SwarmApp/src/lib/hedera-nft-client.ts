/**
 * Hedera NFT Client — Query agent reputation from SwarmAgentIdentityNFT
 *
 * Provides helper functions to:
 * - Check if agent has NFT
 * - Get credit score + trust score from NFT
 * - Get reputation tier
 */

import { ethers } from "ethers";
import { CONTRACTS, AGENT_IDENTITY_NFT_ABI } from "./swarm-contracts";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface AgentNFTIdentity {
    hasNFT: boolean;
    tokenId?: string;
    asn?: string;
    creditScore?: number;
    trustScore?: number;
    registeredAt?: Date;
    lastUpdated?: Date;
    tier?: "Bronze" | "Silver" | "Gold" | "Platinum";
}

// ═══════════════════════════════════════════════════════════════
// Client Setup
// ═══════════════════════════════════════════════════════════════

/** Get Hedera testnet JSON-RPC provider */
function getHederaProvider(): ethers.JsonRpcProvider {
    const rpcUrl = process.env.NEXT_PUBLIC_HEDERA_RPC_URL || "https://testnet.hashio.io/api";
    return new ethers.JsonRpcProvider(rpcUrl);
}

/** Get read-only NFT contract instance */
function getNFTContract(): ethers.Contract {
    const provider = getHederaProvider();
    return new ethers.Contract(
        CONTRACTS.AGENT_IDENTITY_NFT,
        AGENT_IDENTITY_NFT_ABI,
        provider
    );
}

// ═══════════════════════════════════════════════════════════════
// Query Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check if agent has an identity NFT
 */
export async function hasAgentNFT(agentAddress: string): Promise<boolean> {
    try {
        const contract = getNFTContract();
        const hasNFT = await contract.hasNFT(agentAddress);
        return hasNFT;
    } catch (error) {
        console.error("Error checking agent NFT:", error);
        return false;
    }
}

/**
 * Get full agent identity from NFT
 */
export async function getAgentNFTIdentity(agentAddress: string): Promise<AgentNFTIdentity> {
    try {
        const contract = getNFTContract();

        // Check if agent has NFT
        const hasNFT = await contract.hasNFT(agentAddress);
        if (!hasNFT) {
            return { hasNFT: false };
        }

        // Get token ID
        const tokenId = await contract.getTokenId(agentAddress);

        // Get identity data
        const identity = await contract.getAgentIdentity(tokenId);
        const [asn, creditScore, trustScore, registeredAt, lastUpdated] = identity;

        // Get reputation tier
        const tier = await contract.getReputationTier(tokenId);

        return {
            hasNFT: true,
            tokenId: tokenId.toString(),
            asn,
            creditScore: Number(creditScore),
            trustScore: Number(trustScore),
            registeredAt: new Date(Number(registeredAt) * 1000),
            lastUpdated: new Date(Number(lastUpdated) * 1000),
            tier: tier as "Bronze" | "Silver" | "Gold" | "Platinum",
        };
    } catch (error) {
        console.error("Error getting agent NFT identity:", error);
        return { hasNFT: false };
    }
}

/**
 * Get agent credit score by ASN
 * (looks up agent address by ASN, then queries NFT)
 */
export async function getCreditScoreByASN(asn: string): Promise<{ creditScore: number; trustScore: number } | null> {
    try {
        // TODO: Look up agent address by ASN from Firestore
        // For now, this is a placeholder - in production, we'd query
        // the asnMemoryBackups collection to find the wallet address

        return null; // Will be implemented when agent address lookup is available
    } catch (error) {
        console.error("Error getting credit score by ASN:", error);
        return null;
    }
}

/**
 * Calculate reputation tier from credit score
 */
export function getReputationTier(creditScore: number): "Bronze" | "Silver" | "Gold" | "Platinum" {
    if (creditScore >= 850) return "Platinum";
    if (creditScore >= 700) return "Gold";
    if (creditScore >= 550) return "Silver";
    return "Bronze";
}
