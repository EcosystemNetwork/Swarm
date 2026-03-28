/**
 * TON Prank API
 *
 * POST  — generate a prank sequence by invoking the TON agent on the hub
 * PATCH — send the generated sequence via Telegram Bot API
 *
 * Uses POST /agents/:agentId/invoke on the hub — the agent processes
 * the prompt with its own model + tools and returns the result.
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────

type Intensity = "light" | "medium" | "chaotic";

interface PrankMessage {
    type: "text";
    content: string;
    delay?: number;
}

// ─── Config ───────────────────────────────────────────────────

const HUB_URL = process.env.HUB_URL || process.env.NEXT_PUBLIC_HUB_URL || "https://swarmprotocol.fun";
const TON_AGENT_ID = process.env.TON_AGENT_ID || "ton-agent";

const INTENSITY_CONFIG: Record<Intensity, { messageCount: number; escalation: string }> = {
    light:   { messageCount: 4,  escalation: "Keep it light and funny. The friend should laugh when revealed." },
    medium:  { messageCount: 7,  escalation: "Build tension slowly. Mix friendly small talk with increasingly weird details." },
    chaotic: { messageCount: 12, escalation: "Go all out. Multiple emotional pivots, urgency, cryptic hints, escalating weirdness. Pure chaos." },
};

function buildPrompt(friendName: string, persona: string, scenario: string, intensity: Intensity): string {
    const { messageCount, escalation } = INTENSITY_CONFIG[intensity];
    const agentName = persona || "Sam";
    return `You are a creative prank writer for an AI agent called OpenClaw.

The agent will impersonate a person named "${agentName}" messaging someone named "${friendName}" on Telegram.
The prank scenario: ${scenario}

${escalation}

Generate exactly ${messageCount} messages as a JSON array. Each message must be an object with:
- "type": always "text"
- "content": the text to send
- "delay": seconds to wait before sending (0–180, increasing to feel natural)

Rules:
- Sound like a real human — casual typos, abbreviations, emoji are fine
- Never break character
- Output ONLY valid JSON: {"messages": [...], "summary": "one-sentence description of the prank arc"}

Generate the prank sequence now.`;
}

// ─── Hub invoke ───────────────────────────────────────────────

async function invokeAgent(prompt: string): Promise<{ messages: PrankMessage[]; summary: string }> {
    const url = `${HUB_URL}/agents/${TON_AGENT_ID}/invoke`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // Use internal secret for same-origin calls (server → hub)
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (secret) {
        headers["x-internal-secret"] = secret;
    }

    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Hub invoke error (${res.status}): ${err}`);
    }

    const data = await res.json();
    if (!data.ok || !data.result) {
        throw new Error("Agent returned no result");
    }

    // The agent's result should be the JSON object directly,
    // or a string containing JSON that we need to parse
    if (typeof data.result === "string") {
        const match = data.result.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON in agent response");
        return JSON.parse(match[0]);
    }

    return data.result;
}

// ─── Fallback (agent offline) ────────────────────────────────

function fallbackGenerate(friendName: string, scenario: string, intensity: Intensity): { messages: PrankMessage[]; summary: string } {
    const count = INTENSITY_CONFIG[intensity].messageCount;
    const all: PrankMessage[] = [
        { type: "text", content: `Hey ${friendName}!! omg it's been forever`, delay: 0 },
        { type: "text", content: "I have something kind of crazy to tell you lol", delay: 20 },
        { type: "text", content: "wait are you around rn? I might be near you", delay: 40 },
        { type: "text", content: "helloooo did you see my messages 👀", delay: 55 },
        { type: "text", content: "ok nvm I think I have the wrong number 😭 or do I", delay: 75 },
        { type: "text", content: `this is ${friendName} right??`, delay: 90 },
        { type: "text", content: "WAIT", delay: 100 },
        { type: "text", content: "I'm standing right outside your building I think, this is so weird", delay: 115 },
        { type: "text", content: "ok actually I'm lost lmaooo", delay: 130 },
        { type: "text", content: "you know what forget it", delay: 145 },
        { type: "text", content: "...", delay: 160 },
        { type: "text", content: "NEVERMIND lmaoooo I'm an idiot. Surprise though — OpenClaw got you 😂", delay: 175 },
    ];
    return {
        messages: all.slice(0, count),
        summary: `Classic slow-burn prank: ${scenario.slice(0, 60)}`,
    };
}

// ─── POST: Generate ──────────────────────────────────────────

export async function POST(req: NextRequest) {
    const { friendName, persona, prompt, intensity = "medium" } =
        await req.json() as {
            friendName: string; persona?: string; prompt: string;
            intensity?: Intensity;
        };

    if (!friendName || !prompt) {
        return NextResponse.json({ error: "friendName and prompt are required" }, { status: 400 });
    }

    const agentPrompt = buildPrompt(friendName, persona || "", prompt, intensity);

    let result: { messages: PrankMessage[]; summary: string };
    try {
        result = await invokeAgent(agentPrompt);
    } catch {
        result = fallbackGenerate(friendName, prompt, intensity);
    }

    return NextResponse.json({ messages: result.messages, summary: result.summary });
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
        if (m.delay && m.delay > 0) {
            await new Promise((r) => setTimeout(r, Math.min(m.delay! * 200, 3000)));
        }

        try {
            const res = await fetch(`${tgBase}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: m.content }),
            });
            sendStatus[i] = res.ok ? "sent" : "failed";
        } catch {
            sendStatus[i] = "failed";
        }
    }

    return NextResponse.json({ sendStatus });
}
