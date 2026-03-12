/**
 * POST /api/webhooks/slack
 *
 * Webhook receiver for Slack Events API.
 * Handles incoming messages from Slack and bridges them to Swarm channels.
 */

import { NextRequest } from "next/server";
import {
  type SlackEvent,
  SlackClient,
  extractMessageContent,
  getSenderName,
} from "@/lib/slack";
import {
  getBridgedChannelByPlatform,
  getPlatformConnection,
  logBridgedMessage,
} from "@/lib/platform-bridge";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function POST(request: NextRequest) {
  try {
    const event: SlackEvent = await request.json();

    // Slack URL verification challenge
    if (event.type === "url_verification") {
      return Response.json({ challenge: (event as any).challenge });
    }

    // Handle events
    if (event.type === "event_callback") {
      const messageEvent = event.event;

      // Only handle message events
      if (messageEvent.type !== "message") {
        return Response.json({ ok: true });
      }

      // Ignore bot messages and message changes/deletions
      if (
        messageEvent.subtype === "bot_message" ||
        messageEvent.subtype === "message_changed" ||
        messageEvent.subtype === "message_deleted" ||
        !messageEvent.text
      ) {
        return Response.json({ ok: true });
      }

      const channelId = messageEvent.channel;
      if (!channelId) {
        return Response.json({ ok: true });
      }

      // Find bridged channel
      const bridge = await getBridgedChannelByPlatform("slack", channelId);
      if (!bridge) {
        // Channel not bridged, ignore
        return Response.json({ ok: true });
      }

      // Get Slack client to fetch user info
      const connection = await getPlatformConnection(bridge.orgId, "slack");
      if (!connection) {
        console.error("No Slack connection found for org:", bridge.orgId);
        return Response.json({ ok: true });
      }

      const slackClient = new SlackClient(connection.credentials);
      const senderName = await getSenderName(slackClient, messageEvent.user);
      const senderId = messageEvent.user || "unknown";
      const text = messageEvent.text || "";

      // Post message to Swarm channel
      const msgRef = await addDoc(collection(db, "messages"), {
        channelId: bridge.swarmChannelId,
        senderId,
        senderName,
        senderType: "slack_user",
        content: text,
        orgId: bridge.orgId,
        verified: false,
        platformSource: "slack",
        platformMessageId: messageEvent.ts || "",
        createdAt: serverTimestamp(),
      });

      // Log bridged message
      await logBridgedMessage(
        bridge.swarmChannelId,
        "slack",
        messageEvent.ts || "",
        senderId,
        senderName,
        text,
        "inbound",
        msgRef.id
      );

      return Response.json({ ok: true });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Slack webhook error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
