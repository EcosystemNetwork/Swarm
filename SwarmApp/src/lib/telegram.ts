/**
 * Telegram Bot Integration
 *
 * Connect Telegram groups/channels to Swarm channels.
 * Uses Telegram Bot API for message bridging.
 *
 * Setup:
 * 1. Create bot via @BotFather
 * 2. Get bot token
 * 3. Set webhook to /api/webhooks/telegram
 * 4. Add bot to group/channel
 */

import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
// Types (Telegram Bot API)
// ═══════════════════════════════════════════════════════════════

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  video?: TelegramVideo;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

// ═══════════════════════════════════════════════════════════════
// Telegram Bot API Client
// ═══════════════════════════════════════════════════════════════

export class TelegramBot {
  private token: string;
  private apiBase: string;

  constructor(token: string) {
    this.token = token;
    this.apiBase = `https://api.telegram.org/bot${token}`;
  }

  // ─── Send Message ───────────────────────────────────────────────

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      replyToMessageId?: number;
      parseMode?: "Markdown" | "HTML";
      disableNotification?: boolean;
    }
  ): Promise<TelegramMessage | null> {
    try {
      const params: Record<string, unknown> = {
        chat_id: chatId,
        text,
      };

      if (options?.replyToMessageId) {
        params.reply_to_message_id = options.replyToMessageId;
      }
      if (options?.parseMode) {
        params.parse_mode = options.parseMode;
      }
      if (options?.disableNotification) {
        params.disable_notification = true;
      }

      const res = await fetch(`${this.apiBase}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!data.ok) {
        console.error("Telegram sendMessage error:", data);
        return null;
      }

      return data.result as TelegramMessage;
    } catch (err) {
      console.error("Failed to send Telegram message:", err);
      return null;
    }
  }

  // ─── Send Photo ─────────────────────────────────────────────────

  async sendPhoto(
    chatId: number | string,
    photoUrl: string,
    caption?: string
  ): Promise<TelegramMessage | null> {
    try {
      const params: Record<string, unknown> = {
        chat_id: chatId,
        photo: photoUrl,
      };

      if (caption) {
        params.caption = caption;
      }

      const res = await fetch(`${this.apiBase}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!data.ok) {
        console.error("Telegram sendPhoto error:", data);
        return null;
      }

      return data.result as TelegramMessage;
    } catch (err) {
      console.error("Failed to send Telegram photo:", err);
      return null;
    }
  }

  // ─── Send Document ──────────────────────────────────────────────

  async sendDocument(
    chatId: number | string,
    documentUrl: string,
    caption?: string
  ): Promise<TelegramMessage | null> {
    try {
      const params: Record<string, unknown> = {
        chat_id: chatId,
        document: documentUrl,
      };

      if (caption) {
        params.caption = caption;
      }

      const res = await fetch(`${this.apiBase}/sendDocument`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!data.ok) {
        console.error("Telegram sendDocument error:", data);
        return null;
      }

      return data.result as TelegramMessage;
    } catch (err) {
      console.error("Failed to send Telegram document:", err);
      return null;
    }
  }

  // ─── Get File ───────────────────────────────────────────────────

  async getFile(fileId: string): Promise<{ file_path?: string } | null> {
    try {
      const res = await fetch(`${this.apiBase}/getFile?file_id=${fileId}`);
      const data = await res.json();
      if (!data.ok) return null;
      return data.result;
    } catch (err) {
      console.error("Failed to get Telegram file:", err);
      return null;
    }
  }

  getFileUrl(filePath: string): string {
    return `https://api.telegram.org/file/bot${this.token}/${filePath}`;
  }

  // ─── Set Webhook ────────────────────────────────────────────────

  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    try {
      const params: Record<string, unknown> = { url };
      if (secretToken) {
        params.secret_token = secretToken;
      }

      const res = await fetch(`${this.apiBase}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      return data.ok;
    } catch (err) {
      console.error("Failed to set Telegram webhook:", err);
      return false;
    }
  }

  // ─── Get Webhook Info ───────────────────────────────────────────

  async getWebhookInfo(): Promise<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  } | null> {
    try {
      const res = await fetch(`${this.apiBase}/getWebhookInfo`);
      const data = await res.json();
      if (!data.ok) return null;
      return data.result;
    } catch (err) {
      console.error("Failed to get webhook info:", err);
      return null;
    }
  }

  // ─── Get Bot Info ───────────────────────────────────────────────

  async getMe(): Promise<TelegramUser | null> {
    try {
      const res = await fetch(`${this.apiBase}/getMe`);
      const data = await res.json();
      if (!data.ok) return null;
      return data.result as TelegramUser;
    } catch (err) {
      console.error("Failed to get bot info:", err);
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function extractMessageContent(message: TelegramMessage): {
  text: string;
  attachments: Array<{ url: string; type: string; name: string }>;
} {
  let text = message.text || message.caption || "";
  const attachments: Array<{ url: string; type: string; name: string }> = [];

  // Photo
  if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1]; // Largest size
    attachments.push({
      url: photo.file_id, // Will need to convert to URL via getFile
      type: "image",
      name: `photo_${photo.file_id}.jpg`,
    });
  }

  // Document
  if (message.document) {
    attachments.push({
      url: message.document.file_id,
      type: "document",
      name: message.document.file_name || `document_${message.document.file_id}`,
    });
  }

  // Video
  if (message.video) {
    attachments.push({
      url: message.video.file_id,
      type: "video",
      name: message.video.file_name || `video_${message.video.file_id}.mp4`,
    });
  }

  // Audio
  if (message.audio) {
    attachments.push({
      url: message.audio.file_id,
      type: "audio",
      name: message.audio.file_name || `audio_${message.audio.file_id}.mp3`,
    });
  }

  // Voice
  if (message.voice) {
    attachments.push({
      url: message.voice.file_id,
      type: "voice",
      name: `voice_${message.voice.file_id}.ogg`,
    });
  }

  return { text, attachments };
}

export function getSenderName(message: TelegramMessage): string {
  if (message.from) {
    const { first_name, last_name, username } = message.from;
    if (username) return `@${username}`;
    return `${first_name}${last_name ? ` ${last_name}` : ""}`;
  }
  if (message.sender_chat) {
    return message.sender_chat.title || `Chat ${message.sender_chat.id}`;
  }
  return "Unknown";
}

export function verifyTelegramWebhook(
  secretToken: string,
  requestToken?: string
): boolean {
  if (!requestToken) return false;

  // Ensure equal lengths before comparison to prevent timing attacks
  if (secretToken.length !== requestToken.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(secretToken),
      Buffer.from(requestToken)
    );
  } catch (err) {
    // timingSafeEqual can throw if buffers have different lengths
    return false;
  }
}
