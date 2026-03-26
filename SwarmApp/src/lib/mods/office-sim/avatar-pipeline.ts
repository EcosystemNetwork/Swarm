/**
 * Avatar Pipeline Orchestrator — Client-driven state machine
 *
 * Architecture: Since Netlify serverless has a 10s timeout, the pipeline cannot
 * run end-to-end in one request. Instead, each poll of the status endpoint
 * calls `advancePipeline(task)` which checks the current state and advances
 * one step if the previous step completed. Each poll makes at most one
 * external API call, keeping response times under 10s.
 *
 * The 3D (Meshy) and 2D (ComfyUI) pipelines run independently.
 */

import {
  createPreview,
  refineModel,
  rigModel,
  generateAnimation,
  getTextTo3DStatus,
  getRigStatus,
  getAnimationStatus,
  downloadModel,
  isMeshyConfigured,
} from "@/lib/mods/meshy/client";
import { OFFICE_ANIMATIONS } from "@/lib/mods/meshy/types";
import type { OfficeAnimationName } from "@/lib/mods/meshy/types";
import {
  submitPixelArtWorkflow,
  submitSpriteSheetWorkflow,
  getPromptStatus,
  getGeneratedImage,
  isComfyUIConfigured,
} from "@/lib/mods/comfyui/client";
import { uploadContent, buildRetrievalUrl, isStorachaConfigured } from "@/lib/storacha/client";
import { recordCidLink } from "@/lib/storacha/cid-index";
import { updateAvatarTask } from "@/components/mods/office-sim/studio/avatar-firestore";
import type {
  AvatarGenerationTask,
  MeshyPipelineState,
  ComfyUIPipelineState,
  AvatarGenerationStatus,
} from "@/components/mods/office-sim/studio/avatar-types";

/* ═══════════════════════════════════════
   Main entry — advance both pipelines
   ═══════════════════════════════════════ */

export async function advancePipeline(
  task: AvatarGenerationTask,
): Promise<AvatarGenerationTask> {
  const updated = { ...task };

  try {
    // Advance 3D pipeline if included
    if (task.pipelines.includes("3d") && isMeshyConfigured()) {
      const meshy = await advance3D(task);
      updated.meshy = meshy;
    }

    // Advance 2D pipeline if included
    if (task.pipelines.includes("2d") && isComfyUIConfigured()) {
      const comfyui = await advance2D(task);
      updated.comfyui = comfyui;
    }

    // Compute overall status
    updated.status = computeOverallStatus(updated);

    // Persist to Firestore
    await updateAvatarTask(task.id, {
      status: updated.status,
      meshy: updated.meshy,
      comfyui: updated.comfyui,
      ...(updated.status === "completed" || updated.status === "partial" || updated.status === "failed"
        ? { completedAt: new Date() }
        : {}),
    });
  } catch (err) {
    console.error("[avatar-pipeline] Error advancing pipeline:", err);
  }

  return updated;
}

/* ═══════════════════════════════════════
   3D Pipeline (Meshy.ai)
   ═══════════════════════════════════════ */

async function advance3D(
  task: AvatarGenerationTask,
): Promise<MeshyPipelineState> {
  const state: MeshyPipelineState = task.meshy || { status: "pending" };

  try {
    switch (state.status) {
      case "pending": {
        // Kick off preview
        const taskId = await createPreview(task.prompt);
        return { ...state, status: "preview", previewTaskId: taskId, progress: 5 };
      }

      case "preview": {
        if (!state.previewTaskId) return { ...state, status: "failed", error: "Missing preview task ID" };
        const result = await getTextTo3DStatus(state.previewTaskId);
        if (result.status === "FAILED" || result.status === "EXPIRED") {
          return { ...state, status: "failed", error: `Preview failed: ${result.status}` };
        }
        if (result.status === "SUCCEEDED") {
          // Kick off refine
          const refineId = await refineModel(state.previewTaskId);
          return { ...state, status: "refine", refineTaskId: refineId, progress: 25 };
        }
        return { ...state, progress: Math.min(20, (result.progress || 0) * 0.2) };
      }

      case "refine": {
        if (!state.refineTaskId) return { ...state, status: "failed", error: "Missing refine task ID" };
        const result = await getTextTo3DStatus(state.refineTaskId);
        if (result.status === "FAILED" || result.status === "EXPIRED") {
          return { ...state, status: "failed", error: `Refine failed: ${result.status}` };
        }
        if (result.status === "SUCCEEDED") {
          // Kick off rigging
          const rigId = await rigModel(state.refineTaskId);
          return { ...state, status: "rig", rigTaskId: rigId, progress: 50 };
        }
        return { ...state, progress: 25 + (result.progress || 0) * 0.25 };
      }

      case "rig": {
        if (!state.rigTaskId) return { ...state, status: "failed", error: "Missing rig task ID" };
        const result = await getRigStatus(state.rigTaskId);
        if (result.status === "FAILED") {
          return { ...state, status: "failed", error: "Rigging failed" };
        }
        if (result.status === "SUCCEEDED" && result.rigged_character_glb_url) {
          // Store the rigged model URL and start animations
          const animTaskIds: Record<string, string> = {};
          for (const [name, actionId] of Object.entries(OFFICE_ANIMATIONS)) {
            try {
              const animId = await generateAnimation(state.rigTaskId, actionId);
              animTaskIds[name] = animId;
            } catch {
              // Skip failed animation submissions
            }
          }
          return {
            ...state,
            status: "animate",
            glbUrl: result.rigged_character_glb_url,
            animationTaskIds: animTaskIds,
            progress: 65,
          };
        }
        return { ...state, progress: 50 + (result.progress || 0) * 0.15 };
      }

      case "animate": {
        if (!state.animationTaskIds) return { ...state, status: "uploading", progress: 80 };

        // Check all animation tasks
        let allDone = true;
        const animGlbs: Record<string, string> = {};

        for (const [name, taskId] of Object.entries(state.animationTaskIds)) {
          try {
            const result = await getAnimationStatus(taskId);
            if (result.status === "SUCCEEDED" && result.animation_glb_url) {
              animGlbs[name] = result.animation_glb_url;
            } else if (result.status !== "FAILED" && result.status !== "CANCELED") {
              allDone = false;
            }
          } catch {
            // Treat fetch errors as not-done-yet
            allDone = false;
          }
        }

        if (allDone) {
          return {
            ...state,
            status: "uploading",
            progress: 80,
            // Store temporary URLs for upload step
            animationTaskIds: { ...state.animationTaskIds, ...animGlbs },
          };
        }
        return { ...state, progress: 65 + Object.keys(animGlbs).length * 3 };
      }

      case "uploading": {
        if (!isStorachaConfigured()) {
          // If Storacha not configured, use direct Meshy URLs (temporary)
          return {
            ...state,
            status: "done",
            gatewayUrl: state.glbUrl,
            progress: 100,
          };
        }

        // Upload base rigged model
        if (state.glbUrl && !state.storachaCid) {
          const buf = await downloadModel(state.glbUrl);
          const { cid, sizeBytes } = await uploadContent(buf, "avatar.glb");
          await recordCidLink(cid, "default-space", sizeBytes);
          return {
            ...state,
            storachaCid: cid,
            gatewayUrl: buildRetrievalUrl(cid),
            progress: 90,
          };
        }

        // Upload animation GLBs
        const animationGlbs: Record<string, { cid: string; gatewayUrl: string }> = state.animationGlbs || {};
        const animTaskIds = state.animationTaskIds || {};

        for (const [name] of Object.entries(OFFICE_ANIMATIONS)) {
          const url = animTaskIds[name];
          if (url && url.startsWith("http") && !animationGlbs[name]) {
            try {
              const buf = await downloadModel(url);
              const { cid, sizeBytes } = await uploadContent(buf, `anim-${name}.glb`);
              await recordCidLink(cid, "default-space", sizeBytes);
              animationGlbs[name] = { cid, gatewayUrl: buildRetrievalUrl(cid) };
            } catch {
              // Skip failed animation uploads
            }
            // Only upload one per poll cycle to stay under timeout
            return { ...state, animationGlbs: animationGlbs, progress: 95 };
          }
        }

        return { ...state, status: "done", animationGlbs, progress: 100 };
      }

      case "done":
      case "failed":
        return state;

      default:
        return state;
    }
  } catch (err) {
    return {
      ...state,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown 3D pipeline error",
    };
  }
}

/* ═══════════════════════════════════════
   2D Pipeline (ComfyUI)
   ═══════════════════════════════════════ */

/**
 * 2D Pipeline (ComfyUI) — Extended to generate both static sprite + animated sprite sheet.
 *
 * Flow: pending → generating (static 64×64) → generating_sheet (288×256 walk cycle)
 *       → uploading (static PNG) → uploading_sheet (sprite sheet PNG) → done
 *
 * Each poll advances one step to stay under Netlify's 10s timeout.
 */
async function advance2D(
  task: AvatarGenerationTask,
): Promise<ComfyUIPipelineState> {
  const state: ComfyUIPipelineState = task.comfyui || { status: "pending" };

  try {
    switch (state.status) {
      case "pending": {
        // Step 1: Submit static front-facing sprite
        const promptId = await submitPixelArtWorkflow(task.prompt, 64);
        return { ...state, status: "generating", promptId, progress: 5 };
      }

      case "generating": {
        // Step 2: Poll static sprite → when done, submit sprite sheet
        if (!state.promptId) return { ...state, status: "failed", error: "Missing prompt ID" };
        const result = await getPromptStatus(state.promptId);

        if (result.status === "failed") {
          return { ...state, status: "failed", error: "ComfyUI static sprite generation failed" };
        }
        if (result.status === "completed" && result.filename) {
          // Static sprite ready — now submit the animated sprite sheet
          const sheetPromptId = await submitSpriteSheetWorkflow(task.prompt);
          return {
            ...state,
            status: "generating_sheet",
            pngUrl: result.filename,
            spriteSheetPromptId: sheetPromptId,
            progress: 30,
          };
        }
        return { ...state, progress: result.status === "running" ? 20 : 5 };
      }

      case "generating_sheet": {
        // Step 3: Poll sprite sheet generation
        if (!state.spriteSheetPromptId) return { ...state, status: "failed", error: "Missing sprite sheet prompt ID" };
        const result = await getPromptStatus(state.spriteSheetPromptId);

        if (result.status === "failed") {
          // Sprite sheet failed but static sprite is available — upload the static one
          return { ...state, status: "uploading", progress: 50 };
        }
        if (result.status === "completed" && result.filename) {
          return { ...state, status: "uploading", sheetPngUrl: result.filename, progress: 50 };
        }
        return { ...state, progress: result.status === "running" ? 40 : 30 };
      }

      case "uploading": {
        // Step 4: Upload static sprite to Storacha
        if (!state.pngUrl) return { ...state, status: "failed", error: "Missing output filename" };

        if (!isStorachaConfigured()) {
          // Skip Storacha — move to sprite sheet upload or done
          if (state.sheetPngUrl) {
            return { ...state, status: "uploading_sheet", progress: 70 };
          }
          return { ...state, status: "done", progress: 100 };
        }

        const buf = await getGeneratedImage(state.pngUrl);
        const { cid, sizeBytes } = await uploadContent(buf, "avatar-sprite.png");
        await recordCidLink(cid, "default-space", sizeBytes);

        const updated = {
          ...state,
          storachaCid: cid,
          gatewayUrl: buildRetrievalUrl(cid),
          progress: 75,
        };

        // If sprite sheet is available, upload it next
        if (state.sheetPngUrl) {
          return { ...updated, status: "uploading_sheet" as const };
        }
        return { ...updated, status: "done" as const, progress: 100 };
      }

      case "uploading_sheet": {
        // Step 5: Upload animated sprite sheet to Storacha
        if (!state.sheetPngUrl) {
          return { ...state, status: "done", progress: 100 };
        }

        if (!isStorachaConfigured()) {
          return { ...state, status: "done", progress: 100 };
        }

        const buf = await getGeneratedImage(state.sheetPngUrl);
        const { cid, sizeBytes } = await uploadContent(buf, "avatar-spritesheet.png");
        await recordCidLink(cid, "default-space", sizeBytes);

        return {
          ...state,
          status: "done",
          sheetStorachaCid: cid,
          sheetGatewayUrl: buildRetrievalUrl(cid),
          progress: 100,
        };
      }

      case "done":
      case "failed":
        return state;

      default:
        return state;
    }
  } catch (err) {
    return {
      ...state,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown 2D pipeline error",
    };
  }
}

/* ═══════════════════════════════════════
   Overall status computation
   ═══════════════════════════════════════ */

function computeOverallStatus(task: AvatarGenerationTask): AvatarGenerationStatus {
  const has3d = task.pipelines.includes("3d");
  const has2d = task.pipelines.includes("2d");

  const meshyDone = !has3d || !isMeshyConfigured() || task.meshy?.status === "done";
  const meshyFailed = has3d && isMeshyConfigured() && task.meshy?.status === "failed";
  const comfyDone = !has2d || !isComfyUIConfigured() || task.comfyui?.status === "done";
  const comfyFailed = has2d && isComfyUIConfigured() && task.comfyui?.status === "failed";

  if (meshyDone && comfyDone) return "completed";
  if (meshyFailed && comfyFailed) return "failed";
  if ((meshyDone && comfyFailed) || (meshyFailed && comfyDone)) return "partial";

  // Still in progress — determine which sub-step we're on
  if (task.meshy?.status === "uploading" || task.comfyui?.status === "uploading" || task.comfyui?.status === "uploading_sheet") return "uploading";
  if (task.meshy?.status === "animate") return "animating";
  if (task.meshy?.status === "rig") return "rigging";
  if (task.meshy?.status === "refine") return "refining_3d";
  if (task.meshy?.status === "preview") return "generating_3d";
  if (task.comfyui?.status === "generating" || task.comfyui?.status === "generating_sheet") return "generating_2d";

  return "pending";
}
