/**
 * POST /api/v1/register
 *
 * Register an agent's Ed25519 public key with the hub.
 * No API keys, no tokens — the public key IS the credential.
 *
 * Body: { publicKey, agentName, agentType, orgId }
 * Returns: { agentId, registered: true }
 */
import { NextRequest } from "next/server";
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

export async function POST(request: NextRequest) {
    let body: Record<string, string>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { publicKey, agentName, agentType, orgId } = body;

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
            await updateDoc(doc(db, "agents", existingDoc.id), {
                status: "online",
                lastSeen: serverTimestamp(),
                connectionType: "ed25519",
            });

            return Response.json({
                agentId: existingDoc.id,
                agentName: existingDoc.data().name || agentName,
                registered: true,
                existing: true,
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
            await updateDoc(doc(db, "agents", matchedDoc.id), {
                publicKey,
                status: "online",
                lastSeen: serverTimestamp(),
                connectionType: "ed25519",
            });

            return Response.json({
                agentId: matchedDoc.id,
                agentName: matchedDoc.data().name || agentName,
                registered: true,
                existing: true,
            });
        }

        // Register new agent
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
            description: `${agentType || "Agent"} connected via Ed25519`,
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
        });

        return Response.json({
            agentId: ref.id,
            agentName,
            registered: true,
            existing: false,
        });
    } catch (err) {
        console.error("v1/register error:", err);
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
