/**
 * Meshy.ai Plugin — Marketplace integration manifest.
 *
 * This registers the Meshy integration as a discoverable plugin
 * in the Swarm marketplace. It's separate from the generation-pipeline
 * plugin at ./meshy/index.ts which implements the GenerationPlugin contract.
 */

export const MESHY_PLUGIN_MANIFEST = {
  id: "meshy-integration",
  name: "Meshy.ai 3D Generation",
  slug: "meshy",
  version: "1.0.0",
  description:
    "AI-powered 3D model generation — text-to-3D, image-to-3D, auto-rigging, and animation via Meshy.ai",
  icon: "Box",
  category: "integration",
  tags: ["3d", "meshy", "generation", "models", "ai", "glb", "fbx", "rigging", "animation"],

  capabilities: [
    "text-to-3d",
    "image-to-3d",
    "auto-rigging",
    "animation",
    "model-download",
    "sse-streaming",
  ],

  requiredEnvVars: ["MESHY_API_KEY"],

  routes: {
    health: "GET /api/meshy/health",
    textTo3D: "POST /api/meshy/text-to-3d",
    imageTo3D: "POST /api/meshy/image-to-3d",
    rig: "POST /api/meshy/rig",
    animate: "POST /api/meshy/animate",
    jobStatus: "GET /api/meshy/jobs/:jobId",
    jobsList: "GET /api/meshy/jobs/list",
    gallery: "GET /api/meshy/gallery",
    stats: "GET /api/meshy/stats",
    stream: "GET /api/meshy/stream",
    download: "GET /api/meshy/download",
  },

  firestoreCollections: ["meshyJobs", "meshyAssets"],

  pricing: {
    provider: "meshy.ai",
    model: "credit-based",
    notes: "Requires Meshy.ai Pro subscription or above. Credits consumed per task.",
    creditCosts: {
      "text-to-3d-preview": "20 credits (meshy-6) / 5 credits (others)",
      "text-to-3d-refine": "10 credits",
      "image-to-3d": "20-30 credits depending on texture",
      "rigging": "5 credits",
      "animation": "3 credits",
    },
  },

  supportedFormats: ["glb", "fbx", "obj", "usdz", "stl"],
  supportedAiModels: ["meshy-6", "meshy-5"],
};
