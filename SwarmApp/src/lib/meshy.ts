/**
 * Meshy.ai API Client — Canonical Swarm-level integration (server-side only)
 *
 * Wraps the full Meshy REST API surface: text-to-3D, image-to-3D,
 * rigging, animation, task management, and streaming.
 *
 * This is the primary Meshy client used by the /api/meshy/* routes.
 * The Office Sim pipeline at lib/mods/meshy/client.ts is a thin
 * subset focused on avatar generation workflows.
 *
 * Env vars:
 *   MESHY_API_KEY — required, Meshy.ai API key (msy_...)
 */

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

export type MeshyTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELED";

export type MeshyTaskMode = "preview" | "refine";
export type MeshyAiModel = "meshy-5" | "meshy-6" | "latest";
export type MeshyModelType = "standard" | "lowpoly";
export type MeshyTopology = "quad" | "triangle";
export type MeshySymmetryMode = "off" | "auto" | "on";
export type MeshyPoseMode = "a-pose" | "t-pose" | "";
export type MeshyTargetFormat = "glb" | "obj" | "fbx" | "stl" | "usdz";

export interface MeshyModelUrls {
  glb?: string;
  fbx?: string;
  obj?: string;
  mtl?: string;
  usdz?: string;
  stl?: string;
  pre_remeshed_glb?: string;
}

export interface MeshyTextureUrl {
  base_color?: string;
  metallic?: string;
  normal?: string;
  roughness?: string;
}

export interface MeshyTaskError {
  message: string;
}

export interface MeshyTask {
  id: string;
  type?: string;
  mode?: MeshyTaskMode;
  status: MeshyTaskStatus;
  progress: number;
  preceding_tasks?: number;
  prompt?: string;
  negative_prompt?: string;
  texture_prompt?: string;
  texture_image_url?: string;
  model_urls?: MeshyModelUrls;
  thumbnail_url?: string;
  texture_urls?: MeshyTextureUrl[];
  task_error?: MeshyTaskError;
  ai_model?: string;
  model_type?: string;
  topology?: string;
  target_polycount?: number;
  started_at?: number;
  created_at: number;
  finished_at?: number;
  expires_at?: number;
}

export interface MeshyRigTask {
  id: string;
  status: MeshyTaskStatus;
  progress: number;
  rigged_character_glb_url?: string;
  rigged_character_fbx_url?: string;
  basic_animations?: {
    walking_glb_url?: string;
    running_glb_url?: string;
  };
  task_error?: MeshyTaskError;
  started_at?: number;
  created_at?: number;
  finished_at?: number;
}

export interface MeshyAnimationTask {
  id: string;
  status: MeshyTaskStatus;
  progress: number;
  animation_glb_url?: string;
  animation_fbx_url?: string;
  task_error?: MeshyTaskError;
  started_at?: number;
  created_at?: number;
  finished_at?: number;
}

export interface MeshyListResponse<T> {
  data?: T[];
  total_count?: number;
  page_num?: number;
  page_size?: number;
}

/** Text-to-3D preview creation params */
export interface TextTo3DPreviewParams {
  prompt: string;
  negativePrompt?: string;
  aiModel?: MeshyAiModel;
  modelType?: MeshyModelType;
  topology?: MeshyTopology;
  targetPolycount?: number;
  shouldRemesh?: boolean;
  symmetryMode?: MeshySymmetryMode;
  poseMode?: MeshyPoseMode;
  targetFormats?: MeshyTargetFormat[];
  autoSize?: boolean;
  originAt?: "bottom" | "center";
}

/** Text-to-3D refine creation params */
export interface TextTo3DRefineParams {
  previewTaskId: string;
  texturePrompt?: string;
  textureImageUrl?: string;
  enablePbr?: boolean;
  aiModel?: MeshyAiModel;
  targetFormats?: MeshyTargetFormat[];
  removeLighting?: boolean;
  autoSize?: boolean;
  originAt?: "bottom" | "center";
}

/** Image-to-3D creation params */
export interface ImageTo3DParams {
  imageUrl: string;
  aiModel?: MeshyAiModel;
  modelType?: MeshyModelType;
  topology?: MeshyTopology;
  targetPolycount?: number;
  symmetryMode?: MeshySymmetryMode;
  shouldRemesh?: boolean;
  shouldTexture?: boolean;
  enablePbr?: boolean;
  poseMode?: MeshyPoseMode;
  texturePrompt?: string;
  textureImageUrl?: string;
  imageEnhancement?: boolean;
  removeLighting?: boolean;
  targetFormats?: MeshyTargetFormat[];
  autoSize?: boolean;
  originAt?: "bottom" | "center";
}

/** Health check result */
export interface MeshyHealthResult {
  ok: boolean;
  configured: boolean;
  latencyMs?: number;
  error?: string;
}

/* ═══════════════════════════════════════
   Constants
   ═══════════════════════════════════════ */

const MESHY_BASE = "https://api.meshy.ai/openapi";
const DEFAULT_TIMEOUT = 30_000;

/** Pre-defined animation IDs from Meshy's library */
export const MESHY_ANIMATIONS = {
  idle: 0,
  walking: 1,
  running: 2,
  sit_idle_f: 32,
  sit_idle_m: 33,
  talking: 285,
  waving: 3,
  dancing: 14,
  jumping: 8,
} as const;

export type MeshyAnimationName = keyof typeof MESHY_ANIMATIONS;

/** Default AI model */
export const DEFAULT_AI_MODEL: MeshyAiModel = "meshy-6";

/** Default target formats */
export const DEFAULT_TARGET_FORMATS: MeshyTargetFormat[] = ["glb"];

/** Recommended polycount ranges */
export const POLYCOUNT_PRESETS = [
  { label: "Low (10K)", value: 10000 },
  { label: "Medium (30K)", value: 30000 },
  { label: "High (100K)", value: 100000 },
  { label: "Ultra (300K)", value: 300000 },
];

/* ═══════════════════════════════════════
   Core helpers
   ═══════════════════════════════════════ */

function getApiKey(): string {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY is not set");
  return key;
}

export function isMeshyConfigured(): boolean {
  return !!process.env.MESHY_API_KEY;
}

async function meshyFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${MESHY_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Meshy API ${res.status}: ${body}`);
    }

    // Handle 204 No Content (e.g. DELETE)
    if (res.status === 204) return undefined as T;

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════
   Text-to-3D
   ═══════════════════════════════════════ */

/** Create a text-to-3D preview task (mesh only, no texture) */
export async function createTextTo3DPreview(params: TextTo3DPreviewParams): Promise<string> {
  const data = await meshyFetch<{ result: string }>("/v2/text-to-3d", {
    method: "POST",
    body: JSON.stringify({
      mode: "preview",
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      ai_model: params.aiModel || DEFAULT_AI_MODEL,
      model_type: params.modelType || "standard",
      topology: params.topology || "triangle",
      target_polycount: params.targetPolycount || 30000,
      should_remesh: params.shouldRemesh,
      symmetry_mode: params.symmetryMode || "auto",
      pose_mode: params.poseMode || "",
      target_formats: params.targetFormats || DEFAULT_TARGET_FORMATS,
      auto_size: params.autoSize,
      origin_at: params.originAt,
    }),
  });
  return data.result;
}

/** Create a text-to-3D refine task (adds textures to a completed preview) */
export async function createTextTo3DRefine(params: TextTo3DRefineParams): Promise<string> {
  const data = await meshyFetch<{ result: string }>("/v2/text-to-3d", {
    method: "POST",
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: params.previewTaskId,
      texture_prompt: params.texturePrompt,
      texture_image_url: params.textureImageUrl,
      enable_pbr: params.enablePbr ?? true,
      ai_model: params.aiModel || DEFAULT_AI_MODEL,
      target_formats: params.targetFormats || DEFAULT_TARGET_FORMATS,
      remove_lighting: params.removeLighting,
      auto_size: params.autoSize,
      origin_at: params.originAt,
    }),
  });
  return data.result;
}

/** Get a text-to-3D task by ID */
export async function getTextTo3DTask(taskId: string): Promise<MeshyTask> {
  return meshyFetch<MeshyTask>(`/v2/text-to-3d/${taskId}`);
}

/** List text-to-3D tasks with pagination */
export async function listTextTo3DTasks(
  pageNum = 1,
  pageSize = 10,
  sortBy: "+created_at" | "-created_at" = "-created_at",
): Promise<MeshyTask[]> {
  const params = new URLSearchParams({
    page_num: String(pageNum),
    page_size: String(Math.min(pageSize, 50)),
    sort_by: sortBy,
  });
  // Meshy returns an array directly for v2 list
  const data = await meshyFetch<MeshyTask[]>(`/v2/text-to-3d?${params}`);
  return Array.isArray(data) ? data : [];
}

/** Delete a text-to-3D task */
export async function deleteTextTo3DTask(taskId: string): Promise<void> {
  await meshyFetch(`/v2/text-to-3d/${taskId}`, { method: "DELETE" });
}

/* ═══════════════════════════════════════
   Image-to-3D
   ═══════════════════════════════════════ */

/** Create an image-to-3D task */
export async function createImageTo3D(params: ImageTo3DParams): Promise<string> {
  const data = await meshyFetch<{ result: string }>("/v1/image-to-3d", {
    method: "POST",
    body: JSON.stringify({
      image_url: params.imageUrl,
      ai_model: params.aiModel || DEFAULT_AI_MODEL,
      model_type: params.modelType || "standard",
      topology: params.topology || "triangle",
      target_polycount: params.targetPolycount || 30000,
      symmetry_mode: params.symmetryMode || "auto",
      should_remesh: params.shouldRemesh,
      should_texture: params.shouldTexture ?? true,
      enable_pbr: params.enablePbr,
      pose_mode: params.poseMode || "",
      texture_prompt: params.texturePrompt,
      texture_image_url: params.textureImageUrl,
      image_enhancement: params.imageEnhancement ?? true,
      remove_lighting: params.removeLighting ?? true,
      target_formats: params.targetFormats || DEFAULT_TARGET_FORMATS,
      auto_size: params.autoSize,
      origin_at: params.originAt,
    }),
  });
  return data.result;
}

/** Get an image-to-3D task by ID */
export async function getImageTo3DTask(taskId: string): Promise<MeshyTask> {
  return meshyFetch<MeshyTask>(`/v1/image-to-3d/${taskId}`);
}

/** List image-to-3D tasks with pagination */
export async function listImageTo3DTasks(
  pageNum = 1,
  pageSize = 10,
  sortBy: "+created_at" | "-created_at" = "-created_at",
): Promise<MeshyTask[]> {
  const params = new URLSearchParams({
    page_num: String(pageNum),
    page_size: String(Math.min(pageSize, 50)),
    sort_by: sortBy,
  });
  const data = await meshyFetch<MeshyTask[]>(`/v1/image-to-3d?${params}`);
  return Array.isArray(data) ? data : [];
}

/** Delete an image-to-3D task */
export async function deleteImageTo3DTask(taskId: string): Promise<void> {
  await meshyFetch(`/v1/image-to-3d/${taskId}`, { method: "DELETE" });
}

/* ═══════════════════════════════════════
   Rigging
   ═══════════════════════════════════════ */

/** Create a rigging task from a completed text-to-3D or image-to-3D task */
export async function createRigTask(inputTaskId: string): Promise<string> {
  const data = await meshyFetch<{ result: string }>("/v1/rigging", {
    method: "POST",
    body: JSON.stringify({ input_task_id: inputTaskId }),
  });
  return data.result;
}

/** Get a rigging task by ID */
export async function getRigTask(taskId: string): Promise<MeshyRigTask> {
  return meshyFetch<MeshyRigTask>(`/v1/rigging/${taskId}`);
}

/* ═══════════════════════════════════════
   Animation
   ═══════════════════════════════════════ */

/** Create an animation task from a rigged model */
export async function createAnimationTask(
  rigTaskId: string,
  actionId: number,
): Promise<string> {
  const data = await meshyFetch<{ result: string }>("/v1/animations", {
    method: "POST",
    body: JSON.stringify({
      rig_task_id: rigTaskId,
      action_id: actionId,
    }),
  });
  return data.result;
}

/** Get an animation task by ID */
export async function getAnimationTask(taskId: string): Promise<MeshyAnimationTask> {
  return meshyFetch<MeshyAnimationTask>(`/v1/animations/${taskId}`);
}

/* ═══════════════════════════════════════
   Model Download
   ═══════════════════════════════════════ */

/** Download a model file as a buffer */
export async function downloadModel(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download model: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Download a thumbnail image */
export async function downloadThumbnail(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download thumbnail: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type") || "image/png",
  };
}

/* ═══════════════════════════════════════
   SSE Streaming
   ═══════════════════════════════════════ */

/**
 * Create an SSE stream URL for a text-to-3D task.
 * The caller connects to this URL with EventSource.
 * Server-side relay needed since the browser shouldn't have the API key.
 */
export function getTextTo3DStreamUrl(taskId: string): string {
  return `${MESHY_BASE}/v2/text-to-3d/${taskId}/stream`;
}

/** Create an SSE stream URL for an image-to-3D task */
export function getImageTo3DStreamUrl(taskId: string): string {
  return `${MESHY_BASE}/v1/image-to-3d/${taskId}/stream`;
}

/**
 * Open an SSE connection to Meshy for real-time task updates.
 * Returns an async iterable of MeshyTask updates.
 * Must be consumed server-side (has API key in headers).
 */
export async function* streamTaskUpdates(
  taskType: "text-to-3d" | "image-to-3d",
  taskId: string,
): AsyncGenerator<MeshyTask> {
  const version = taskType === "text-to-3d" ? "v2" : "v1";
  const url = `${MESHY_BASE}/${version}/${taskType}/${taskId}/stream`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      Accept: "text/event-stream",
    },
  });

  if (!res.ok) {
    throw new Error(`Meshy SSE ${res.status}: ${await res.text().catch(() => "")}`);
  }

  if (!res.body) throw new Error("No response body for SSE stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr) {
            try {
              yield JSON.parse(jsonStr) as MeshyTask;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ═══════════════════════════════════════
   Health Check
   ═══════════════════════════════════════ */

/** Check Meshy connectivity by listing tasks with minimal page size */
export async function healthCheck(): Promise<MeshyHealthResult> {
  if (!isMeshyConfigured()) {
    return { ok: false, configured: false, error: "MESHY_API_KEY not set" };
  }

  const start = Date.now();
  try {
    await listTextTo3DTasks(1, 1);
    return {
      ok: true,
      configured: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
