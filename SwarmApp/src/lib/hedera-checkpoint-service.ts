/**
 * Hedera Checkpoint Service
 *
 * Periodically writes computed scores from the HCS event stream to the on-chain NFT contract.
 * This creates an auditable canonical state while keeping real-time scores fast and off-chain.
 *
 * Architecture:
 * - Runs every 1 hour (configurable)
 * - Reads current scores from mirror node subscriber cache
 * - Writes to SwarmAgentIdentityNFT contract via updateAgentScore()
 * - Emits checkpoint event back to HCS for audit trail
 */

import { ethers } from "ethers";
import { getAllScoreStates } from "./hedera-mirror-subscriber";
import { createCheckpointEvent, submitScoreEvent } from "./hedera-hcs-client";
import { CONTRACTS, AGENT_IDENTITY_NFT_ABI } from "./swarm-contracts";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CheckpointResult {
    asn: string;
    agentAddress: string;
    creditScore: number;
    trustScore: number;
    txHash: string;
    hcsTxId: string;
}

// ═══════════════════════════════════════════════════════════════
// Checkpoint Logic
// ═══════════════════════════════════════════════════════════════

const HEDERA_TESTNET_RPC = "https://testnet.hashio.io/api";
const CHECKPOINT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Write a single agent's score to the on-chain NFT contract.
 */
async function checkpointAgentScore(
    asn: string,
    agentAddress: string,
    creditScore: number,
    trustScore: number,
): Promise<string> {
    const privateKey = process.env.HEDERA_PLATFORM_KEY;
    if (!privateKey) {
        throw new Error("HEDERA_PLATFORM_KEY not set - cannot write checkpoint");
    }

    const provider = new ethers.JsonRpcProvider(HEDERA_TESTNET_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    const nftContract = new ethers.Contract(
        CONTRACTS.AGENT_IDENTITY_NFT,
        AGENT_IDENTITY_NFT_ABI,
        wallet,
    );

    // Update score on-chain
    const tx = await nftContract.updateAgentScore(
        agentAddress,
        creditScore,
        trustScore,
        { gasLimit: 500000, type: 0 },
    );

    const receipt = await tx.wait();
    return receipt.hash;
}

/**
 * Checkpoint all agents with updated scores.
 * Returns results for all successfully checkpointed agents.
 */
export async function checkpointAllScores(): Promise<CheckpointResult[]> {
    const allStates = getAllScoreStates();

    if (allStates.length === 0) {
        console.log("⏭️  No scores to checkpoint");
        return [];
    }

    console.log(`🔄 Checkpointing ${allStates.length} agent scores to on-chain NFT contract...`);

    const results: CheckpointResult[] = [];

    for (const state of allStates) {
        try {
            // Write to NFT contract
            const txHash = await checkpointAgentScore(
                state.asn,
                state.agentAddress,
                state.creditScore,
                state.trustScore,
            );

            // Emit checkpoint event back to HCS for audit trail
            const checkpointEvent = createCheckpointEvent(
                state.asn,
                state.agentAddress,
                state.creditScore,
                state.trustScore,
            );
            const hcsResult = await submitScoreEvent(checkpointEvent);

            results.push({
                asn: state.asn,
                agentAddress: state.agentAddress,
                creditScore: state.creditScore,
                trustScore: state.trustScore,
                txHash,
                hcsTxId: hcsResult.txId,
            });

            console.log(`✅ Checkpointed ${state.asn}: credit=${state.creditScore}, trust=${state.trustScore} (TX ${txHash})`);
        } catch (error) {
            console.error(`❌ Failed to checkpoint ${state.asn}:`, error);
        }
    }

    console.log(`✅ Checkpoint complete: ${results.length}/${allStates.length} agents`);

    return results;
}

// ═══════════════════════════════════════════════════════════════
// Background Service
// ═══════════════════════════════════════════════════════════════

let checkpointInterval: NodeJS.Timeout | null = null;

/**
 * Start the periodic checkpoint service.
 * Runs every hour (configurable via CHECKPOINT_INTERVAL_MS).
 */
export function startCheckpointService(): void {
    if (checkpointInterval) {
        console.warn("Checkpoint service already running");
        return;
    }

    console.log(`🕒 Starting checkpoint service (interval: ${CHECKPOINT_INTERVAL_MS / 1000}s)`);

    // Run immediately on start
    checkpointAllScores().catch(error => {
        console.error("Initial checkpoint failed:", error);
    });

    // Then run periodically
    checkpointInterval = setInterval(async () => {
        try {
            await checkpointAllScores();
        } catch (error) {
            console.error("Checkpoint service error:", error);
        }
    }, CHECKPOINT_INTERVAL_MS);
}

/**
 * Stop the periodic checkpoint service.
 */
export function stopCheckpointService(): void {
    if (checkpointInterval) {
        clearInterval(checkpointInterval);
        checkpointInterval = null;
        console.log("🛑 Stopped checkpoint service");
    }
}
