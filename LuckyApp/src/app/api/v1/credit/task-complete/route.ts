/**
 * POST /api/v1/credit/task-complete
 *
 * Records a task completion for an agent:
 *   - Increments credit score by +5 (capped at 900)
 *   - Increments trust score by +1 (capped at 100)
 *   - Updates Firestore
 *   - Calls updateCredit on AgentRegistryLink + ASNRegistry (on-chain)
 *   - Calls recordTaskCompletion on ASNRegistry (on-chain)
 *
 * Body: { agentId, volumeUsd? }
 */
import { NextRequest } from "next/server";
import { ethers } from "ethers";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
    LINK_CONTRACTS,
    LINK_AGENT_REGISTRY_ABI,
    LINK_ASN_REGISTRY_ABI,
    SEPOLIA_RPC_URL,
} from "@/lib/link-contracts";
import { requirePlatformAdminOrAgent, unauthorized } from "@/lib/auth-guard";

/** Update credit scores on-chain via platform wallet */
async function updateCreditOnChain(
    agentAddr: string,
    asn: string,
    creditScore: number,
    trustScore: number,
): Promise<{ agentTxHash?: string; asnTxHash?: string }> {
    const privateKey = process.env.SEPOLIA_PLATFORM_KEY;
    if (!privateKey) return {};

    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    const result: { agentTxHash?: string; asnTxHash?: string } = {};

    if (LINK_CONTRACTS.AGENT_REGISTRY && agentAddr) {
        try {
            const registry = new ethers.Contract(
                LINK_CONTRACTS.AGENT_REGISTRY,
                LINK_AGENT_REGISTRY_ABI,
                wallet,
            );
            const tx = await registry.updateCredit(agentAddr, creditScore, trustScore);
            const receipt = await tx.wait();
            result.agentTxHash = receipt.hash;
        } catch (err) {
            console.error("updateCredit on AgentRegistry failed:", err);
        }
    }

    if (LINK_CONTRACTS.ASN_REGISTRY && asn) {
        try {
            const asnRegistry = new ethers.Contract(
                LINK_CONTRACTS.ASN_REGISTRY,
                LINK_ASN_REGISTRY_ABI,
                wallet,
            );
            const tx = await asnRegistry.updateCredit(asn, creditScore, trustScore);
            const receipt = await tx.wait();
            result.asnTxHash = receipt.hash;
        } catch (err) {
            console.error("updateCredit on ASNRegistry failed:", err);
        }
    }

    return result;
}

/** Record task completion on ASN registry */
async function recordTaskCompletionOnChain(
    asn: string,
    volumeWei: bigint,
): Promise<string | null> {
    const privateKey = process.env.SEPOLIA_PLATFORM_KEY;
    if (!privateKey || !LINK_CONTRACTS.ASN_REGISTRY || !asn) return null;

    try {
        const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
        const wallet = new ethers.Wallet(privateKey, provider);
        const asnRegistry = new ethers.Contract(
            LINK_CONTRACTS.ASN_REGISTRY,
            LINK_ASN_REGISTRY_ABI,
            wallet,
        );
        const tx = await asnRegistry.recordTaskCompletion(asn, volumeWei);
        const receipt = await tx.wait();
        return receipt.hash;
    } catch (err) {
        console.error("recordTaskCompletion failed:", err);
        return null;
    }
}

export async function POST(request: NextRequest) {
    // Auth: platform admin or authenticated agent
    const auth = await requirePlatformAdminOrAgent(request, "POST:/v1/credit/task-complete");
    if (!auth.ok) return unauthorized(auth.error);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const agentId = body.agentId as string | undefined;
    if (!agentId) {
        return Response.json({ error: "agentId is required" }, { status: 400 });
    }

    // If agent-authed, verify the agent can only record completions for itself
    if (auth.agent && auth.agent.agentId !== agentId) {
        return Response.json({ error: "Agents can only record their own task completions" }, { status: 403 });
    }

    // Load agent from Firestore
    const agentRef = doc(db, "agents", agentId);
    const agentSnap = await getDoc(agentRef);
    if (!agentSnap.exists()) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const agentData = agentSnap.data();
    const asn = (agentData.asn as string) || "";

    const volumeUsd = typeof body.volumeUsd === "number" ? body.volumeUsd : 0;
    const volumeWei = ethers.parseEther(String(volumeUsd || 0));

    // Bump credit score: +5 per task, capped at 900
    const currentCredit = (agentData.creditScore as number) || 680;
    const currentTrust = (agentData.trustScore as number) || 50;
    const newCredit = Math.min(currentCredit + 5, 900);
    // Bump trust: +1 per task, capped at 100
    const newTrust = Math.min(currentTrust + 1, 100);

    // Update Firestore
    await updateDoc(agentRef, {
        creditScore: newCredit,
        trustScore: newTrust,
        lastCreditUpdate: serverTimestamp(),
    });

    // Update on-chain credit + record task completion in parallel
    const [creditResult, taskTxHash] = await Promise.all([
        updateCreditOnChain(agentData.agentAddress || "", asn, newCredit, newTrust),
        recordTaskCompletionOnChain(asn, volumeWei),
    ]);

    return Response.json({
        agentId,
        asn,
        creditScore: newCredit,
        trustScore: newTrust,
        delta: { credit: newCredit - currentCredit, trust: newTrust - currentTrust },
        onChain: {
            agentTxHash: creditResult.agentTxHash || null,
            asnTxHash: creditResult.asnTxHash || null,
            taskCompletionTxHash: taskTxHash,
        },
    });
}
