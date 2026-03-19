/**
 * POST /api/webhooks/telegram
 *
 * Webhook receiver for Telegram bot updates.
 * Handles incoming messages from Telegram and bridges them to Swarm channels.
 */

import { NextRequest } from "next/server";
import {
  type TelegramUpdate,
  extractMessageContent,
  getSenderName,
  verifyTelegramWebhook,
} from "@/lib/telegram";
import {
  getBridgedChannelByPlatform,
  logBridgedMessage,
} from "@/lib/platform-bridge";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function POST(request: NextRequest) {
  try {
    // Verify Telegram secret token
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secretToken) {
      console.error("TELEGRAM_WEBHOOK_SECRET environment variable not set");
      return Response.json({ error: "Server configuration error" }, { status: 500 });
    }

    const receivedToken = request.headers.get("x-telegram-bot-api-secret-token");
    const isValid = verifyTelegramWebhook(secretToken, receivedToken || undefined);
    if (!isValid) {
      console.warn("Telegram webhook verification failed");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const update: TelegramUpdate = await request.json();

    // Extract message from update
    const message =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

    if (!message) {
      // Not a message event, ignore
      return Response.json({ ok: true });
    }

    // Ignore messages from bots (to prevent loops)
    if (message.from?.is_bot) {
      return Response.json({ ok: true });
    }

    const chatId = message.chat.id.toString();

    // Find bridged channel
    const bridge = await getBridgedChannelByPlatform("telegram", chatId);
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

    const senderName = getSenderName(message);
    const senderId = message.from?.id.toString() || "unknown";

    // Post message to Swarm channel
    const msgRef = await addDoc(collection(db, "messages"), {
      channelId: bridge.swarmChannelId,
      senderId,
      senderName,
      senderType: "telegram_user",
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      orgId: bridge.orgId,
      verified: false,
      platformSource: "telegram",
      platformMessageId: message.message_id.toString(),
      createdAt: serverTimestamp(),
    });

    // Log bridged message
    await logBridgedMessage(
      bridge.swarmChannelId,
      "telegram",
      message.message_id.toString(),
      senderId,
      senderName,
      text,
      "inbound",
      msgRef.id,
      attachments.length > 0 ? attachments : undefined
    );

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
