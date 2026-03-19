/**
 * POST /api/webhooks/reply
 *
 * Send a message to a channel on behalf of the agent.
 * Body: { agentId, apiKey, channelId, message }
 */
import { NextRequest } from "next/server";
import { authenticateAgent, unauthorized } from "../auth";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const agentId = body.agentId as string | undefined;
    const apiKey = body.apiKey as string | undefined;
    const channelId = body.channelId as string | undefined;
    const message = body.message as string | undefined;
    const attachments = body.attachments as Array<Record<string, unknown>> | undefined;

    if (!channelId) {
        return Response.json(
            { error: "channelId is required" },
            { status: 400 }
        );
    }

    // Require message or attachments (or both)
    if (!message && (!attachments || !Array.isArray(attachments) || attachments.length === 0)) {
        return Response.json(
            { error: "message or attachments (or both) are required" },
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

    // Auth
    const agent = await authenticateAgent(agentId, apiKey);
    if (!agent) return unauthorized();

    try {
        const messageData: Record<string, unknown> = {
            channelId,
            senderId: agent.agentId,
            senderName: agent.agentName,
            senderType: "agent",
            content: message || "",
            orgId: agent.orgId,
            createdAt: serverTimestamp(),
        };

        if (attachments && attachments.length > 0) {
            messageData.attachments = attachments.map((att) => ({
                url: att.url,
                name: att.name,
                type: att.type,
                size: att.size,
            }));
        }

        const ref = await addDoc(collection(db, "messages"), messageData);

        return Response.json({
            ok: true,
            messageId: ref.id,
            channelId,
            sentAt: Date.now(),
        });
    } catch (err) {
        console.error("Webhook reply error:", err);
        return Response.json(
            { error: "Failed to send message" },
            { status: 500 }
        );
    }
}
