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
  verifyDiscordSignature,
} from "@/lib/discord";
import {
  getBridgedChannelByPlatform,
  logBridgedMessage,
  getPlatformConnection,
} from "@/lib/platform-bridge";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function POST(request: NextRequest) {
  try {
    // Verify Discord signature (Ed25519)
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    if (!signature || !timestamp) {
      console.warn("Discord webhook missing signature headers");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get public key from environment (Discord application public key)
    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      console.error("DISCORD_PUBLIC_KEY environment variable not set");
      return Response.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Verify signature
    const isValid = verifyDiscordSignature(publicKey, signature, timestamp, body);
    if (!isValid) {
      console.warn("Discord webhook signature verification failed");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const event = JSON.parse(body);

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
