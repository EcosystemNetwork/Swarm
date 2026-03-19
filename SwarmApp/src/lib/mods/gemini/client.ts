/**
 * Gemini Live Agent — Server-side client
 *
 * Uses the Google GenAI SDK (@google/genai) as recommended by Google
 * for production Gemini API access.
 */

import type { GeminiAnalysis, GeminiPlan } from "./types";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-04-17";

/**
 * Lazy-initialise the Google GenAI client.
 * Throws at call time (not import time) if the key is missing.
 */
function getClient() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENAI_API_KEY is not set");

  // Dynamic import so the module tree-shakes when not used
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleGenAI } = require("@google/genai") as typeof import("@google/genai");
  return new GoogleGenAI({ apiKey });
}

/**
 * Analyze a screenshot and describe the UI state.
 */
export async function analyzeScreenshot(
  screenshotBase64: string,
  task: string,
): Promise<GeminiAnalysis> {
  const ai = getClient();

  const prompt = `You are a UI analysis agent. A user has provided a screenshot of a web page and a task they want to accomplish.

Task: ${task}

Analyze the screenshot and respond with a JSON object (no markdown fences) containing:
{
  "summary": "Brief description of what's visible on screen",
  "elements": [
    { "label": "Element name", "type": "button|input|link|text|image|menu|other", "description": "What it does", "interactable": true }
  ],
  "suggestedAction": "The single most helpful next action to accomplish the task",
  "confidence": 0.85
}

Focus on elements relevant to the task. List at most 10 elements.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: screenshotBase64 } },
        ],
      },
    ],
  });

  const text = response.text ?? "";
  try {
    return JSON.parse(text.replace(/```json\n?|```/g, "").trim());
  } catch {
    return {
      summary: text.slice(0, 500),
      elements: [],
      suggestedAction: "Unable to parse structured response",
      confidence: 0,
    };
  }
}

/**
 * Create an action plan from a screenshot + task + optional history.
 */
export async function createPlan(
  screenshotBase64: string,
  task: string,
  history?: string,
): Promise<GeminiPlan> {
  const ai = getClient();

  const historySection = history ? `\nPrior actions taken:\n${history}` : "";

  const prompt = `You are a UI automation planner. Given a screenshot and a task, produce a step-by-step action plan.

Task: ${task}${historySection}

Respond with a JSON object (no markdown fences):
{
  "task": "The task restated clearly",
  "reasoning": "Brief explanation of your approach",
  "actions": [
    { "type": "click|type|scroll|navigate|wait|screenshot|bash", "target": "Element description", "value": "optional value to type", "description": "What this step does", "confidence": 0.9 }
  ],
  "estimatedSteps": 3
}

Keep the plan to at most 8 actions. Be specific about targets.`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];
  if (screenshotBase64) {
    parts.push({ inlineData: { mimeType: "image/png", data: screenshotBase64 } });
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
  });

  const text = response.text ?? "";
  try {
    return JSON.parse(text.replace(/```json\n?|```/g, "").trim());
  } catch {
    return {
      task,
      reasoning: text.slice(0, 500),
      actions: [],
      estimatedSteps: 0,
    };
  }
}

