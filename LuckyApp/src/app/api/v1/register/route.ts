/**
 * POST /api/v1/register
 *
 * Register an agent's Ed25519 public key with the hub.
 * No API keys, no tokens — the public key IS the credential.
 *
 * Body: { publicKey, agentName, agentType, orgId, skills?, bio? }
 *   skills — optional array of { id, name, type, version? } the agent self-reports
 *   bio    — optional short self-description the agent writes about itself
 * Returns: { agentId, asn, registered: true }
 */
import { NextRequest } from "next/server";
import { ethers } from "ethers";
import { PLATFORM_BRIEFING } from "../briefing";
import { getAgentAvatarUrl } from "@/lib/agent-avatar";
import { agentCheckIn, type Agent } from "@/lib/firestore";
import { generateASN } from "@/lib/chainlink";
import { CONTRACTS, AGENT_REGISTRY_ABI, HEDERA_GAS_LIMIT } from "@/lib/swarm-contracts";
import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    addDoc,
    getDocs,
    updateDoc,
    query,
    where,
    serverTimestamp,
} from "firebase/firestore";

const HEDERA_TESTNET_RPC = "https://testnet.hashio.io/api";

/** Attempt on-chain registration on Hedera Testnet using platform wallet */
async function registerOnChain(
    agentName: string,
    asn: string,
    skills: string,
): Promise<{ txHash: string } | null> {
    const privateKey = process.env.HEDERA_PLATFORM_KEY;
    if (!privateKey) return null;
    try {
        const provider = new ethers.JsonRpcProvider(HEDERA_TESTNET_RPC);
        const wallet = new ethers.Wallet(privateKey, provider);
        const registry = new ethers.Contract(CONTRACTS.AGENT_REGISTRY, AGENT_REGISTRY_ABI, wallet);
        const tx = await registry.registerAgent(
            `${agentName} | ${asn}`,
            skills,
            0,
            { gasLimit: HEDERA_GAS_LIMIT, type: 0 },
        );
        const receipt = await tx.wait();
        return { txHash: receipt.hash };
    } catch (err) {
        console.error("On-chain registration failed (non-fatal):", err);
        return null;
    }
}

interface ReportedSkillPayload {
    id: string;
    name: string;
    type: "skill" | "plugin";
    version?: string;
}

function sanitizeSkills(raw: unknown): ReportedSkillPayload[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((s): s is Record<string, unknown> =>
            typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.name === "string"
        )
        .map(s => ({
            id: String(s.id),
            name: String(s.name),
            type: s.type === "plugin" ? "plugin" as const : "skill" as const,
            ...(s.version ? { version: String(s.version) } : {}),
        }));
}

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const publicKey = body.publicKey as string | undefined;
    const agentName = body.agentName as string | undefined;
    const agentType = body.agentType as string | undefined;
    const orgId = body.orgId as string | undefined;
    const skills = sanitizeSkills(body.skills);
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 500) : undefined;

    if (!publicKey || !agentName || !orgId) {
        return Response.json(
            { error: "publicKey, agentName, and orgId are required" },
            { status: 400 }
        );
    }

    // Validate PEM format
    if (!publicKey.includes("BEGIN PUBLIC KEY")) {
        return Response.json(
            { error: "publicKey must be in PEM format (BEGIN PUBLIC KEY)" },
            { status: 400 }
        );
    }

    try {
        // Check if this public key is already registered
        const existingQ = query(
            collection(db, "agents"),
            where("publicKey", "==", publicKey)
        );
        const existing = await getDocs(existingQ);

        if (!existing.empty) {
            // Update existing agent (same key reconnecting)
            const existingDoc = existing.docs[0];
            const existingData = existingDoc.data();

            // Backfill ASN if agent doesn't have one yet
            const existingAsn = existingData.asn || generateASN();
            const updates: Record<string, unknown> = {
                status: "online",
                lastSeen: serverTimestamp(),
                connectionType: "ed25519",
                ...(skills.length > 0 ? { reportedSkills: skills } : {}),
                ...(bio ? { bio } : {}),
            };
            if (!existingData.asn) {
                updates.asn = existingAsn;
                updates.creditScore = existingData.creditScore ?? 680;
                updates.trustScore = existingData.trustScore ?? 50;
            }
            await updateDoc(doc(db, "agents", existingDoc.id), updates);

            // Post check-in greeting to Agent Hub
            const agent = { id: existingDoc.id, ...existingData } as Agent;
            agentCheckIn(agent, agent.orgId || orgId, skills.length > 0 ? skills : undefined, bio).catch(() => {});

            return Response.json({
                agentId: existingDoc.id,
                agentName: existingData.name || agentName,
                asn: existingAsn,
                registered: true,
                existing: true,
                reportedSkills: skills.length,
                briefing: PLATFORM_BRIEFING,
            });
        }

        // Fallback: check by orgId + name to prevent duplicates when
        // the agent regenerates its keypair (e.g., deleted keys/ folder)
        const nameQ = query(
            collection(db, "agents"),
            where("orgId", "==", orgId),
            where("name", "==", agentName)
        );
        const nameMatch = await getDocs(nameQ);

        if (!nameMatch.empty) {
            // Same org + name → update existing agent with new key
            const matchedDoc = nameMatch.docs[0];
            const matchedData = matchedDoc.data();

            // Backfill ASN if agent doesn't have one yet
            const matchedAsn = matchedData.asn || generateASN();
            const nameUpdates: Record<string, unknown> = {
                publicKey,
                status: "online",
                lastSeen: serverTimestamp(),
                connectionType: "ed25519",
                ...(skills.length > 0 ? { reportedSkills: skills } : {}),
                ...(bio ? { bio } : {}),
            };
            if (!matchedData.asn) {
                nameUpdates.asn = matchedAsn;
                nameUpdates.creditScore = matchedData.creditScore ?? 680;
                nameUpdates.trustScore = matchedData.trustScore ?? 50;
            }
            await updateDoc(doc(db, "agents", matchedDoc.id), nameUpdates);

            // Post check-in greeting to Agent Hub
            const agent = { id: matchedDoc.id, ...matchedData } as Agent;
            agentCheckIn(agent, agent.orgId || orgId, skills.length > 0 ? skills : undefined, bio).catch(() => {});

            return Response.json({
                agentId: matchedDoc.id,
                agentName: matchedData.name || agentName,
                asn: matchedAsn,
                registered: true,
                existing: true,
                reportedSkills: skills.length,
                briefing: PLATFORM_BRIEFING,
            });
        }

        // Register new agent — generate ASN identity
        const asn = generateASN();
        const skillStr = skills.map(s => s.name).join(",") || "general";

        const ref = await addDoc(collection(db, "agents"), {
            name: agentName,
            type: agentType || "agent",
            orgId,
            organizationId: orgId,
            publicKey,
            status: "online",
            connectionType: "ed25519",
            capabilities: [],
            projectIds: [],
            reportedSkills: skills,
            bio: bio || "",
            avatarUrl: getAgentAvatarUrl(agentName, agentType || "agent"),
            description: `${agentType || "Agent"} connected via Ed25519`,
            asn,
            creditScore: 680,
            trustScore: 50,
            onChainRegistered: false,
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
        });

        // Attempt on-chain registration on Hedera Testnet (non-blocking)
        registerOnChain(agentName, asn, skillStr).then(async (result) => {
            if (result) {
                await updateDoc(doc(db, "agents", ref.id), {
                    onChainTxHash: result.txHash,
                    onChainRegistered: true,
                });
            }
        }).catch(() => {});

        // Post check-in greeting to Agent Hub
        const newAgent = { id: ref.id, name: agentName, type: agentType || "agent", orgId } as Agent;
        agentCheckIn(newAgent, orgId, skills.length > 0 ? skills : undefined, bio).catch(() => {});

        return Response.json({
            agentId: ref.id,
            agentName,
            asn,
            registered: true,
            existing: false,
            reportedSkills: skills.length,
            briefing: PLATFORM_BRIEFING,
        });
    } catch (err) {
        console.error("v1/register error:", err);
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
