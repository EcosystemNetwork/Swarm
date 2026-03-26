/** Avatar Generation — Type definitions for Meshy.ai + ComfyUI character design pipeline */

/* ═══════════════════════════════════════
   Generation Status
   ═══════════════════════════════════════ */

export type AvatarGenerationStatus =
  | "pending"
  | "generating_3d"
  | "refining_3d"
  | "rigging"
  | "animating"
  | "generating_2d"
  | "uploading"
  | "completed"
  | "partial"
  | "failed";

/* ═══════════════════════════════════════
   Generation Task (Firestore document)
   ═══════════════════════════════════════ */

export interface MeshyPipelineState {
  previewTaskId?: string;
  refineTaskId?: string;
  rigTaskId?: string;
  animationTaskIds?: Record<string, string>; // animName -> Meshy taskId
  status: "pending" | "preview" | "refine" | "rig" | "animate" | "uploading" | "done" | "failed";
  error?: string;
  progress?: number;
  /** Temporary Meshy download URL (retained 3 days) */
  glbUrl?: string;
  /** Permanent Storacha CID after upload */
  storachaCid?: string;
  /** Storacha gateway URL for the base rigged model */
  gatewayUrl?: string;
  /** Per-animation CIDs and gateway URLs */
  animationGlbs?: Record<string, { cid: string; gatewayUrl: string }>;
}

export interface ComfyUIPipelineState {
  promptId?: string;
  /** Prompt ID for the sprite sheet generation (animated walk cycle) */
  spriteSheetPromptId?: string;
  status: "pending" | "generating" | "generating_sheet" | "uploading" | "uploading_sheet" | "done" | "failed";
  error?: string;
  progress?: number;
  /** Temporary ComfyUI output URL (static sprite) */
  pngUrl?: string;
  /** Temporary ComfyUI output URL (sprite sheet) */
  sheetPngUrl?: string;
  /** Permanent Storacha CID (static sprite) */
  storachaCid?: string;
  /** Storacha gateway URL (static sprite) */
  gatewayUrl?: string;
  /** Permanent Storacha CID (sprite sheet) */
  sheetStorachaCid?: string;
  /** Storacha gateway URL (sprite sheet) */
  sheetGatewayUrl?: string;
}

export interface AvatarGenerationTask {
  id: string;
  orgId: string;
  agentId: string;
  prompt: string;
  requestedBy: string; // wallet address or agentId
  status: AvatarGenerationStatus;
  pipelines: ("3d" | "2d")[];

  meshy?: MeshyPipelineState;
  comfyui?: ComfyUIPipelineState;

  createdAt: unknown; // serverTimestamp
  updatedAt: unknown;
  completedAt?: unknown;
}

/* ═══════════════════════════════════════
   Resolved Avatar Data (consumed by components)
   ═══════════════════════════════════════ */

export interface AgentAvatarData {
  agentId: string;
  /** Storacha gateway URL to the base rigged GLB */
  modelUrl?: string;
  /** Per-animation GLB gateway URLs keyed by animation name */
  animationUrls?: Record<string, string>;
  /** Storacha gateway URL to the pixel art PNG (static) */
  spriteUrl?: string;
  /** Storacha gateway URL to the animated sprite sheet PNG */
  spriteSheetUrl?: string;
  /** Original prompt used to generate */
  prompt?: string;
  generatedAt?: number;
}
