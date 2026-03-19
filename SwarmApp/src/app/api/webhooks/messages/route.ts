/**
 * GET /api/webhooks/messages?agentId=X&apiKey=Y&since=<timestamp_ms>
 *
 * Returns new messages across all channels the agent has access to.
 * OpenClaw agents can poll this endpoint on their own schedule.
 */
import { NextRequest } from "next/server";
import { authenticateAgent, unauthorized } from "../auth";
import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    Timestamp,
} from "firebase/firestore";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get("agentId");
    const apiKey = searchParams.get("apiKey");
    const sinceParam = searchParams.get("since");

    // Auth
    const agent = await authenticateAgent(agentId, apiKey);
    if (!agent) return unauthorized();

    try {
        // Get agent's projects and org
        const agentSnap = await getDoc(doc(db, "agents", agent.agentId));
        if (!agentSnap.exists()) {
            return Response.json({ error: "Agent not found" }, { status: 404 });
        }
        const agentData = agentSnap.data();
        const projectIds: string[] = agentData.projectIds || [];
        const orgId = agentData.orgId || agent.orgId;

        // Get channels for agent's projects
        const channelIds: string[] = [];
        const channelMeta: Record<string, { name: string; projectId: string }> = {};

        for (const projectId of projectIds.slice(0, 10)) {
            const channelsQ = query(
                collection(db, "channels"),
                where("projectId", "==", projectId)
            );
            const channelsSnap = await getDocs(channelsQ);
            for (const chDoc of channelsSnap.docs) {
                channelIds.push(chDoc.id);
                channelMeta[chDoc.id] = {
                    name: chDoc.data().name || "Channel",
                    projectId,
                };
            }
        }

        // Always include the Agent Hub channel (org-wide, no projectId)
        if (orgId) {
            const hubQ = query(
                collection(db, "channels"),
                where("orgId", "==", orgId),
                where("name", "==", "Agent Hub")
            );
            const hubSnap = await getDocs(hubQ);
            if (!hubSnap.empty) {
                const hubDoc = hubSnap.docs[0];
                if (!channelIds.includes(hubDoc.id)) {
                    channelIds.push(hubDoc.id);
                    channelMeta[hubDoc.id] = {
                        name: "Agent Hub",
                        projectId: "org",
                    };
                }
            }
        }

        if (channelIds.length === 0) {
            return Response.json({ messages: [], channels: [] });
        }

        // Fetch messages — optionally filtered by "since" timestamp
        const messages: Array<{
            id: string;
            channelId: string;
            channelName: string;
            from: string;
            fromType: string;
            text: string;
            timestamp: number;
            attachments?: Array<{ url: string; name: string; type: string; size: number }>;
        }> = [];

        for (const channelId of channelIds) {
            let messagesQ;
            if (sinceParam) {
                const sinceTs = Timestamp.fromMillis(parseInt(sinceParam, 10));
                messagesQ = query(
                    collection(db, "messages"),
                    where("channelId", "==", channelId),
                    where("createdAt", ">", sinceTs),
                    orderBy("createdAt", "asc")
                );
            } else {
                // Default: last 20 messages per channel
                messagesQ = query(
                    collection(db, "messages"),
                    where("channelId", "==", channelId),
                    orderBy("createdAt", "asc")
                );
            }

            const msgsSnap = await getDocs(messagesQ);
            for (const mDoc of msgsSnap.docs) {
                const m = mDoc.data();
                // Skip agent's own messages
                if (m.senderId === agent.agentId) continue;

                const msg: typeof messages[number] = {
                    id: mDoc.id,
                    channelId,
                    channelName: channelMeta[channelId]?.name || channelId,
                    from: m.senderName || m.senderId || "unknown",
                    fromType: m.senderType || "user",
                    text: m.content || m.text || "",
                    timestamp: m.createdAt?.toMillis?.() || m.ts || 0,
                };
                if (m.attachments && Array.isArray(m.attachments)) {
                    msg.attachments = m.attachments;
                }
                messages.push(msg);
            }
        }

        // Cap at 100 messages per poll to avoid huge payloads
        const capped = messages.slice(-100);

        return Response.json({
            messages: capped,
            channels: Object.entries(channelMeta).map(([id, meta]) => ({
                id,
                ...meta,
            })),
            polledAt: Date.now(),
        });
    } catch (err) {
        console.error("Webhook messages error:", err);
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
