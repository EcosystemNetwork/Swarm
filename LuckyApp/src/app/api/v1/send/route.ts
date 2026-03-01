/**
 * POST /api/v1/send
 *
 * Send a signed message to a channel.
 * Body: { agent, channelId, text, nonce, sig }
 * Signature = Ed25519.sign("POST:/v1/send:<channelId>:<text>:<nonce>")
 * Nonce prevents replay attacks.
 */
import { NextRequest } from "next/server";
import { verifyAgentRequest, unauthorized } from "../verify";
import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDoc,
    addDoc,
    serverTimestamp,
} from "firebase/firestore";

// Simple in-memory nonce tracking (prevents replay within server lifetime)
const usedNonces = new Set<string>();
const MAX_NONCES = 10000;

export async function POST(request: NextRequest) {
    let body: Record<string, string>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { agent: agentId, channelId, text, nonce, sig, replyTo } = body;

    if (!agentId || !channelId || !text || !nonce || !sig) {
        return Response.json(
            { error: "agent, channelId, text, nonce, and sig are required" },
            { status: 400 }
        );
    }

    // Check nonce hasn't been used (replay protection)
    if (usedNonces.has(nonce)) {
        return Response.json(
            { error: "Nonce already used (replay detected)" },
            { status: 409 }
        );
    }

    // Verify signature: agent signed "POST:/v1/send:<channelId>:<text>:<nonce>"
    const signedMessage = `POST:/v1/send:${channelId}:${text}:${nonce}`;
    const agentData = await verifyAgentRequest(agentId, signedMessage, sig);
    if (!agentData) return unauthorized();

    // Record nonce
    usedNonces.add(nonce);
    if (usedNonces.size > MAX_NONCES) {
        // Evict oldest nonces (simple FIFO via Set iteration order)
        const iterator = usedNonces.values();
        for (let i = 0; i < 1000; i++) {
            const val = iterator.next().value;
            if (val) usedNonces.delete(val);
        }
    }

    try {
        const messageData: Record<string, unknown> = {
            channelId,
            senderId: agentData.agentId,
            senderName: agentData.agentName,
            senderType: "agent",
            content: text,
            orgId: agentData.orgId,
            nonce,
            verified: true, // signature verified by hub
            createdAt: serverTimestamp(),
        };

        if (replyTo) {
            messageData.replyTo = replyTo;
        }

        const ref = await addDoc(collection(db, "messages"), messageData);

        // Look up channel name for readable agentComms entry
        let channelName = `#${channelId}`;
        try {
            const chSnap = await getDoc(doc(db, "channels", channelId));
            if (chSnap.exists()) channelName = `#${chSnap.data().name || channelId}`;
        } catch { /* use default */ }

        // Also log to agentComms so it appears in the Agent Comms feed
        await addDoc(collection(db, "agentComms"), {
            orgId: agentData.orgId,
            fromAgentId: agentData.agentId,
            fromAgentName: agentData.agentName,
            toAgentId: channelId,
            toAgentName: channelName,
            type: "message",
            content: text,
            metadata: {
                channelId,
                messageId: ref.id,
                verified: true,
                ...(replyTo ? { replyTo } : {}),
            },
            createdAt: serverTimestamp(),
        }).catch(() => { }); // non-blocking — don't fail the send if comms log fails

        return Response.json({
            ok: true,
            messageId: ref.id,
            channelId,
            sentAt: Date.now(),
        });
    } catch (err) {
        console.error("v1/send error:", err);
        return Response.json(
            { error: "Failed to send message" },
            { status: 500 }
        );
    }
}
