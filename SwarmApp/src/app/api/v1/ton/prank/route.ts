/**
 * TON Prank API
 *
 * POST  — generate a prank sequence (texts, AI images, voice notes)
 * PATCH — send the generated sequence via Telegram Bot API
 *
 * Model routing (in priority order):
 *   Text:  ANTHROPIC_API_KEY → claude-sonnet-4-6  (via fetch, no SDK)
 *          OPENAI_API_KEY    → gpt-4o
 *          GOOGLE_AI_API_KEY → gemini-1.5-flash
 *          (fallback)        → rule-based templates
 *   Image: FAL_KEY           → fal-ai/flux/schnell
 *          OPENAI_API_KEY    → dall-e-3
 *          (fallback)        → placeholder description only
 *   Voice: ELEVENLABS_API_KEY → ElevenLabs TTS
 *          OPENAI_API_KEY     → tts-1
 *          (fallback)        → script text only
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────

type Intensity = "light" | "medium" | "chaotic";

interface PrankMessage {
    type: "text" | "image" | "voice";
    content: string;       // text body / image prompt / voice script
    imageUrl?: string;     // resolved image URL (if generated)
    audioUrl?: string;     // resolved audio URL (if generated)
    delay?: number;        // seconds delay before sending
}

// ─── Config ───────────────────────────────────────────────────

const INTENSITY_CONFIG: Record<Intensity, { messageCount: number; escalation: string }> = {
    light:   { messageCount: 4,  escalation: "Keep it light and funny. The friend should laugh when revealed." },
    medium:  { messageCount: 7,  escalation: "Build tension slowly. Mix friendly small talk with increasingly weird details." },
    chaotic: { messageCount: 12, escalation: "Go all out. Multiple emotional pivots, urgency, cryptic hints, escalating weirdness. Pure chaos." },
};

function buildSystemPrompt(friendName: string, persona: string, scenario: string, intensity: Intensity): string {
    const { messageCount, escalation } = INTENSITY_CONFIG[intensity];
    const agentName = persona || "Sam";
    return `You are a creative prank writer for an AI agent called OpenClaw.

The agent will impersonate a person named "${agentName}" messaging someone named "${friendName}" on Telegram.
The prank scenario: ${scenario}

${escalation}

Generate exactly ${messageCount} messages as a JSON array. Each message must be an object with:
- "type": one of "text", "image", or "voice"
- "content": the text to send (for image: a vivid realistic selfie-style image prompt; for voice: the short script to speak, max 25 words)
- "delay": seconds to wait before sending (0–180, increasing to feel natural)

Rules:
- Sound like a real human — casual typos, abbreviations, emoji are fine
- Mix the 3 types naturally: mostly text, 1–3 images, 1–2 voice notes
- Image prompts must describe a believable casual selfie of a young person in a real location
- Never break character
- Output ONLY valid JSON: {"messages": [...], "summary": "one-sentence description of the prank arc"}`;
}

// ─── Text Generation ──────────────────────────────────────────

async function generateWithClaude(systemPrompt: string): Promise<{ messages: PrankMessage[]; summary: string }> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: "user", content: "Generate the prank sequence now." }],
        }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const data = await res.json();
    const text = data.content?.find((c: { type: string }) => c.type === "text")?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in Claude response");
    return JSON.parse(match[0]);
}

async function generateWithOpenAI(systemPrompt: string): Promise<{ messages: PrankMessage[]; summary: string }> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Generate the prank sequence now." },
            ],
            max_tokens: 2000,
        }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
}

async function generateWithGemini(systemPrompt: string): Promise<{ messages: PrankMessage[]; summary: string }> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt + "\n\nGenerate the prank sequence now." }] }],
                generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2000 },
            }),
        }
    );
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in Gemini response");
    return JSON.parse(match[0]);
}

function fallbackGenerate(friendName: string, scenario: string, intensity: Intensity): { messages: PrankMessage[]; summary: string } {
    const count = INTENSITY_CONFIG[intensity].messageCount;
    const all: PrankMessage[] = [
        { type: "text",  content: `Hey ${friendName}!! omg it's been forever`, delay: 0 },
        { type: "text",  content: "I have something kind of crazy to tell you lol", delay: 20 },
        { type: "image", content: "casual selfie of a young adult in a coffee shop, warm lighting, relaxed smile, realistic photo", delay: 40 },
        { type: "text",  content: "wait are you around rn? I might be near you", delay: 55 },
        { type: "voice", content: "Okay so you literally won't believe what happened, call me when you can", delay: 75 },
        { type: "text",  content: "helloooo did you see my messages 👀", delay: 100 },
        { type: "image", content: "blurry selfie taken while walking on a city street, motion blur, realistic candid photo", delay: 120 },
        { type: "text",  content: "ok nvm I think I have the wrong number 😭 or do I", delay: 135 },
        { type: "text",  content: "this is ${friendName} right??", delay: 150 },
        { type: "voice", content: "I'm standing right outside your building I think, this is so weird", delay: 165 },
        { type: "text",  content: "WAIT", delay: 170 },
        { type: "text",  content: "NEVERMIND lmaoooo I'm an idiot. Surprise though — OpenClaw got you 😂", delay: 175 },
    ];
    return {
        messages: all.slice(0, count),
        summary: `Classic slow-burn prank: ${scenario.slice(0, 60)}`,
    };
}

async function generateMessages(systemPrompt: string, friendName: string, scenario: string, intensity: Intensity) {
    if (process.env.ANTHROPIC_API_KEY) {
        try { return await generateWithClaude(systemPrompt); } catch { /* fall through */ }
    }
    if (process.env.OPENAI_API_KEY) {
        try { return await generateWithOpenAI(systemPrompt); } catch { /* fall through */ }
    }
    if (process.env.GOOGLE_AI_API_KEY) {
        try { return await generateWithGemini(systemPrompt); } catch { /* fall through */ }
    }
    return fallbackGenerate(friendName, scenario, intensity);
}

// ─── Image Generation ─────────────────────────────────────────

async function generateImage(prompt: string): Promise<string | null> {
    if (process.env.FAL_KEY) {
        try {
            const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Key ${process.env.FAL_KEY}` },
                body: JSON.stringify({ prompt, image_size: "portrait_4_3", num_images: 1 }),
            });
            if (res.ok) {
                const data = await res.json();
                return data.images?.[0]?.url || null;
            }
        } catch { /* fall through */ }
    }
    if (process.env.OPENAI_API_KEY) {
        try {
            const res = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" }),
            });
            if (res.ok) {
                const data = await res.json();
                return data.data?.[0]?.url || null;
            }
        } catch { /* fall through */ }
    }
    return null;
}

// ─── Voice Generation ─────────────────────────────────────────

async function generateVoice(script: string): Promise<string | null> {
    if (process.env.ELEVENLABS_API_KEY) {
        try {
            const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
            const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY },
                body: JSON.stringify({
                    text: script,
                    model_id: "eleven_turbo_v2",
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
                }),
            });
            if (res.ok) {
                const buf = await res.arrayBuffer();
                return `data:audio/mpeg;base64,${Buffer.from(buf).toString("base64")}`;
            }
        } catch { /* fall through */ }
    }
    if (process.env.OPENAI_API_KEY) {
        try {
            const res = await fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify({ model: "tts-1", input: script, voice: "nova" }),
            });
            if (res.ok) {
                const buf = await res.arrayBuffer();
                return `data:audio/mpeg;base64,${Buffer.from(buf).toString("base64")}`;
            }
        } catch { /* fall through */ }
    }
    return null;
}

// ─── POST: Generate ──────────────────────────────────────────

export async function POST(req: NextRequest) {
    const { friendName, persona, prompt, useTexts, useImages, useVoice, intensity = "medium" } =
        await req.json() as {
            friendName: string; persona?: string; prompt: string;
            useTexts?: boolean; useImages?: boolean; useVoice?: boolean;
            intensity?: Intensity;
        };

    if (!friendName || !prompt) {
        return NextResponse.json({ error: "friendName and prompt are required" }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(friendName, persona || "", prompt, intensity);
    const raw = await generateMessages(systemPrompt, friendName, prompt, intensity);

    // Filter by user's media selection
    let messages = raw.messages.filter((m) => {
        if (m.type === "text"  && useTexts  === false) return false;
        if (m.type === "image" && useImages === false) return false;
        if (m.type === "voice" && useVoice  === false) return false;
        return true;
    });

    // Generate images and voice in parallel
    messages = await Promise.all(
        messages.map(async (m) => {
            if (m.type === "image") {
                const url = await generateImage(m.content);
                return { ...m, imageUrl: url || undefined };
            }
            if (m.type === "voice") {
                const url = await generateVoice(m.content);
                return { ...m, audioUrl: url || undefined };
            }
            return m;
        })
    );

    return NextResponse.json({ messages, summary: raw.summary });
}

// ─── PATCH: Send via Telegram ────────────────────────────────

export async function PATCH(req: NextRequest) {
    const { messages, telegramUsername, botToken } =
        await req.json() as { messages: PrankMessage[]; telegramUsername: string; botToken: string };

    if (!messages || !telegramUsername || !botToken) {
        return NextResponse.json({ error: "messages, telegramUsername, and botToken are required" }, { status: 400 });
    }

    const sendStatus: Record<number, "sent" | "failed"> = {};
    const chatId = telegramUsername;
    const tgBase = `https://api.telegram.org/bot${botToken}`;

    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        // Cap real-time delay at 3 s server-side (clients see the full delay in preview)
        if (m.delay && m.delay > 0) {
            await new Promise((r) => setTimeout(r, Math.min(m.delay! * 200, 3000)));
        }

        try {
            if (m.type === "text") {
                const res = await fetch(`${tgBase}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, text: m.content }),
                });
                sendStatus[i] = res.ok ? "sent" : "failed";

            } else if (m.type === "image") {
                if (m.imageUrl) {
                    if (m.imageUrl.startsWith("data:")) {
                        const buf = Buffer.from(m.imageUrl.split(",")[1], "base64");
                        const form = new FormData();
                        form.append("chat_id", chatId);
                        form.append("photo", new Blob([buf], { type: "image/png" }), "photo.png");
                        const res = await fetch(`${tgBase}/sendPhoto`, { method: "POST", body: form });
                        sendStatus[i] = res.ok ? "sent" : "failed";
                    } else {
                        const res = await fetch(`${tgBase}/sendPhoto`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ chat_id: chatId, photo: m.imageUrl }),
                        });
                        sendStatus[i] = res.ok ? "sent" : "failed";
                    }
                } else {
                    // No image URL — send the prompt as a caption placeholder
                    const res = await fetch(`${tgBase}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chat_id: chatId, text: `[photo unavailable — add FAL_KEY or OPENAI_API_KEY]` }),
                    });
                    sendStatus[i] = res.ok ? "sent" : "failed";
                }

            } else if (m.type === "voice") {
                if (m.audioUrl) {
                    const buf = Buffer.from(m.audioUrl.split(",")[1], "base64");
                    const form = new FormData();
                    form.append("chat_id", chatId);
                    form.append("voice", new Blob([buf], { type: "audio/ogg" }), "voice.ogg");
                    const res = await fetch(`${tgBase}/sendVoice`, { method: "POST", body: form });
                    sendStatus[i] = res.ok ? "sent" : "failed";
                } else {
                    // No audio — send script as message
                    const res = await fetch(`${tgBase}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chat_id: chatId, text: m.content }),
                    });
                    sendStatus[i] = res.ok ? "sent" : "failed";
                }
            }
        } catch {
            sendStatus[i] = "failed";
        }
    }

    return NextResponse.json({ sendStatus });
}
