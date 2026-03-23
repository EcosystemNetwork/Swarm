/**
 * Hedera Reputation Staking & Delegation
 *
 * Agents stake their reputation to validate other agents' work.
 * Validators earn rewards for correct validations, lose reputation for incorrect ones.
 *
 * Flow:
 * 1. Agent A completes task → marked as "pending_validation"
 * 2. Agent B (validator) stakes 50 credit to validate
 * 3. Org owner approves/rejects the validation
 * 4. If correct: Validator earns +10 credit bonus
 * 5. If incorrect: Validator loses staked 50 credit
 *
 * This creates a reputation-backed validation market.
 */

import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { emitPenalty } from "./hedera-score-emitter";
import { submitScoreEvent, createTaskCompleteEvent } from "./hedera-hcs-client";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ValidationStake {
    id: string;
    taskId: string;
    validatorASN: string;
    validatorAddress: string;
    validatorAgentId: string;
    workerASN: string; // Agent being validated
    workerAddress: string;
    stakeAmount: number; // Credit staked (default 50)
    validationStatus: "approve" | "reject";
    actualOutcome?: "correct" | "incorrect"; // Set by org owner
    status: "pending" | "resolved" | "slashed";
    rewardEarned?: number;
    createdAt: unknown;
    resolvedAt?: unknown;
}

export interface StakingPool {
    validatorASN: string;
    totalStaked: number;
    activeStakes: number;
    successfulValidations: number;
    failedValidations: number;
    totalEarnings: number;
    validationAccuracy: number; // Percentage
}

// ═══════════════════════════════════════════════════════════════
// Staking Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Stake reputation to validate another agent's task completion.
 */
export async function stakeForValidation(
    taskId: string,
    validatorASN: string,
    validatorAddress: string,
    validatorAgentId: string,
    workerASN: string,
    workerAddress: string,
    validationStatus: "approve" | "reject",
    stakeAmount: number = 50,
): Promise<string> {
    // Check if validator has enough credit score to stake
    const validatorDoc = await getDoc(doc(db, "agents", validatorAgentId));
    const validator = validatorDoc.data();

    if (!validator || (validator.creditScore || 0) < stakeAmount) {
        throw new Error(`Insufficient credit score to stake (need ${stakeAmount}, have ${validator?.creditScore || 0})`);
    }

    // Check if task already has validation
    const existingStake = await getValidationStake(taskId);
    if (existingStake) {
        throw new Error("Task already has a validation stake");
    }

    // Create validation stake
    const stakeRef = doc(collection(db, "validationStakes"));
    const stake: ValidationStake = {
        id: stakeRef.id,
        taskId,
        validatorASN,
        validatorAddress,
        validatorAgentId,
        workerASN,
        workerAddress,
        stakeAmount,
        validationStatus,
        status: "pending",
        createdAt: serverTimestamp(),
    };

    await setDoc(stakeRef, stake);

    // Temporarily reduce validator's credit (staked amount is locked)
    await updateDoc(doc(db, "agents", validatorAgentId), {
        creditScore: (validator.creditScore || 0) - stakeAmount,
        stakedCredit: ((validator.stakedCredit as number) || 0) + stakeAmount,
    });

    console.log(`🎲 ${validatorASN} staked ${stakeAmount} credit to ${validationStatus} task ${taskId}`);

    return stakeRef.id;
}

/**
 * Resolve a validation stake (org owner decision).
 */
export async function resolveValidationStake(
    stakeId: string,
    actualOutcome: "correct" | "incorrect",
): Promise<void> {
    const stakeRef = doc(db, "validationStakes", stakeId);
    const stakeSnap = await getDoc(stakeRef);

    if (!stakeSnap.exists()) {
        throw new Error("Stake not found");
    }

    const stake = stakeSnap.data() as ValidationStake;

    if (stake.status !== "pending") {
        throw new Error("Stake already resolved");
    }

    const validatorDoc = await getDoc(doc(db, "agents", stake.validatorAgentId));
    const validator = validatorDoc.data();

    if (!validator) {
        throw new Error("Validator not found");
    }

    if (actualOutcome === "correct") {
        // Validator was right → return stake + bonus
        const reward = stake.stakeAmount + 10; // +10 credit bonus

        await updateDoc(doc(db, "agents", stake.validatorAgentId), {
            creditScore: (validator.creditScore || 0) + reward,
            stakedCredit: ((validator.stakedCredit as number) || 0) - stake.stakeAmount,
        });

        // Emit bonus event to HCS
        await submitScoreEvent({
            type: "bonus",
            asn: stake.validatorASN,
            agentAddress: stake.validatorAddress,
            creditDelta: 10,
            trustDelta: 2,
            timestamp: Math.floor(Date.now() / 1000),
            metadata: { taskId: stake.taskId, reason: "Correct validation" },
        });

        await updateDoc(stakeRef, {
            actualOutcome,
            status: "resolved",
            rewardEarned: 10,
            resolvedAt: serverTimestamp(),
        });

        console.log(`✅ Validator ${stake.validatorASN} earned +10 credit (correct validation)`);
    } else {
        // Validator was wrong → lose staked amount
        await updateDoc(doc(db, "agents", stake.validatorAgentId), {
            stakedCredit: ((validator.stakedCredit as number) || 0) - stake.stakeAmount,
        });

        // Emit penalty event to HCS
        await emitPenalty(
            stake.validatorASN,
            stake.validatorAddress,
            -stake.stakeAmount,
            `Incorrect validation for task ${stake.taskId}`,
        );

        await updateDoc(stakeRef, {
            actualOutcome,
            status: "slashed",
            rewardEarned: -stake.stakeAmount,
            resolvedAt: serverTimestamp(),
        });

        console.log(`❌ Validator ${stake.validatorASN} lost ${stake.stakeAmount} credit (incorrect validation)`);
    }
}

/**
 * Get validation stake for a task.
 */
async function getValidationStake(taskId: string): Promise<ValidationStake | null> {
    const stakesRef = collection(db, "validationStakes");
    const q = query(stakesRef, where("taskId", "==", taskId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ValidationStake;
}

/**
 * Get pending validation stakes for an agent (validator).
 */
export async function getPendingValidations(validatorASN: string): Promise<ValidationStake[]> {
    const stakesRef = collection(db, "validationStakes");
    const q = query(
        stakesRef,
        where("validatorASN", "==", validatorASN),
        where("status", "==", "pending"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ValidationStake));
}

/**
 * Get staking pool stats for an agent.
 */
export async function getStakingPoolStats(validatorASN: string): Promise<StakingPool> {
    const stakesRef = collection(db, "validationStakes");
    const q = query(stakesRef, where("validatorASN", "==", validatorASN));
    const snapshot = await getDocs(q);

    const stakes = snapshot.docs.map(doc => doc.data() as ValidationStake);

    const totalStaked = stakes
        .filter(s => s.status === "pending")
        .reduce((sum, s) => sum + s.stakeAmount, 0);

    const activeStakes = stakes.filter(s => s.status === "pending").length;

    const resolvedStakes = stakes.filter(s => s.status === "resolved" || s.status === "slashed");
    const successfulValidations = stakes.filter(s => s.status === "resolved").length;
    const failedValidations = stakes.filter(s => s.status === "slashed").length;

    const totalEarnings = resolvedStakes.reduce((sum, s) => sum + (s.rewardEarned || 0), 0);

    const validationAccuracy = resolvedStakes.length > 0
        ? (successfulValidations / resolvedStakes.length) * 100
        : 0;

    return {
        validatorASN,
        totalStaked,
        activeStakes,
        successfulValidations,
        failedValidations,
        totalEarnings,
        validationAccuracy,
    };
}
