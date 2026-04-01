/**
 * Flow Superpowers — Advanced DeFi features on Flow L1
 *
 * Six superpowers:
 *   1. FLOW Staking Dashboard — Delegate to validators, track rewards
 *   2. IncrementFi DEX Integration — Token swaps via Cadence DEX
 *   3. Cross-chain CID Verification — Verify Storacha CIDs on Flow + Filecoin
 *   4. Agent Reputation Scoring — ASN-linked on-chain reputation on Flow
 *   5. NFT Achievement Badges — Mint milestone NFTs for agents
 *   6. Flow EVM Bridge — Move assets between native Cadence and Flow EVM
 *
 * All features integrate with the ASN (Agent Social Number) system.
 */

import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { miniFlowToFlow } from "./flow-policy";

// ═══════════════════════════════════════════════════════════════
// 1. FLOW Staking
// ═══════════════════════════════════════════════════════════════

export interface FlowStakingPosition {
    id: string;
    orgId: string;
    agentId: string | null;
    /** ASN of the staking agent */
    asn: string | null;
    /** Flow wallet address */
    delegatorAddress: string;
    /** Validator node ID */
    validatorNodeId: string;
    /** Validator name (for display) */
    validatorName: string;
    /** Amount staked in mini-FLOW */
    stakedAmount: string;
    /** Accumulated rewards in mini-FLOW */
    rewardsAccumulated: string;
    /** Annual percentage yield estimate */
    estimatedApy: number;
    status: "active" | "unstaking" | "withdrawn";
    /** On-chain tx hash of the delegation */
    stakeTxHash: string | null;
    createdAt: Date | null;
    lastRewardAt: Date | null;
}

export async function createStakingPosition(
    input: Omit<FlowStakingPosition, "id" | "rewardsAccumulated" | "createdAt" | "lastRewardAt">,
): Promise<FlowStakingPosition> {
    const ref = await addDoc(collection(db, "flowStaking"), {
        ...input,
        rewardsAccumulated: "0",
        createdAt: serverTimestamp(),
        lastRewardAt: null,
    });
    return { ...input, id: ref.id, rewardsAccumulated: "0", createdAt: new Date(), lastRewardAt: null };
}

export async function getStakingPositions(orgId: string): Promise<FlowStakingPosition[]> {
    const q = query(collection(db, "flowStaking"), where("orgId", "==", orgId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToStaking(d.id, d.data()));
}

export async function updateStakingRewards(id: string, rewards: string): Promise<void> {
    await updateDoc(doc(db, "flowStaking", id), { rewardsAccumulated: rewards, lastRewardAt: serverTimestamp() });
}

export function getStakingStats(positions: FlowStakingPosition[]): {
    totalStaked: string; totalRewards: string; activePositions: number; avgApy: number;
} {
    const active = positions.filter((p) => p.status === "active");
    const totalStaked = active.reduce((s, p) => s + BigInt(p.stakedAmount), 0n);
    const totalRewards = active.reduce((s, p) => s + BigInt(p.rewardsAccumulated), 0n);
    const avgApy = active.length > 0 ? active.reduce((s, p) => s + p.estimatedApy, 0) / active.length : 0;
    return {
        totalStaked: miniFlowToFlow(totalStaked.toString()),
        totalRewards: miniFlowToFlow(totalRewards.toString()),
        activePositions: active.length,
        avgApy: Math.round(avgApy * 100) / 100,
    };
}

/** Cadence script to query staking info (run via FCL) */
export const FLOW_STAKING_SCRIPT = `
import FlowStakingCollection from 0xFlowStakingCollection

access(all) fun main(address: Address): [{String: AnyStruct}] {
    let account = getAccount(address)
    let stakingCollectionRef = account.capabilities.borrow<&{FlowStakingCollection.StakingCollectionPublic}>(
        /public/stakingCollection
    )
    if stakingCollectionRef == nil { return [] }
    let nodeIDs = stakingCollectionRef!.getNodeIDs()
    let results: [{String: AnyStruct}] = []
    for nodeID in nodeIDs {
        let info = stakingCollectionRef!.getDelegatorInfo(nodeID: nodeID, delegatorID: 0)
        if info != nil {
            results.append({
                "nodeID": nodeID,
                "tokensStaked": info!.tokensStaked,
                "tokensRewarded": info!.tokensRewarded,
                "tokensUnstaking": info!.tokensUnstaking
            })
        }
    }
    return results
}
`;

// ═══════════════════════════════════════════════════════════════
// 2. DEX Integration (IncrementFi / FlowX)
// ═══════════════════════════════════════════════════════════════

export interface FlowSwapQuote {
    id: string;
    orgId: string;
    agentId: string | null;
    asn: string | null;
    dex: "incrementfi" | "flowx";
    tokenInAddress: string;
    tokenInSymbol: string;
    tokenOutAddress: string;
    tokenOutSymbol: string;
    amountIn: string;
    estimatedAmountOut: string;
    priceImpact: number;
    /** Slippage tolerance in bps (e.g., 50 = 0.5%) */
    slippageBps: number;
    status: "quoted" | "executing" | "executed" | "failed";
    txHash: string | null;
    actualAmountOut: string | null;
    createdAt: Date | null;
    executedAt: Date | null;
}

export async function createSwapQuote(
    input: Omit<FlowSwapQuote, "id" | "actualAmountOut" | "createdAt" | "executedAt">,
): Promise<FlowSwapQuote> {
    const ref = await addDoc(collection(db, "flowSwaps"), {
        ...input,
        actualAmountOut: null,
        createdAt: serverTimestamp(),
        executedAt: null,
    });
    return { ...input, id: ref.id, actualAmountOut: null, createdAt: new Date(), executedAt: null };
}

export async function getSwapHistory(orgId: string, limit = 50): Promise<FlowSwapQuote[]> {
    const q = query(collection(db, "flowSwaps"), where("orgId", "==", orgId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.slice(0, limit).map((d) => docToSwap(d.id, d.data()));
}

export async function executeSwap(id: string, txHash: string, actualOut: string): Promise<void> {
    await updateDoc(doc(db, "flowSwaps", id), {
        status: "executed", txHash, actualAmountOut: actualOut, executedAt: serverTimestamp(),
    });
}

/** Common Flow token addresses for DEX routing */
export const FLOW_TOKENS = {
    FLOW: { address: "native", symbol: "FLOW", decimals: 8, name: "Flow" },
    USDC: { address: "0xB19436aFA4C13Be8", symbol: "USDC", decimals: 8, name: "USD Coin" },
    FUSD: { address: "0x3c5959b568896393", symbol: "FUSD", decimals: 8, name: "Flow USD" },
    WFLOW: { address: "0xd3bF53DAC106A0290B0483EcBC89d40FcC96f60e", symbol: "WFLOW", decimals: 18, name: "Wrapped Flow (EVM)" },
} as const;

// ═══════════════════════════════════════════════════════════════
// 3. Cross-chain CID Verification
// ═══════════════════════════════════════════════════════════════

export interface CidVerificationRecord {
    id: string;
    orgId: string;
    agentId: string;
    asn: string | null;
    /** The content identifier */
    cid: string;
    /** Storacha retrieval URL */
    gatewayUrl: string;
    /** Verification status on each chain */
    verifications: {
        flow?: { txHash: string; blockHeight: number; verified: boolean; verifiedAt: Date | null };
        filecoin?: { dealId: string; providerAddress: string; verified: boolean; verifiedAt: Date | null };
        storacha?: { spaceId: string; pinned: boolean; verified: boolean; verifiedAt: Date | null };
    };
    /** SHA-256 hash of content (for integrity check) */
    contentHash: string;
    sizeBytes: number;
    status: "pending" | "partially_verified" | "fully_verified" | "failed";
    createdAt: Date | null;
}

export async function createCidVerification(
    input: Omit<CidVerificationRecord, "id" | "createdAt">,
): Promise<CidVerificationRecord> {
    const ref = await addDoc(collection(db, "flowCidVerifications"), {
        ...input,
        createdAt: serverTimestamp(),
    });
    return { ...input, id: ref.id, createdAt: new Date() };
}

export async function getCidVerifications(orgId: string): Promise<CidVerificationRecord[]> {
    const q = query(collection(db, "flowCidVerifications"), where("orgId", "==", orgId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToVerification(d.id, d.data()));
}

export async function updateCidVerification(
    id: string,
    chain: "flow" | "filecoin" | "storacha",
    verification: Record<string, unknown>,
): Promise<void> {
    await updateDoc(doc(db, "flowCidVerifications", id), {
        [`verifications.${chain}`]: { ...verification, verifiedAt: serverTimestamp() },
    });
    // Check if all chains are verified and update status
    const snap = await getDoc(doc(db, "flowCidVerifications", id));
    if (snap.exists()) {
        const data = snap.data();
        const v = data.verifications || {};
        const chains = ["flow", "filecoin", "storacha"] as const;
        const verifiedCount = chains.filter((c) => v[c]?.verified).length;
        const status = verifiedCount === 3 ? "fully_verified" : verifiedCount > 0 ? "partially_verified" : "pending";
        await updateDoc(doc(db, "flowCidVerifications", id), { status });
    }
}

/** Cadence transaction to record CID on Flow for verification */
export const FLOW_CID_RECORD_TX = `
transaction(cid: String, contentHash: String, agentASN: String, sizeBytes: UInt64) {
    prepare(signer: auth(Storage) &Account) {
        log("CID Recorded on Flow")
        log("CID: ".concat(cid))
        log("Hash: ".concat(contentHash))
        log("ASN: ".concat(agentASN))
    }
}
`;

// ═══════════════════════════════════════════════════════════════
// 4. Agent Reputation Scoring (ASN-linked)
// ═══════════════════════════════════════════════════════════════

export interface FlowReputationEvent {
    id: string;
    orgId: string;
    agentId: string;
    asn: string;
    /** Event that triggered the score change */
    event: FlowReputationEventType;
    /** Credit score delta (+/-) */
    creditDelta: number;
    /** Trust score delta (+/-) */
    trustDelta: number;
    /** New credit score after change */
    newCreditScore: number;
    /** New trust score after change */
    newTrustScore: number;
    /** Flow tx hash if scored on-chain */
    flowTxHash: string | null;
    /** Description of why the score changed */
    reason: string;
    /** Metadata (task ID, bounty ID, etc.) */
    metadata: Record<string, string>;
    createdAt: Date | null;
}

export type FlowReputationEventType =
    | "bounty_completed"
    | "bounty_failed"
    | "payment_executed"
    | "staking_started"
    | "nft_minted"
    | "cid_verified"
    | "task_completed"
    | "task_failed"
    | "peer_endorsement"
    | "admin_bonus"
    | "admin_penalty"
    | "fraud_detected";

/** Score deltas for each event type */
export const REPUTATION_DELTAS: Record<FlowReputationEventType, { credit: number; trust: number }> = {
    bounty_completed:   { credit: +15, trust: +5 },
    bounty_failed:      { credit: -20, trust: -10 },
    payment_executed:   { credit: +5,  trust: +2 },
    staking_started:    { credit: +10, trust: +3 },
    nft_minted:         { credit: +5,  trust: +1 },
    cid_verified:       { credit: +8,  trust: +4 },
    task_completed:     { credit: +10, trust: +3 },
    task_failed:        { credit: -15, trust: -8 },
    peer_endorsement:   { credit: +5,  trust: +5 },
    admin_bonus:        { credit: +25, trust: +10 },
    admin_penalty:      { credit: -50, trust: -25 },
    fraud_detected:     { credit: -100, trust: -50 },
};

/** Reputation tiers based on credit score */
export const REPUTATION_TIERS = [
    { min: 800, name: "Diamond",  color: "text-cyan-300",   emoji: "💎", perks: "Max spending, no escrow, all workflows" },
    { min: 750, name: "Platinum", color: "text-purple-300", emoji: "🏆", perks: "High spending, 25% escrow, sensitive access" },
    { min: 650, name: "Gold",     color: "text-yellow-400", emoji: "🥇", perks: "Moderate spending, 50% escrow" },
    { min: 550, name: "Silver",   color: "text-gray-300",   emoji: "🥈", perks: "Low spending, review required" },
    { min: 300, name: "Bronze",   color: "text-orange-400", emoji: "🥉", perks: "Minimal access, full escrow" },
] as const;

export function getReputationTier(creditScore: number) {
    return REPUTATION_TIERS.find((t) => creditScore >= t.min) || REPUTATION_TIERS[REPUTATION_TIERS.length - 1];
}

export async function recordReputationEvent(
    input: Omit<FlowReputationEvent, "id" | "createdAt">,
): Promise<FlowReputationEvent> {
    const ref = await addDoc(collection(db, "flowReputationEvents"), {
        ...input,
        createdAt: serverTimestamp(),
    });
    return { ...input, id: ref.id, createdAt: new Date() };
}

export async function getReputationHistory(
    orgId: string,
    asn: string,
    limit = 50,
): Promise<FlowReputationEvent[]> {
    const q = query(
        collection(db, "flowReputationEvents"),
        where("orgId", "==", orgId),
        where("asn", "==", asn),
        orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.slice(0, limit).map((d) => docToRepEvent(d.id, d.data()));
}

// ═══════════════════════════════════════════════════════════════
// 5. NFT Achievement Badges
// ═══════════════════════════════════════════════════════════════

export interface FlowAchievementBadge {
    id: string;
    orgId: string;
    agentId: string;
    asn: string;
    /** Badge type */
    badge: FlowBadgeType;
    /** Human-readable name */
    name: string;
    description: string;
    /** Image/icon URI (can be IPFS CID) */
    imageUri: string;
    /** Flow NFT token ID once minted */
    nftTokenId: string | null;
    /** Mint tx hash */
    mintTxHash: string | null;
    /** Network where minted */
    network: "mainnet" | "testnet";
    /** Whether NFT has been minted on-chain */
    minted: boolean;
    /** Badge rarity */
    rarity: "common" | "rare" | "epic" | "legendary";
    /** Milestone that triggered this badge */
    milestone: string;
    earnedAt: Date | null;
}

export type FlowBadgeType =
    | "first_payment"
    | "ten_payments"
    | "hundred_payments"
    | "first_bounty"
    | "ten_bounties"
    | "first_stake"
    | "first_deploy"
    | "first_swap"
    | "cid_verifier"
    | "cross_chain"
    | "diamond_tier"
    | "platinum_tier"
    | "gold_tier"
    | "early_adopter"
    | "top_contributor";

export const BADGE_DEFINITIONS: Record<FlowBadgeType, { name: string; description: string; rarity: FlowAchievementBadge["rarity"]; milestone: string }> = {
    first_payment:     { name: "First Transfer",    description: "Sent your first FLOW payment",              rarity: "common",    milestone: "1 payment" },
    ten_payments:      { name: "Reliable Sender",   description: "Completed 10 FLOW payments",                rarity: "rare",      milestone: "10 payments" },
    hundred_payments:  { name: "Payment Machine",   description: "Completed 100 FLOW payments",               rarity: "epic",      milestone: "100 payments" },
    first_bounty:      { name: "Bounty Hunter",     description: "Completed your first bounty",               rarity: "common",    milestone: "1 bounty" },
    ten_bounties:      { name: "Master Hunter",     description: "Completed 10 bounties",                     rarity: "rare",      milestone: "10 bounties" },
    first_stake:       { name: "Validator Ally",     description: "Delegated FLOW to a validator",             rarity: "common",    milestone: "First stake" },
    first_deploy:      { name: "Contract Creator",  description: "Deployed your first smart contract",        rarity: "rare",      milestone: "First deploy" },
    first_swap:        { name: "DeFi Explorer",     description: "Completed your first token swap",           rarity: "common",    milestone: "First swap" },
    cid_verifier:      { name: "Data Guardian",     description: "Verified 10 CIDs across chains",            rarity: "rare",      milestone: "10 CID verifications" },
    cross_chain:       { name: "Bridge Builder",    description: "Used the Flow EVM bridge",                  rarity: "rare",      milestone: "First bridge" },
    diamond_tier:      { name: "Diamond Agent",     description: "Reached Diamond reputation tier (800+)",    rarity: "legendary", milestone: "Credit 800+" },
    platinum_tier:     { name: "Platinum Agent",     description: "Reached Platinum reputation tier (750+)",   rarity: "epic",      milestone: "Credit 750+" },
    gold_tier:         { name: "Gold Agent",         description: "Reached Gold reputation tier (650+)",       rarity: "rare",      milestone: "Credit 650+" },
    early_adopter:     { name: "Genesis Pioneer",   description: "Used Flow mod during PL Genesis hackathon", rarity: "legendary", milestone: "PL Genesis 2026" },
    top_contributor:   { name: "Top Contributor",   description: "Highest contribution count in a coordination space", rarity: "epic", milestone: "Top contributor" },
};

export async function mintAchievementBadge(
    input: Omit<FlowAchievementBadge, "id" | "earnedAt">,
): Promise<FlowAchievementBadge> {
    const ref = await addDoc(collection(db, "flowAchievements"), {
        ...input,
        earnedAt: serverTimestamp(),
    });
    return { ...input, id: ref.id, earnedAt: new Date() };
}

export async function getAgentBadges(orgId: string, agentId?: string): Promise<FlowAchievementBadge[]> {
    const constraints = [where("orgId", "==", orgId)];
    if (agentId) constraints.push(where("agentId", "==", agentId));
    const q = query(collection(db, "flowAchievements"), ...constraints, orderBy("earnedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToBadge(d.id, d.data()));
}

/** Check milestones and award badges that haven't been earned yet */
export async function checkAndAwardBadges(
    orgId: string,
    agentId: string,
    asn: string,
    stats: { payments: number; bounties: number; stakes: number; deploys: number; swaps: number; cidVerifications: number; creditScore: number },
): Promise<FlowAchievementBadge[]> {
    const existing = await getAgentBadges(orgId, agentId);
    const earned = new Set(existing.map((b) => b.badge));
    const newBadges: FlowAchievementBadge[] = [];

    const checks: [FlowBadgeType, boolean][] = [
        ["first_payment", stats.payments >= 1],
        ["ten_payments", stats.payments >= 10],
        ["hundred_payments", stats.payments >= 100],
        ["first_bounty", stats.bounties >= 1],
        ["ten_bounties", stats.bounties >= 10],
        ["first_stake", stats.stakes >= 1],
        ["first_deploy", stats.deploys >= 1],
        ["first_swap", stats.swaps >= 1],
        ["cid_verifier", stats.cidVerifications >= 10],
        ["gold_tier", stats.creditScore >= 650],
        ["platinum_tier", stats.creditScore >= 750],
        ["diamond_tier", stats.creditScore >= 800],
    ];

    for (const [badge, condition] of checks) {
        if (condition && !earned.has(badge)) {
            const def = BADGE_DEFINITIONS[badge];
            const b = await mintAchievementBadge({
                orgId, agentId, asn, badge,
                name: def.name, description: def.description,
                imageUri: "", nftTokenId: null, mintTxHash: null,
                network: "testnet", minted: false,
                rarity: def.rarity, milestone: def.milestone,
            });
            newBadges.push(b);
        }
    }

    return newBadges;
}

// ═══════════════════════════════════════════════════════════════
// 6. Flow EVM Bridge
// ═══════════════════════════════════════════════════════════════

export interface FlowEvmBridgeTransaction {
    id: string;
    orgId: string;
    agentId: string | null;
    asn: string | null;
    /** Direction of the bridge */
    direction: "cadence_to_evm" | "evm_to_cadence";
    /** Token being bridged */
    tokenSymbol: string;
    tokenAddress: string;
    /** Amount in the token's smallest unit */
    amount: string;
    /** Source address (Cadence or EVM) */
    fromAddress: string;
    /** Destination address (EVM or Cadence) */
    toAddress: string;
    status: "pending" | "bridging" | "completed" | "failed";
    /** Cadence-side tx hash */
    cadenceTxHash: string | null;
    /** EVM-side tx hash */
    evmTxHash: string | null;
    errorMessage: string | null;
    createdAt: Date | null;
    completedAt: Date | null;
}

export async function createBridgeTransaction(
    input: Omit<FlowEvmBridgeTransaction, "id" | "createdAt" | "completedAt">,
): Promise<FlowEvmBridgeTransaction> {
    const ref = await addDoc(collection(db, "flowEvmBridge"), {
        ...input,
        createdAt: serverTimestamp(),
        completedAt: null,
    });
    return { ...input, id: ref.id, createdAt: new Date(), completedAt: null };
}

export async function getBridgeTransactions(orgId: string): Promise<FlowEvmBridgeTransaction[]> {
    const q = query(collection(db, "flowEvmBridge"), where("orgId", "==", orgId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToBridge(d.id, d.data()));
}

export async function completeBridgeTransaction(id: string, cadenceTx: string | null, evmTx: string | null): Promise<void> {
    await updateDoc(doc(db, "flowEvmBridge", id), {
        status: "completed", cadenceTxHash: cadenceTx, evmTxHash: evmTx, completedAt: serverTimestamp(),
    });
}

// ═══════════════════════════════════════════════════════════════
// Doc converters
// ═══════════════════════════════════════════════════════════════

function docToStaking(id: string, d: Record<string, unknown>): FlowStakingPosition {
    return {
        id, orgId: (d.orgId as string) || "", agentId: (d.agentId as string) || null,
        asn: (d.asn as string) || null, delegatorAddress: (d.delegatorAddress as string) || "",
        validatorNodeId: (d.validatorNodeId as string) || "", validatorName: (d.validatorName as string) || "",
        stakedAmount: (d.stakedAmount as string) || "0", rewardsAccumulated: (d.rewardsAccumulated as string) || "0",
        estimatedApy: (d.estimatedApy as number) || 0, status: (d.status as FlowStakingPosition["status"]) || "active",
        stakeTxHash: (d.stakeTxHash as string) || null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        lastRewardAt: d.lastRewardAt instanceof Timestamp ? d.lastRewardAt.toDate() : null,
    };
}

function docToSwap(id: string, d: Record<string, unknown>): FlowSwapQuote {
    return {
        id, orgId: (d.orgId as string) || "", agentId: (d.agentId as string) || null,
        asn: (d.asn as string) || null, dex: (d.dex as FlowSwapQuote["dex"]) || "incrementfi",
        tokenInAddress: (d.tokenInAddress as string) || "", tokenInSymbol: (d.tokenInSymbol as string) || "",
        tokenOutAddress: (d.tokenOutAddress as string) || "", tokenOutSymbol: (d.tokenOutSymbol as string) || "",
        amountIn: (d.amountIn as string) || "0", estimatedAmountOut: (d.estimatedAmountOut as string) || "0",
        priceImpact: (d.priceImpact as number) || 0, slippageBps: (d.slippageBps as number) || 50,
        status: (d.status as FlowSwapQuote["status"]) || "quoted", txHash: (d.txHash as string) || null,
        actualAmountOut: (d.actualAmountOut as string) || null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        executedAt: d.executedAt instanceof Timestamp ? d.executedAt.toDate() : null,
    };
}

function docToVerification(id: string, d: Record<string, unknown>): CidVerificationRecord {
    return {
        id, orgId: (d.orgId as string) || "", agentId: (d.agentId as string) || "",
        asn: (d.asn as string) || null, cid: (d.cid as string) || "",
        gatewayUrl: (d.gatewayUrl as string) || "",
        verifications: (d.verifications as CidVerificationRecord["verifications"]) || {},
        contentHash: (d.contentHash as string) || "", sizeBytes: (d.sizeBytes as number) || 0,
        status: (d.status as CidVerificationRecord["status"]) || "pending",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}

function docToRepEvent(id: string, d: Record<string, unknown>): FlowReputationEvent {
    return {
        id, orgId: (d.orgId as string) || "", agentId: (d.agentId as string) || "",
        asn: (d.asn as string) || "", event: (d.event as FlowReputationEventType) || "task_completed",
        creditDelta: (d.creditDelta as number) || 0, trustDelta: (d.trustDelta as number) || 0,
        newCreditScore: (d.newCreditScore as number) || 680, newTrustScore: (d.newTrustScore as number) || 50,
        flowTxHash: (d.flowTxHash as string) || null, reason: (d.reason as string) || "",
        metadata: (d.metadata as Record<string, string>) || {},
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}

function docToBadge(id: string, d: Record<string, unknown>): FlowAchievementBadge {
    return {
        id, orgId: (d.orgId as string) || "", agentId: (d.agentId as string) || "",
        asn: (d.asn as string) || "", badge: (d.badge as FlowBadgeType) || "first_payment",
        name: (d.name as string) || "", description: (d.description as string) || "",
        imageUri: (d.imageUri as string) || "", nftTokenId: (d.nftTokenId as string) || null,
        mintTxHash: (d.mintTxHash as string) || null, network: (d.network as "mainnet" | "testnet") || "testnet",
        minted: (d.minted as boolean) || false, rarity: (d.rarity as FlowAchievementBadge["rarity"]) || "common",
        milestone: (d.milestone as string) || "",
        earnedAt: d.earnedAt instanceof Timestamp ? d.earnedAt.toDate() : null,
    };
}

function docToBridge(id: string, d: Record<string, unknown>): FlowEvmBridgeTransaction {
    return {
        id, orgId: (d.orgId as string) || "", agentId: (d.agentId as string) || null,
        asn: (d.asn as string) || null, direction: (d.direction as FlowEvmBridgeTransaction["direction"]) || "cadence_to_evm",
        tokenSymbol: (d.tokenSymbol as string) || "", tokenAddress: (d.tokenAddress as string) || "",
        amount: (d.amount as string) || "0", fromAddress: (d.fromAddress as string) || "",
        toAddress: (d.toAddress as string) || "", status: (d.status as FlowEvmBridgeTransaction["status"]) || "pending",
        cadenceTxHash: (d.cadenceTxHash as string) || null, evmTxHash: (d.evmTxHash as string) || null,
        errorMessage: (d.errorMessage as string) || null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        completedAt: d.completedAt instanceof Timestamp ? d.completedAt.toDate() : null,
    };
}
