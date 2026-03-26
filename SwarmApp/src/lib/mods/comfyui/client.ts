/**
 * ComfyUI API Client — Server-side only
 *
 * Supports configurable endpoint (self-hosted or managed service).
 * Generates pixel art character sprites via workflow JSON submission.
 */

import type { ComfyUIPromptResponse, ComfyUIHistoryEntry } from "./types";

function getEndpoint(): string {
  const url = process.env.COMFYUI_ENDPOINT;
  if (!url) throw new Error("COMFYUI_ENDPOINT is not set");
  return url.replace(/\/$/, "");
}

export function isComfyUIConfigured(): boolean {
  return !!process.env.COMFYUI_ENDPOINT;
}

/* ═══════════════════════════════════════
   Submit pixel art workflow
   ═══════════════════════════════════════ */

export async function submitPixelArtWorkflow(
  prompt: string,
  size: 32 | 64 = 64,
): Promise<string> {
  const endpoint = getEndpoint();

  // Build the workflow with the user prompt wrapped in pixel art style tokens
  const styledPrompt = `pixel art character sprite, ${prompt}, 8-bit style, front-facing, retro pixel art, game asset, transparent background, single character, centered, ${size}x${size}`;
  const negativePrompt = "blurry, realistic, photograph, 3d render, multiple characters, text, watermark, frame, border";

  // Minimal ComfyUI workflow: KSampler → VAEDecode → SaveImage
  const workflow: Record<string, unknown> = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: process.env.COMFYUI_CHECKPOINT || "sd_xl_base_1.0.safetensors",
      },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: styledPrompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: size * 8, height: size * 8, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 25,
        cfg: 7.5,
        sampler_name: "euler_ancestral",
        scheduler: "normal",
        denoise: 1.0,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "avatar" },
    },
  };

  const clientId = crypto.randomUUID();

  const res = await fetch(`${endpoint}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ComfyUI submit failed ${res.status}: ${body}`);
  }

  const data: ComfyUIPromptResponse = await res.json();
  return data.prompt_id;
}

/* ═══════════════════════════════════════
   Submit sprite sheet workflow (animated)
   ═══════════════════════════════════════ */

/**
 * Generate a 10-row × 6-frame expanded sprite sheet with all animation types.
 *
 * Output: 288×640 PNG (48px × 6 cols, 64px × 10 rows).
 *
 * Rows:
 *   0: Walk Down     (6 frames)     4: Idle       (6 frames)     8: Error    (6 frames)
 *   1: Walk Left     (6 frames)     5: Working    (6 frames)     9: Spawning (6 frames)
 *   2: Walk Right    (6 frames)     6: Thinking   (6 frames)
 *   3: Walk Up       (6 frames)     7: Talking    (6 frames)
 */
export async function submitSpriteSheetWorkflow(
  prompt: string,
  frameW: number = 48,
  frameH: number = 64,
  cols: number = 6,
  rows: number = 10,
): Promise<string> {
  const endpoint = getEndpoint();

  const totalW = frameW * cols; // 288
  const totalH = frameH * rows; // 640

  const styledPrompt = [
    `pixel art character sprite sheet, ${prompt},`,
    `organized ${cols}x${rows} grid of animation frames,`,
    `row 1: walk cycle facing down (${cols} frames),`,
    `row 2: walk cycle facing left (${cols} frames),`,
    `row 3: walk cycle facing right (${cols} frames),`,
    `row 4: walk cycle facing up (${cols} frames),`,
    `row 5: idle standing animation (${cols} frames subtle breathing),`,
    `row 6: sitting typing at desk animation (${cols} frames),`,
    `row 7: thinking pose hand on chin animation (${cols} frames),`,
    `row 8: talking gesturing animation (${cols} frames),`,
    `row 9: alarmed error reaction animation (${cols} frames),`,
    `row 10: spawning materializing glow animation (${cols} frames),`,
    `RPG game asset, transparent background, consistent character across all frames,`,
    `retro pixel art, 8-bit style, ${totalW}x${totalH}`,
  ].join(" ");
  const negativePrompt = "blurry, realistic, photograph, 3d render, text, watermark, frame, border, single frame only, random poses, inconsistent character";

  const workflow: Record<string, unknown> = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: process.env.COMFYUI_CHECKPOINT || "sd_xl_base_1.0.safetensors",
      },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: styledPrompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      // Generate at upscaled resolution for quality
      inputs: { width: totalW * 4, height: totalH * 2, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 35,
        cfg: 8.5,
        sampler_name: "euler_ancestral",
        scheduler: "normal",
        denoise: 1.0,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "spritesheet" },
    },
  };

  const clientId = crypto.randomUUID();

  const res = await fetch(`${endpoint}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ComfyUI sprite sheet submit failed ${res.status}: ${body}`);
  }

  const data: ComfyUIPromptResponse = await res.json();
  return data.prompt_id;
}

/* ═══════════════════════════════════════
   Poll prompt status
   ═══════════════════════════════════════ */

export async function getPromptStatus(
  promptId: string,
): Promise<{
  status: "pending" | "running" | "completed" | "failed";
  filename?: string;
}> {
  const endpoint = getEndpoint();

  const res = await fetch(`${endpoint}/history/${promptId}`);
  if (!res.ok) {
    if (res.status === 404) return { status: "pending" };
    throw new Error(`ComfyUI status check failed: ${res.status}`);
  }

  const data: Record<string, ComfyUIHistoryEntry> = await res.json();
  const entry = data[promptId];

  if (!entry) return { status: "pending" };
  if (!entry.status.completed) return { status: "running" };

  // Find the output image filename
  for (const nodeOutput of Object.values(entry.outputs)) {
    if (nodeOutput.images && nodeOutput.images.length > 0) {
      return {
        status: "completed",
        filename: nodeOutput.images[0].filename,
      };
    }
  }

  return { status: "failed" };
}

/* ═══════════════════════════════════════
   Download generated image
   ═══════════════════════════════════════ */

export async function getGeneratedImage(
  filename: string,
): Promise<Buffer> {
  const endpoint = getEndpoint();

  const res = await fetch(
    `${endpoint}/view?filename=${encodeURIComponent(filename)}`,
  );
  if (!res.ok) {
    throw new Error(`ComfyUI image download failed: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
