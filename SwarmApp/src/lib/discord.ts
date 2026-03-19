/**
 * Discord Bot Integration
 *
 * Connect Discord channels to Swarm channels.
 * Uses Discord Bot API + Gateway for message bridging.
 *
 * Setup:
 * 1. Create Discord application at https://discord.com/developers/applications
 * 2. Create bot user and get bot token
 * 3. Enable MESSAGE CONTENT intent
 * 4. Invite bot to server with permissions: Send Messages, Read Message History, Embed Links
 * 5. Set up webhook for events (or use Gateway)
 */

// ═══════════════════════════════════════════════════════════════
// Types (Discord API)
// ═══════════════════════════════════════════════════════════════

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  reactions?: DiscordReaction[];
  nonce?: string | number;
  pinned: boolean;
  webhook_id?: string;
  type: number;
  referenced_message?: DiscordMessage | null;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string | null;
  bot?: boolean;
  system?: boolean;
  global_name?: string | null;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  description?: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url: string;
  height?: number | null;
  width?: number | null;
}

export interface DiscordEmbed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: {
    text: string;
    icon_url?: string;
  };
  image?: {
    url: string;
  };
  thumbnail?: {
    url: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

export interface DiscordReaction {
  count: number;
  me: boolean;
  emoji: {
    id: string | null;
    name: string | null;
  };
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  position?: number;
  name?: string;
  topic?: string | null;
  nsfw?: boolean;
  last_message_id?: string | null;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  recipients?: DiscordUser[];
  icon?: string | null;
  owner_id?: string;
  application_id?: string;
  parent_id?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Discord Bot API Client
// ═══════════════════════════════════════════════════════════════

export class DiscordBot {
  private token: string;
  private apiBase = "https://discord.com/api/v10";

  constructor(token: string) {
    this.token = token;
  }

  private async request(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<any> {
    const headers: Record<string, string> = {
      Authorization: `Bot ${this.token}`,
      "Content-Type": "application/json",
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.apiBase}${endpoint}`, options);

    if (!res.ok) {
      const error = await res.text();
      console.error(`Discord API error (${res.status}):`, error);
      return null;
    }

    return res.json();
  }

  // ─── Send Message ───────────────────────────────────────────────

  async sendMessage(
    channelId: string,
    content: string,
    options?: {
      embeds?: DiscordEmbed[];
      replyTo?: string;
      allowedMentions?: {
        parse?: string[];
        users?: string[];
        roles?: string[];
        replied_user?: boolean;
      };
    }
  ): Promise<DiscordMessage | null> {
    const body: Record<string, unknown> = { content };

    if (options?.embeds) {
      body.embeds = options.embeds;
    }

    if (options?.replyTo) {
      body.message_reference = {
        message_id: options.replyTo,
      };
    }

    if (options?.allowedMentions) {
      body.allowed_mentions = options.allowedMentions;
    }

    return this.request("POST", `/channels/${channelId}/messages`, body);
  }

  // ─── Edit Message ───────────────────────────────────────────────

  async editMessage(
    channelId: string,
    messageId: string,
    content: string,
    embeds?: DiscordEmbed[]
  ): Promise<DiscordMessage | null> {
    const body: Record<string, unknown> = { content };
    if (embeds) {
      body.embeds = embeds;
    }
    return this.request("PATCH", `/channels/${channelId}/messages/${messageId}`, body);
  }

  // ─── Delete Message ─────────────────────────────────────────────

  async deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    const result = await this.request("DELETE", `/channels/${channelId}/messages/${messageId}`);
    return result !== null;
  }

  // ─── Get Channel ────────────────────────────────────────────────

  async getChannel(channelId: string): Promise<DiscordChannel | null> {
    return this.request("GET", `/channels/${channelId}`);
  }

  // ─── Get Guild Channels ─────────────────────────────────────────

  async getGuildChannels(guildId: string): Promise<DiscordChannel[] | null> {
    return this.request("GET", `/guilds/${guildId}/channels`);
  }

  // ─── Create Reaction ────────────────────────────────────────────

  async createReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<boolean> {
    // Emoji should be URL-encoded, e.g., "👍" or "custom_emoji:emoji_id"
    const encodedEmoji = encodeURIComponent(emoji);
    const result = await this.request(
      "PUT",
      `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`
    );
    return result !== null;
  }

  // ─── Get Current Bot User ───────────────────────────────────────

  async getCurrentUser(): Promise<DiscordUser | null> {
    return this.request("GET", "/users/@me");
  }

  // ─── Get Guild ──────────────────────────────────────────────────

  async getGuild(guildId: string): Promise<{
    id: string;
    name: string;
    icon?: string | null;
    description?: string | null;
    owner_id: string;
  } | null> {
    return this.request("GET", `/guilds/${guildId}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function extractMessageContent(message: DiscordMessage): {
  text: string;
  attachments: Array<{ url: string; type: string; name: string }>;
} {
  const text = message.content || "";
  const attachments = message.attachments.map((att) => ({
    url: att.url,
    type: att.content_type || "unknown",
    name: att.filename,
  }));

  return { text, attachments };
}

export function getSenderName(user: DiscordUser): string {
  // Use global_name if available (new Discord display names)
  if (user.global_name) return user.global_name;
  // Fall back to username#discriminator (legacy)
  if (user.discriminator && user.discriminator !== "0") {
    return `${user.username}#${user.discriminator}`;
  }
  // New username system (no discriminator)
  return user.username;
}

export function createEmbed(
  title: string,
  description: string,
  color?: number,
  fields?: Array<{ name: string; value: string; inline?: boolean }>
): DiscordEmbed {
  return {
    title,
    description,
    color: color || 0x5865f2, // Discord blurple
    timestamp: new Date().toISOString(),
    fields,
  };
}

export function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  try {
    // Discord uses Ed25519 signatures for webhook verification
    // Message format: timestamp + body
    const message = timestamp + body;

    // Convert hex strings to buffers
    const signatureBuffer = Buffer.from(signature, "hex");
    const publicKeyBuffer = Buffer.from(publicKey, "hex");

    // Verify using Node.js crypto (supports Ed25519)
    const crypto = require("crypto");
    const key = crypto.createPublicKey({
      key: publicKeyBuffer,
      format: "der",
      type: "spki",
    });

    const isValid = crypto.verify(
      null, // Ed25519 doesn't use a hash algorithm
      Buffer.from(message, "utf8"),
      key,
      signatureBuffer
    );

    return isValid;
  } catch (err) {
    console.error("Discord signature verification failed:", err);
    return false;
  }
}

// Discord channel types
export const DiscordChannelType = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_STAGE_VOICE: 13,
  GUILD_DIRECTORY: 14,
  GUILD_FORUM: 15,
} as const;
