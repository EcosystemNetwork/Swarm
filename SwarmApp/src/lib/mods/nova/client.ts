/**
 * Amazon Nova Operator — Server-side client
 *
 * Uses the AWS SDK for Bedrock Runtime to invoke Amazon Nova models.
 * Nova Act (browser-based UI workflow automation) framing.
 */

import type { NovaPlan, NovaWorkflowStep } from "./types";

const NOVA_MODEL_ID = process.env.NOVA_MODEL_ID || "amazon.nova-lite-v1:0";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

/**
 * Lazy-initialise the Bedrock Runtime client.
 */
function getClient() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime") as typeof import("@aws-sdk/client-bedrock-runtime");
  return new BedrockRuntimeClient({
    region: AWS_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Create a workflow plan for a given goal.
 */
export async function createWorkflowPlan(
  goal: string,
  pageUrl?: string,
  screenshotBase64?: string,
): Promise<NovaPlan> {
  const client = getClient();

  const contextParts: string[] = [];
  if (pageUrl) contextParts.push(`Current page URL: ${pageUrl}`);
  if (screenshotBase64) contextParts.push("A screenshot of the current page is provided.");
  const context = contextParts.length > 0 ? `\nContext:\n${contextParts.join("\n")}` : "";

  const prompt = `You are an AI operator that automates browser-based UI workflows. Given a goal, produce a step-by-step workflow plan.

Goal: ${goal}${context}

Respond with a JSON object (no markdown fences):
{
  "workflowId": "wf_<random_8_chars>",
  "goal": "The goal restated",
  "reasoning": "Brief approach explanation",
  "steps": [
    {
      "step": 1,
      "action": { "type": "click|type|scroll|navigate|wait|screenshot|bash", "target": "element", "value": "optional", "description": "what this does", "confidence": 0.9 },
      "status": "pending"
    }
  ],
  "estimatedDurationMs": 5000
}

Keep to at most 10 steps. Be specific and practical.`;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime") as typeof import("@aws-sdk/client-bedrock-runtime");

  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 2048, temperature: 0.3 },
  };

  // Add screenshot as image if available
  if (screenshotBase64) {
    (body.messages as Array<Record<string, unknown>>)[0].content = [
      { text: prompt },
      { image: { format: "png", source: { bytes: screenshotBase64 } } },
    ];
  }

  try {
    const command = new InvokeModelCommand({
      modelId: NOVA_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    });

    const response = await client.send(command);
    const responseText = new TextDecoder().decode(response.body);
    const parsed = JSON.parse(responseText);
    const text = parsed.output?.message?.content?.[0]?.text || parsed.content?.[0]?.text || responseText;
    return JSON.parse(text.replace(/```json\n?|```/g, "").trim());
  } catch (err) {
    console.error("[nova/plan] Bedrock call failed:", err);
    // Return a fallback plan
    const workflowId = `wf_${Math.random().toString(36).slice(2, 10)}`;
    return {
      workflowId,
      goal,
      reasoning: `Failed to reach Nova model (${(err as Error).message}). Generating fallback plan.`,
      steps: parseFallbackSteps(goal),
      estimatedDurationMs: 3000,
    };
  }
}

/**
 * Generate a sensible fallback plan when the model is unavailable.
 */
function parseFallbackSteps(goal: string): NovaWorkflowStep[] {
  const words = goal.toLowerCase();
  const steps: NovaWorkflowStep[] = [];
  let stepNum = 1;

  if (words.includes("open") || words.includes("navigate") || words.includes("go to")) {
    steps.push({
      step: stepNum++,
      action: { type: "navigate", target: "target page", description: "Navigate to the target page", confidence: 0.8 },
      status: "pending",
    });
  }

  steps.push({
    step: stepNum++,
    action: { type: "screenshot", description: "Capture current page state", confidence: 0.95 },
    status: "pending",
  });

  if (words.includes("find") || words.includes("search") || words.includes("look")) {
    steps.push({
      step: stepNum++,
      action: { type: "scroll", target: "page", description: "Scan the page for the target element", confidence: 0.7 },
      status: "pending",
    });
  }

  if (words.includes("click") || words.includes("select") || words.includes("open")) {
    steps.push({
      step: stepNum++,
      action: { type: "click", target: "target element", description: "Click the identified element", confidence: 0.75 },
      status: "pending",
    });
  }

  if (words.includes("type") || words.includes("enter") || words.includes("fill")) {
    steps.push({
      step: stepNum++,
      action: { type: "type", target: "input field", value: "user input", description: "Enter text into the field", confidence: 0.7 },
      status: "pending",
    });
  }

  steps.push({
    step: stepNum,
    action: { type: "screenshot", description: "Capture final state for verification", confidence: 0.95 },
    status: "pending",
  });

  return steps;
}
