/**
 * POST /api/webhooks/discord
 *
 * Webhook receiver for Discord events.
 * Handles incoming messages from Discord and bridges them to Swarm channels.
 */

import { NextRequest } from "next/server";
import {
  type DiscordMessage,
  extractMessageContent,
  getSenderName,
} from "@/lib/discord";
import {
  getBridgedChannelByPlatform,
  logBridgedMessage,
} from "@/lib/platform-bridge";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    // Discord sends different event types
    // For message events, the structure is:
    // { t: "MESSAGE_CREATE", d: DiscordMessage }
    if (event.t !== "MESSAGE_CREATE") {
      // Not a message creation event, ignore
      return Response.json({ ok: true });
    }

    const message: DiscordMessage = event.d;

    // Ignore messages from bots (to prevent loops)
    if (message.author.bot) {
      return Response.json({ ok: true });
    }

    const channelId = message.channel_id;

    // Find bridged channel
    const bridge = await getBridgedChannelByPlatform("discord", channelId);
    if (!bridge) {
      // Channel not bridged, ignore
      return Response.json({ ok: true });
    }

    // Extract content
    const { text, attachments } = extractMessageContent(message);
    if (!text && attachments.length === 0) {
      // No content, ignore
      return Response.json({ ok: true });
    }

    const senderName = getSenderName(message.author);
    const senderId = message.author.id;

    // Post message to Swarm channel
    const msgRef = await addDoc(collection(db, "messages"), {
      channelId: bridge.swarmChannelId,
      senderId,
      senderName,
      senderType: "discord_user",
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      orgId: bridge.orgId,
      verified: false,
      platformSource: "discord",
      platformMessageId: message.id,
      createdAt: serverTimestamp(),
    });

    // Log bridged message
    await logBridgedMessage(
      bridge.swarmChannelId,
      "discord",
      message.id,
      senderId,
      senderName,
      text,
      "inbound",
      msgRef.id,
      attachments.length > 0 ? attachments : undefined
    );

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Discord webhook error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
