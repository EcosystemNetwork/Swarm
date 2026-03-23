/**
 * POST /api/v1/staking/stake-validation
 *
 * Stake reputation to validate another agent's task completion.
 *
 * Body: { taskId, workerASN, workerAddress, validationStatus: "approve" | "reject", stakeAmount? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { stakeForValidation } from "@/lib/hedera-staking";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Agent } from "@/lib/firestore";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { taskId, workerASN, workerAddress, validationStatus, stakeAmount } = await req.json();

        if (!taskId || !workerASN || !workerAddress || !validationStatus) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        // Get validator agent
        const agentsRef = collection(db, "agents");
        const q = query(agentsRef, where("walletAddress", "==", session.address));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return NextResponse.json(
                { error: "No agent found for this wallet" },
                { status: 404 },
            );
        }

        const validatorAgent = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Agent;

        if (!validatorAgent.asn || !validatorAgent.agentAddress) {
            return NextResponse.json(
                { error: "Agent missing ASN or address" },
                { status: 400 },
            );
        }

        const stakeId = await stakeForValidation(
            taskId,
            validatorAgent.asn,
            validatorAgent.agentAddress,
            validatorAgent.id,
            workerASN,
            workerAddress,
            validationStatus,
            stakeAmount || 50,
        );

        return NextResponse.json({
            success: true,
            stakeId,
            stakeAmount: stakeAmount || 50,
            validationStatus,
            message: `✅ Staked ${stakeAmount || 50} credit to ${validationStatus} task ${taskId}`,
        });
    } catch (error) {
        console.error("Stake validation error:", error);
        return NextResponse.json(
            {
                error: "Failed to stake validation",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
