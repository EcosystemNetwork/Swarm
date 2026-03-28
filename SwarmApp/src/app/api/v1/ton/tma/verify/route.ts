/**
 * POST /api/v1/ton/tma/verify
 *
 * Verifies Telegram Mini App initData using HMAC-SHA256.
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Body: { initData: string } — the raw initData string from WebApp.initData
 * Returns: { valid: true, user } | { valid: false, error }
 *
 * Env: TELEGRAM_BOT_TOKEN — required
 */
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
}

function verifyTelegramInitData(initData: string, botToken: string): TelegramUser | null {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    // Build data-check-string: sorted key=value pairs, excluding hash, joined by \n
    const entries: string[] = [];
    for (const [key, value] of params.entries()) {
        if (key !== "hash") entries.push(`${key}=${value}`);
    }
    entries.sort();
    const dataCheckString = entries.join("\n");

    // secret_key = HMAC-SHA256(key="WebAppData", data=bot_token)
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

    // expected_hash = HMAC-SHA256(key=secret_key, data=data_check_string)
    const expectedHash = createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    if (expectedHash !== hash) return null;

    // Check expiry — auth_date must be within 24 hours
    const authDate = parseInt(params.get("auth_date") || "0", 10);
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age >= 86400) return null; // 24h or older

    const userStr = params.get("user");
    if (!userStr) return null;

    try {
        return JSON.parse(decodeURIComponent(userStr)) as TelegramUser;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const { initData } = await req.json() as { initData: string };

        if (!initData) {
            return Response.json({ valid: false, error: "initData is required" }, { status: 400 });
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
            // In dev without a bot token, return a mock verification
            if (process.env.NODE_ENV === "development") {
                return Response.json({
                    valid: true,
                    user: { id: 0, first_name: "Dev", username: "dev_user" },
                    dev: true,
                });
            }
            return Response.json(
                { valid: false, error: "TELEGRAM_BOT_TOKEN not configured" },
                { status: 503 },
            );
        }

        const user = verifyTelegramInitData(initData, botToken);

        if (!user) {
            return Response.json({ valid: false, error: "Invalid or expired initData" }, { status: 401 });
        }

        return Response.json({
            valid: true,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name || null,
                username: user.username || null,
                languageCode: user.language_code || null,
                isPremium: user.is_premium || false,
                photoUrl: user.photo_url || null,
            },
        });
    } catch (err) {
        console.error("[ton/tma/verify]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
