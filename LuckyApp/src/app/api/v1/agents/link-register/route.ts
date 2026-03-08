/**
 * POST /api/v1/agents/link-register
 *
 * Register an existing Firestore agent on-chain (Sepolia LINK contracts).
 * Uses the platform wallet (SEPOLIA_PLATFORM_KEY) to call:
 *   - registerAgentFor() on SwarmAgentRegistryLink
 *   - registerASNFor() on SwarmASNRegistry
 *
 * Body: { agentId: string, orgId: string }
 */
import { NextRequest } from "next/server";
import { ethers } from "ethers";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { generateASN } from "@/lib/chainlink";
import {
    LINK_CONTRACTS,
    LINK_AGENT_REGISTRY_ABI,
    LINK_ASN_REGISTRY_ABI,
    SEPOLIA_RPC_URL,
} from "@/lib/link-contracts";
import { requireOrgMember, forbidden } from "@/lib/auth-guard";

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const agentId = body.agentId as string | undefined;
    const orgId = body.orgId as string | undefined;
    if (!agentId || !orgId) {
        return Response.json({ error: "agentId and orgId are required" }, { status: 400 });
    }

    // Auth: require org membership to register agents on-chain
    const auth = await requireOrgMember(request, orgId);
    if (!auth.ok) return forbidden(auth.error);

    // Load agent from Firestore
    const agentRef = doc(db, "agents", agentId);
    const agentSnap = await getDoc(agentRef);
    if (!agentSnap.exists()) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const agentData = agentSnap.data();
    if (agentData.orgId !== orgId) {
        return Response.json({ error: "Agent does not belong to this org" }, { status: 403 });
    }

    if (agentData.linkOnChainRegistered && agentData.asnOnChainRegistered) {
        return Response.json({ error: "Agent already registered on-chain" }, { status: 409 });
    }

    // Generate ASN if missing, persist immediately
    const asn: string = (agentData.asn as string) || generateASN();
    if (!agentData.asn) {
        await updateDoc(agentRef, { asn });
    }

    const agentName = (agentData.name as string) || "Agent";
    const agentType = (agentData.type as string) || "agent";

    // Build skills string
    const skills: string =
        (agentData.reportedSkills as { name: string }[] | undefined)
            ?.map((s) => s.name)
            .join(",") ||
        (agentData.capabilities as string[] | undefined)?.join(",") ||
        "general";

    // Setup wallet
    const privateKey = process.env.SEPOLIA_PLATFORM_KEY;
    if (!privateKey) {
        return Response.json({ error: "Platform wallet not configured" }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    let agentTxHash: string | null = null;
    let asnTxHash: string | null = null;

    // Register on Agent Registry (sequential to avoid nonce conflicts)
    if (LINK_CONTRACTS.AGENT_REGISTRY) {
        try {
            const registry = new ethers.Contract(
                LINK_CONTRACTS.AGENT_REGISTRY,
                LINK_AGENT_REGISTRY_ABI,
                wallet,
            );
            const tx = await registry.registerAgentFor(
                wallet.address,
                `${agentName} | ${asn}`,
                skills,
                asn,
                0,
            );
            const receipt = await tx.wait();
            agentTxHash = receipt.hash;
        } catch (err) {
            console.error("registerAgentFor failed:", err);
        }
    }

    // Register on ASN Registry
    if (LINK_CONTRACTS.ASN_REGISTRY) {
        try {
            const asnRegistry = new ethers.Contract(
                LINK_CONTRACTS.ASN_REGISTRY,
                LINK_ASN_REGISTRY_ABI,
                wallet,
            );
            const tx = await asnRegistry.registerASNFor(
                wallet.address,
                asn,
                agentName,
                agentType,
            );
            const receipt = await tx.wait();
            asnTxHash = receipt.hash;
        } catch (err) {
            console.error("registerASNFor failed:", err);
        }
    }

    // Update Firestore with results
    const update: Record<string, unknown> = { asn };
    if (agentTxHash) {
        update.linkOnChainTxHash = agentTxHash;
        update.linkOnChainRegistered = true;
    }
    if (asnTxHash) {
        update.asnOnChainTxHash = asnTxHash;
        update.asnOnChainRegistered = true;
    }
    if (!agentData.creditScore) update.creditScore = 680;
    if (!agentData.trustScore) update.trustScore = 50;

    await updateDoc(agentRef, update);

    return Response.json({
        success: true,
        agentId,
        asn,
        agentName,
        agentType,
        creditScore: (agentData.creditScore as number) || 680,
        trustScore: (agentData.trustScore as number) || 50,
        onChain: { agentTxHash, asnTxHash },
    });
}
