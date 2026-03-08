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
import { rateLimit } from "../rate-limit";
import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDoc,
    addDoc,
    serverTimestamp,
} from "firebase/firestore";

// ── Replay Protection ────────────────────────────────────────────────────────
// In-memory nonce tracking with TTL-based expiry.
// LIMITATION: in-memory only — nonces are lost on server restart or across
// multiple instances. For production multi-instance deployments, replace with
// Redis (SET nonce EX <ttl> NX) or a Firestore TTL collection.
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes — nonces older than this are evictable
const MAX_NONCES = 50_000;
const NONCE_SWEEP_INTERVAL_MS = 60 * 1000; // sweep expired nonces every 60s
const usedNonces = new Map<string, number>(); // nonce → timestamp when recorded

// Periodic sweep of expired nonces (prevents unbounded growth)
setInterval(() => {
    const cutoff = Date.now() - NONCE_TTL_MS;
    for (const [nonce, ts] of usedNonces) {
        if (ts < cutoff) usedNonces.delete(nonce);
    }
}, NONCE_SWEEP_INTERVAL_MS).unref();

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const agentId = body.agent as string | undefined;

    // Rate limit by agentId (falls back to "anon" for malformed requests —
    // those will fail validation below anyway)
    const limited = rateLimit(agentId || "anon");
    if (limited) return limited;

    const channelId = body.channelId as string | undefined;
    const text = body.text as string | undefined;
    const nonce = body.nonce as string | undefined;
    const sig = body.sig as string | undefined;
    const replyTo = body.replyTo as string | undefined;
    const attachments = body.attachments as Array<Record<string, unknown>> | undefined;

    if (!agentId || !channelId || !nonce || !sig) {
        return Response.json(
            { error: "agent, channelId, nonce, and sig are required" },
            { status: 400 }
        );
    }

    // Require text or attachments (or both)
    if (!text && (!attachments || !Array.isArray(attachments) || attachments.length === 0)) {
        return Response.json(
            { error: "text or attachments (or both) are required" },
            { status: 400 }
        );
    }

    // Validate attachments if provided
    if (attachments) {
        if (!Array.isArray(attachments) || attachments.length > 5) {
            return Response.json(
                { error: "attachments must be an array of at most 5 items" },
                { status: 400 }
            );
        }
        for (const att of attachments) {
            if (!att.url || !att.name || !att.type || typeof att.size !== "number") {
                return Response.json(
                    { error: "Each attachment must have url, name, type, and size" },
                    { status: 400 }
                );
            }
        }
    }

    // Check nonce hasn't been used (replay protection)
    if (usedNonces.has(nonce)) {
        return Response.json(
            { error: "Nonce already used (replay detected)" },
            { status: 409 }
        );
    }

    // Verify signature: agent signed "POST:/v1/send:<channelId>:<text>:<nonce>"
    // Attachments are NOT included in the signature (only text + nonce)
    const signedMessage = `POST:/v1/send:${channelId}:${text || ""}:${nonce}`;
    const agentData = await verifyAgentRequest(agentId, signedMessage, sig);
    if (!agentData) return unauthorized();

    // Record nonce with current timestamp for TTL-based expiry
    usedNonces.set(nonce, Date.now());
    if (usedNonces.size > MAX_NONCES) {
        // Emergency eviction: drop oldest entries by insertion order
        const iterator = usedNonces.keys();
        for (let i = 0; i < 1000; i++) {
            const key = iterator.next().value;
            if (key) usedNonces.delete(key);
        }
    }

    try {
        const messageData: Record<string, unknown> = {
            channelId,
            senderId: agentData.agentId,
            senderName: agentData.agentName,
            senderType: "agent",
            content: text || "",
            orgId: agentData.orgId,
            nonce,
            verified: true, // signature verified by hub
            createdAt: serverTimestamp(),
        };

        if (replyTo) {
            messageData.replyTo = replyTo;
        }

        if (attachments && attachments.length > 0) {
            messageData.attachments = attachments.map((att: Record<string, unknown>) => ({
                url: att.url,
                name: att.name,
                type: att.type,
                size: att.size,
            }));
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
