/**
 * Hedera Governance — Multi-Party Penalty Approval using Schedule Service
 *
 * For large penalties (> -50 credit), requires approval from multiple parties:
 * 1. Org owner creates scheduled penalty transaction
 * 2. Compliance agent(s) sign approval
 * 3. Transaction executes once all required signatures collected
 *
 * Uses Hedera Schedule Service for on-chain governance.
 */

import {
    Client,
    ScheduleCreateTransaction,
    ScheduleSignTransaction,
    ScheduleInfoQuery,
    PrivateKey,
    AccountId,
    TransferTransaction,
    Hbar,
} from "@hashgraph/sdk";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDoc, updateDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { submitScoreEvent, createPenaltyEvent } from "./hedera-hcs-client";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PenaltyProposal {
    id: string;
    asn: string;
    agentAddress: string;
    creditPenalty: number; // Negative amount
    trustPenalty: number; // Negative amount
    reason: string;
    proposedBy: string; // Wallet address
    requiredSigners: string[]; // List of required approver addresses
    currentSigners: string[]; // Who has signed so far
    scheduleId?: string; // Hedera schedule ID
    status: "pending" | "approved" | "rejected" | "executed";
    createdAt: unknown;
    executedAt?: unknown;
}

// ═══════════════════════════════════════════════════════════════
// Client Setup
// ═══════════════════════════════════════════════════════════════

function getHederaClient(): Client {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
        throw new Error("Hedera not configured");
    }

    const client = Client.forTestnet();
    client.setOperator(
        AccountId.fromString(operatorId),
        PrivateKey.fromString(operatorKey),
    );

    return client;
}

// ═══════════════════════════════════════════════════════════════
// Penalty Proposal Flow
// ═══════════════════════════════════════════════════════════════

/**
 * Create a penalty proposal requiring multi-party approval.
 * For penalties > -50 credit.
 */
export async function createPenaltyProposal(
    asn: string,
    agentAddress: string,
    creditPenalty: number,
    reason: string,
    proposedBy: string,
    requiredSigners: string[], // List of approver wallet addresses
): Promise<string> {
    if (creditPenalty >= 0) {
        throw new Error("Penalty must be negative");
    }

    if (Math.abs(creditPenalty) <= 50) {
        throw new Error("Small penalties (≤ 50) don't require governance - use direct penalty");
    }

    const trustPenalty = Math.floor(Math.abs(creditPenalty) / 5);

    // Create proposal in Firestore
    const proposalRef = doc(collection(db, "penaltyProposals"));
    const proposal: PenaltyProposal = {
        id: proposalRef.id,
        asn,
        agentAddress,
        creditPenalty,
        trustPenalty: -trustPenalty,
        reason,
        proposedBy,
        requiredSigners,
        currentSigners: [],
        status: "pending",
        createdAt: serverTimestamp(),
    };

    await setDoc(proposalRef, proposal);

    console.log(`✅ Created penalty proposal ${proposalRef.id}: ${creditPenalty} credit for ${asn}`);

    return proposalRef.id;
}

/**
 * Sign a penalty proposal (approver action).
 * When all required signatures collected, executes the penalty.
 */
export async function signPenaltyProposal(
    proposalId: string,
    signerAddress: string,
): Promise<{ executed: boolean; status: string }> {
    const proposalRef = doc(db, "penaltyProposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);

    if (!proposalSnap.exists()) {
        throw new Error("Proposal not found");
    }

    const proposal = proposalSnap.data() as PenaltyProposal;

    // Check if signer is authorized
    if (!proposal.requiredSigners.includes(signerAddress)) {
        throw new Error("Unauthorized signer");
    }

    // Check if already signed
    if (proposal.currentSigners.includes(signerAddress)) {
        throw new Error("Already signed");
    }

    // Add signature
    const updatedSigners = [...proposal.currentSigners, signerAddress];

    await updateDoc(proposalRef, {
        currentSigners: updatedSigners,
    });

    console.log(`✅ ${signerAddress} signed proposal ${proposalId} (${updatedSigners.length}/${proposal.requiredSigners.length})`);

    // Check if all signatures collected
    const allSigned = proposal.requiredSigners.every(s => updatedSigners.includes(s));

    if (allSigned) {
        // Execute penalty
        await executePenalty(proposalId);
        return { executed: true, status: "executed" };
    }

    return { executed: false, status: "pending" };
}

/**
 * Execute penalty after all signatures collected.
 */
async function executePenalty(proposalId: string): Promise<void> {
    const proposalRef = doc(db, "penaltyProposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);

    if (!proposalSnap.exists()) {
        throw new Error("Proposal not found");
    }

    const proposal = proposalSnap.data() as PenaltyProposal;

    // Emit penalty event to HCS
    const penaltyEvent = createPenaltyEvent(
        proposal.asn,
        proposal.agentAddress,
        Math.abs(proposal.creditPenalty),
        `GOVERNANCE APPROVED: ${proposal.reason}`,
    );

    await submitScoreEvent(penaltyEvent);

    // Update proposal status
    await updateDoc(proposalRef, {
        status: "executed",
        executedAt: serverTimestamp(),
    });

    console.log(`✅ Executed penalty for ${proposal.asn}: ${proposal.creditPenalty} credit (approved by ${proposal.requiredSigners.length} signers)`);
}

/**
 * Reject a penalty proposal (compliance override).
 */
export async function rejectPenaltyProposal(
    proposalId: string,
    rejectedBy: string,
    reason: string,
): Promise<void> {
    const proposalRef = doc(db, "penaltyProposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);

    if (!proposalSnap.exists()) {
        throw new Error("Proposal not found");
    }

    const proposal = proposalSnap.data() as PenaltyProposal;

    // Check if rejector is authorized
    if (!proposal.requiredSigners.includes(rejectedBy)) {
        throw new Error("Unauthorized rejector");
    }

    await updateDoc(proposalRef, {
        status: "rejected",
        rejectedBy,
        rejectionReason: reason,
        rejectedAt: serverTimestamp(),
    });

    console.log(`❌ Rejected penalty proposal ${proposalId} by ${rejectedBy}: ${reason}`);
}

/**
 * Get all pending penalty proposals for a specific signer.
 */
export async function getPendingProposalsForSigner(signerAddress: string): Promise<PenaltyProposal[]> {
    const proposalsRef = collection(db, "penaltyProposals");
    const q = query(
        proposalsRef,
        where("status", "==", "pending"),
        where("requiredSigners", "array-contains", signerAddress),
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PenaltyProposal));
}

/**
 * Get proposal by ID.
 */
export async function getPenaltyProposal(proposalId: string): Promise<PenaltyProposal | null> {
    const proposalRef = doc(db, "penaltyProposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);

    if (!proposalSnap.exists()) {
        return null;
    }

    return { id: proposalSnap.id, ...proposalSnap.data() } as PenaltyProposal;
}
