/** Meshy.ai — 3D Generation Dashboard */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  XCircle,
  Grid3X3,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  Download,
  X,
  Zap,
  Image,
  Bone,
  Play,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOrg } from "@/contexts/OrgContext";

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

interface MeshyJobView {
  id: string;
  jobType: string;
  status: string;
  progress: number;
  prompt: string;
  negativePrompt?: string;
  texturePrompt?: string;
  imageUrl?: string;
  aiModel?: string;
  modelType?: string;
  topology?: string;
  targetPolycount?: number;
  poseMode?: string;
  thumbnailUrl?: string;
  modelUrls?: Record<string, string>;
  riggedModelUrl?: string;
  previewTaskId?: string;
  refineTaskId?: string;
  rigTaskId?: string;
  animationUrl?: string;
  error?: string;
  isFavorite?: boolean;
  tags?: string[];
  createdAt?: string;
  completedAt?: string;
}

interface MeshyAssetView {
  id: string;
  assetType: string;
  format: string;
  mimeType: string;
  url: string;
  filename?: string;
}

interface GalleryItem extends MeshyJobView {
  assets: MeshyAssetView[];
}

interface HealthInfo {
  ok: boolean;
  configured: boolean;
  latencyMs?: number;
  error?: string;
}

interface OrgStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  totalAssets: number;
}

const POLYCOUNT_PRESETS = [
  { label: "Low (10K)", value: 10000 },
  { label: "Medium (30K)", value: 30000 },
  { label: "High (100K)", value: 100000 },
  { label: "Ultra (300K)", value: 300000 },
];

const ANIMATION_PRESETS = [
  { label: "Idle", value: "idle" },
  { label: "Walking", value: "walking" },
  { label: "Running", value: "running" },
  { label: "Talking", value: "talking" },
  { label: "Waving", value: "waving" },
  { label: "Dancing", value: "dancing" },
  { label: "Sit (F)", value: "sit_idle_f" },
  { label: "Sit (M)", value: "sit_idle_m" },
];

/* ═══════════════════════════════════════
   Page Component
   ═══════════════════════════════════════ */

export default function MeshyPage() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [tab, setTab] = useState("text-to-3d");

  // Connection
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [configured, setConfigured] = useState(true);

  // Text-to-3D state
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiModel, setAiModel] = useState("meshy-6");
  const [modelType, setModelType] = useState("standard");
  const [topology, setTopology] = useState("triangle");
  const [targetPolycount, setTargetPolycount] = useState(30000);
  const [poseMode, setPoseMode] = useState("");
  const [symmetryMode, setSymmetryMode] = useState("auto");
  const [enablePbr, setEnablePbr] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Image-to-3D state
  const [imageUrl, setImageUrl] = useState("");
  const [imageTexturePrompt, setImageTexturePrompt] = useState("");
  const [imageShouldTexture, setImageShouldTexture] = useState(true);
  const [imageSubmitting, setImageSubmitting] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Jobs state
  const [jobs, setJobs] = useState<MeshyJobView[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<MeshyAssetView[]>([]);
  const [jobFilter, setJobFilter] = useState("all");

  // Gallery state
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [galleryStats, setGalleryStats] = useState<OrgStats | null>(null);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);

  /* ── Health check ── */
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/meshy/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setConfigured(data.configured !== false);
      }
    } catch {
      setHealth({ ok: false, configured: false, error: "Connection failed" });
    }
  }, []);

  /* ── Fetch jobs ── */
  const fetchJobs = useCallback(async () => {
    if (!orgId) return;
    setLoadingJobs(true);
    try {
      const params = new URLSearchParams({ orgId });
      if (jobFilter !== "all") params.set("status", jobFilter);
      const res = await fetch(`/api/meshy/jobs/list?${params}`);
      if (res.status === 503) {
        setConfigured(false);
        setLoadingJobs(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingJobs(false);
    }
  }, [orgId, jobFilter]);

  /* ── Fetch gallery ── */
  const fetchGallery = useCallback(async () => {
    if (!orgId) return;
    setLoadingGallery(true);
    try {
      const res = await fetch(`/api/meshy/gallery?orgId=${orgId}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setGallery(data.gallery || []);
        if (data.stats) setGalleryStats(data.stats);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingGallery(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (tab === "text-to-3d" || tab === "image-to-3d" || tab === "jobs") fetchJobs();
    if (tab === "gallery") fetchGallery();
  }, [tab, fetchJobs, fetchGallery]);

  useEffect(() => {
    if (tab === "jobs") fetchJobs();
  }, [jobFilter, fetchJobs, tab]);

  // Poll active jobs
  useEffect(() => {
    const activeJobs = jobs.filter((j) =>
      ["pending", "preview", "refining", "rigging", "animating"].includes(j.status),
    );
    if (activeJobs.length === 0) return;

    const timer = setInterval(async () => {
      for (const job of activeJobs) {
        try {
          const res = await fetch(`/api/meshy/jobs/${job.id}?orgId=${orgId}`);
          if (res.ok) {
            const data = await res.json();
            setJobs((prev) => prev.map((j) => (j.id === job.id ? data.job : j)));
            if (selectedJob === job.id) setSelectedAssets(data.assets || []);
          }
        } catch {
          // Ignore
        }
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [jobs, orgId, selectedJob]);

  // Health poll
  useEffect(() => {
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  /* ── Submit text-to-3D preview ── */
  async function handleTextTo3D() {
    if (!orgId || !prompt.trim()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/meshy/text-to-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          mode: "preview",
          prompt,
          negativePrompt: negativePrompt || undefined,
          aiModel,
          modelType,
          topology,
          targetPolycount,
          poseMode: poseMode || undefined,
          symmetryMode,
          enablePbr,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit");
        return;
      }
      setPrompt("");
      setNegativePrompt("");
      fetchJobs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Submit image-to-3D ── */
  async function handleImageTo3D() {
    if (!orgId || !imageUrl.trim()) return;
    setImageSubmitting(true);
    setImageError(null);

    try {
      const res = await fetch("/api/meshy/image-to-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          imageUrl,
          shouldTexture: imageShouldTexture,
          enablePbr,
          texturePrompt: imageTexturePrompt || undefined,
          aiModel,
          modelType,
          topology,
          targetPolycount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImageError(data.error || "Failed to submit");
        return;
      }
      setImageUrl("");
      setImageTexturePrompt("");
      fetchJobs();
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setImageSubmitting(false);
    }
  }

  /* ── Refine a preview ── */
  async function handleRefine(jobId: string, previewTaskId: string) {
    if (!orgId) return;
    try {
      await fetch("/api/meshy/text-to-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          mode: "refine",
          previewTaskId,
          enablePbr: true,
        }),
      });
      fetchJobs();
    } catch {
      // Ignore
    }
  }

  /* ── Rig a completed model ── */
  async function handleRig(jobId: string) {
    if (!orgId) return;
    try {
      await fetch("/api/meshy/rig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, jobId }),
      });
      fetchJobs();
    } catch {
      // Ignore
    }
  }

  /* ── Animate a rigged model ── */
  async function handleAnimate(jobId: string, animationName: string) {
    if (!orgId) return;
    try {
      await fetch("/api/meshy/animate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, jobId, animationName }),
      });
      fetchJobs();
    } catch {
      // Ignore
    }
  }

  /* ── Select job ── */
  async function handleSelectJob(jobId: string) {
    setSelectedJob(selectedJob === jobId ? null : jobId);
    if (selectedJob === jobId) return;
    setSelectedAssets([]);
    try {
      const res = await fetch(`/api/meshy/jobs/${jobId}?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedAssets(data.assets || []);
        setJobs((prev) => prev.map((j) => (j.id === jobId ? data.job : j)));
      }
    } catch {
      // Ignore
    }
  }

  const filteredJobs = useMemo(() => {
    if (jobFilter === "all") return jobs;
    return jobs.filter((j) => j.status === jobFilter);
  }, [jobs, jobFilter]);

  /* ── Not configured ── */
  if (!configured) {
    return (
      <div className="space-y-6">
        <HeaderBar health={health} />
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-yellow-400 mx-auto" />
            <h2 className="text-lg font-semibold">Meshy.ai Not Configured</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Set <code className="bg-muted px-1.5 py-0.5 rounded text-xs">MESHY_API_KEY</code> in
              your environment to connect to Meshy.ai.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderBar health={health} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="text-to-3d" className="gap-1.5">
            <Box className="h-3.5 w-3.5" /> Text to 3D
          </TabsTrigger>
          <TabsTrigger value="image-to-3d" className="gap-1.5">
            <Image className="h-3.5 w-3.5" /> Image to 3D
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-1.5">
            <Grid3X3 className="h-3.5 w-3.5" /> Gallery
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Jobs
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> Stats
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════ Text-to-3D Tab ═══ */}
        <TabsContent value="text-to-3d" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A detailed 3D character, fantasy warrior with armor..."
                  rows={3}
                  maxLength={600}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                  {prompt.length}/600
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Negative Prompt (optional)
                </label>
                <input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="low quality, blurry"
                  maxLength={600}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
              </div>

              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {showAdvanced ? "Hide" : "Show"} Advanced Settings
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {showAdvanced && (
                <div className="space-y-3 p-4 rounded-lg border border-border/50 bg-muted/5">
                  {/* AI Model */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">AI Model</label>
                      <select
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="meshy-6">Meshy-6 (Latest)</option>
                        <option value="meshy-5">Meshy-5</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Model Type</label>
                      <select
                        value={modelType}
                        onChange={(e) => setModelType(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="standard">Standard</option>
                        <option value="lowpoly">Low Poly</option>
                      </select>
                    </div>
                  </div>

                  {/* Topology + Polycount */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Topology</label>
                      <select
                        value={topology}
                        onChange={(e) => setTopology(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="triangle">Triangle</option>
                        <option value="quad">Quad</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Polycount</label>
                      <select
                        value={targetPolycount}
                        onChange={(e) => setTargetPolycount(Number(e.target.value))}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        {POLYCOUNT_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Pose + Symmetry */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Pose Mode</label>
                      <select
                        value={poseMode}
                        onChange={(e) => setPoseMode(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="">Default</option>
                        <option value="a-pose">A-Pose (for rigging)</option>
                        <option value="t-pose">T-Pose (for rigging)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Symmetry</label>
                      <select
                        value={symmetryMode}
                        onChange={(e) => setSymmetryMode(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="auto">Auto</option>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                  </div>

                  {/* PBR */}
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={enablePbr}
                      onChange={(e) => setEnablePbr(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-muted-foreground">Enable PBR textures (metallic, normal, roughness maps)</span>
                  </label>
                </div>
              )}

              {submitError && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              <Button
                onClick={handleTextTo3D}
                disabled={submitting || !prompt.trim()}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Generate 3D Model
              </Button>
            </CardContent>
          </Card>

          <ActiveJobsList
            jobs={jobs}
            selectedJob={selectedJob}
            selectedAssets={selectedAssets}
            orgId={orgId!}
            onSelect={handleSelectJob}
            onRefine={handleRefine}
            onRig={handleRig}
            onAnimate={handleAnimate}
          />
        </TabsContent>

        {/* ══════════════════ Image-to-3D Tab ═══ */}
        <TabsContent value="image-to-3d" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Image URL
                </label>
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/reference-image.png"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Provide a public image URL (PNG/JPG). Meshy will generate a 3D model from it.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Texture Prompt (optional)
                </label>
                <input
                  value={imageTexturePrompt}
                  onChange={(e) => setImageTexturePrompt(e.target.value)}
                  placeholder="Wooden texture, medieval style"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={imageShouldTexture}
                  onChange={(e) => setImageShouldTexture(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Generate textures</span>
              </label>

              {imageError && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {imageError}
                </div>
              )}

              <Button
                onClick={handleImageTo3D}
                disabled={imageSubmitting || !imageUrl.trim()}
                className="gap-2"
              >
                {imageSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Image className="h-4 w-4" />
                )}
                Generate from Image
              </Button>
            </CardContent>
          </Card>

          <ActiveJobsList
            jobs={jobs.filter((j) => j.jobType === "image-to-3d")}
            selectedJob={selectedJob}
            selectedAssets={selectedAssets}
            orgId={orgId!}
            onSelect={handleSelectJob}
            onRefine={handleRefine}
            onRig={handleRig}
            onAnimate={handleAnimate}
          />
        </TabsContent>

        {/* ══════════════════ Gallery Tab ═══ */}
        <TabsContent value="gallery" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">3D Gallery</h3>
              {galleryStats && (
                <Badge variant="outline" className="text-[10px]">
                  {galleryStats.totalAssets} assets
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={fetchGallery} className="gap-1.5 text-xs">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {loadingGallery ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </CardContent>
            </Card>
          ) : gallery.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No completed 3D models yet. Use the Text to 3D or Image to 3D tab to generate models.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {gallery.map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-square rounded-lg border border-border overflow-hidden bg-muted/30 cursor-pointer hover:border-blue-500/40 transition-all"
                  onClick={() => setLightboxItem(item)}
                >
                  {item.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.thumbnailUrl}
                      alt={item.prompt || "3D model"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Box className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    <p className="text-[10px] text-white/90 line-clamp-2">{item.prompt}</p>
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-[8px] border-white/20 text-white/70">
                        {item.jobType}
                      </Badge>
                      {item.aiModel && (
                        <Badge variant="outline" className="text-[8px] border-white/20 text-white/70">
                          {item.aiModel}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ══════════════════ Jobs Tab ═══ */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">All Jobs</h3>
              <div className="flex gap-1">
                {["all", "preview", "refining", "completed", "failed"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setJobFilter(f)}
                    className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                      jobFilter === f
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchJobs} className="gap-1.5 text-xs">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {loadingJobs ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </CardContent>
            </Card>
          ) : filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                {jobFilter === "all" ? "No jobs yet." : `No ${jobFilter} jobs.`}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selectedJob === job.id}
                  assets={selectedJob === job.id ? selectedAssets : []}
                  orgId={orgId!}
                  onClick={() => handleSelectJob(job.id)}
                  onRefine={handleRefine}
                  onRig={handleRig}
                  onAnimate={handleAnimate}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ══════════════════ Stats Tab ═══ */}
        <TabsContent value="stats" className="space-y-4">
          {health && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Connection</span>
                  <Badge
                    variant="outline"
                    className={health.ok ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}
                  >
                    {health.ok ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
                {health.latencyMs != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Latency</span>
                    <span className={`font-mono text-xs ${
                      health.latencyMs < 500 ? "text-green-400" : health.latencyMs < 2000 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {health.latencyMs}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {galleryStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Total Jobs" value={galleryStats.totalJobs} color="#818cf8" />
              <StatCard label="Completed" value={galleryStats.completedJobs} color="#22c55e" />
              <StatCard label="Failed" value={galleryStats.failedJobs} color="#ef4444" />
              <StatCard label="Active" value={galleryStats.activeJobs} color="#f59e0b" />
              <StatCard label="Assets" value={galleryStats.totalAssets} color="#3b82f6" />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ══════════════════ Lightbox ═══ */}
      {lightboxItem && (
        <ModelLightbox
          item={lightboxItem}
          orgId={orgId!}
          onClose={() => setLightboxItem(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════ */

function HeaderBar({ health }: { health: HealthInfo | null }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Box className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Meshy.ai</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered 3D model generation
          </p>
        </div>
      </div>
      {health && (
        <div className="flex items-center gap-2">
          {health.ok ? (
            <Wifi className="h-4 w-4 text-green-400" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-400" />
          )}
          <div className="text-right">
            <p className={`text-xs font-medium ${health.ok ? "text-green-400" : "text-red-400"}`}>
              {health.ok ? "Connected" : "Disconnected"}
            </p>
            {health.latencyMs != null && (
              <p className="text-[10px] text-muted-foreground font-mono">{health.latencyMs}ms</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveJobsList({
  jobs,
  selectedJob,
  selectedAssets,
  orgId,
  onSelect,
  onRefine,
  onRig,
  onAnimate,
}: {
  jobs: MeshyJobView[];
  selectedJob: string | null;
  selectedAssets: MeshyAssetView[];
  orgId: string;
  onSelect: (id: string) => void;
  onRefine: (jobId: string, previewTaskId: string) => void;
  onRig: (jobId: string) => void;
  onAnimate: (jobId: string, name: string) => void;
}) {
  const active = jobs.filter((j) =>
    ["pending", "preview", "refining", "rigging", "animating"].includes(j.status),
  );
  const recent = jobs.filter((j) => j.status === "completed").slice(0, 3);

  return (
    <>
      {active.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Active Jobs
          </h3>
          <div className="space-y-2">
            {active.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={selectedJob === job.id}
                assets={selectedJob === job.id ? selectedAssets : []}
                orgId={orgId}
                onClick={() => onSelect(job.id)}
                onRefine={onRefine}
                onRig={onRig}
                onAnimate={onAnimate}
              />
            ))}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Recent
          </h3>
          <div className="space-y-2">
            {recent.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={selectedJob === job.id}
                assets={selectedJob === job.id ? selectedAssets : []}
                orgId={orgId}
                onClick={() => onSelect(job.id)}
                onRefine={onRefine}
                onRig={onRig}
                onAnimate={onAnimate}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-gray-400", label: "Pending" },
  preview: { icon: Loader2, color: "text-blue-400", label: "Preview" },
  refining: { icon: Loader2, color: "text-amber-400", label: "Refining" },
  rigging: { icon: Bone, color: "text-purple-400", label: "Rigging" },
  animating: { icon: Play, color: "text-cyan-400", label: "Animating" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
  canceled: { icon: XCircle, color: "text-orange-400", label: "Canceled" },
};

function JobCard({
  job,
  selected,
  assets,
  orgId,
  onClick,
  onRefine,
  onRig,
  onAnimate,
}: {
  job: MeshyJobView;
  selected: boolean;
  assets: MeshyAssetView[];
  orgId: string;
  onClick: () => void;
  onRefine: (jobId: string, previewTaskId: string) => void;
  onRig: (jobId: string) => void;
  onAnimate: (jobId: string, name: string) => void;
}) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const isActive = ["preview", "refining", "rigging", "animating"].includes(job.status);

  return (
    <Card
      className={`cursor-pointer transition-colors ${selected ? "border-blue-500/40" : "hover:border-border/80"}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon
              className={`h-4 w-4 ${config.color} ${isActive ? "animate-spin" : ""}`}
            />
            <span className="text-sm font-medium capitalize">{job.jobType.replace(/-/g, " ")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={`text-[10px] ${config.color}`}>
              {config.label}
            </Badge>
          </div>
        </div>

        {job.prompt && (
          <p className="text-xs text-muted-foreground truncate mb-1">{job.prompt}</p>
        )}

        {/* Params */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {job.aiModel && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {job.aiModel}
            </span>
          )}
          {job.modelType && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {job.modelType}
            </span>
          )}
          {job.targetPolycount && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {(job.targetPolycount / 1000).toFixed(0)}K polys
            </span>
          )}
        </div>

        {/* Progress bar for active jobs */}
        {isActive && (
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}

        {job.error && <p className="text-xs text-red-400 mt-1">{job.error}</p>}

        {job.createdAt && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(job.createdAt).toLocaleString()}
          </p>
        )}

        {/* Thumbnail */}
        {job.thumbnailUrl && (
          <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={job.thumbnailUrl}
              alt="Preview"
              className="w-24 h-24 rounded-md border border-border object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Actions for completed preview */}
        {selected && job.status === "completed" && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            {/* Download links */}
            {job.modelUrls && Object.entries(job.modelUrls).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Downloads</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(job.modelUrls).map(([fmt, url]) => (
                    <a
                      key={fmt}
                      href={`/api/meshy/download?orgId=${orgId}&url=${encodeURIComponent(url)}`}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-muted/50 hover:bg-muted text-[10px] transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="h-3 w-3" />
                      .{fmt}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline actions */}
            <div className="flex flex-wrap gap-1.5">
              {!job.riggedModelUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRig(job.id);
                  }}
                >
                  <Bone className="h-3 w-3" /> Auto-Rig
                </Button>
              )}
              {job.riggedModelUrl && (
                <>
                  {ANIMATION_PRESETS.slice(0, 4).map((anim) => (
                    <Button
                      key={anim.value}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnimate(job.id, anim.value);
                      }}
                    >
                      <Play className="h-3 w-3" /> {anim.label}
                    </Button>
                  ))}
                </>
              )}
            </div>

            {/* Assets list */}
            {assets.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Assets ({assets.length})
                </p>
                <div className="space-y-1">
                  {assets.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground/80">{a.assetType} ({a.format})</span>
                      <a
                        href={`/api/meshy/download?orgId=${orgId}&url=${encodeURIComponent(a.url)}`}
                        className="text-blue-400 hover:text-blue-300"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview completed — offer refine */}
        {selected && job.status === "preview" && job.progress >= 20 && job.previewTaskId && (
          <div className="mt-3 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRefine(job.id, job.previewTaskId!);
              }}
            >
              <Zap className="h-3 w-3" /> Refine (Add Textures)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModelLightbox({
  item,
  orgId,
  onClose,
}: {
  item: GalleryItem;
  orgId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex" onClick={onClose}>
      {/* Preview area */}
      <div className="flex-1 flex items-center justify-center relative" onClick={(e) => e.stopPropagation()}>
        {item.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.thumbnailUrl}
            alt={item.prompt || "3D model"}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        ) : (
          <div className="text-center">
            <Box className="h-20 w-20 text-muted-foreground/20 mx-auto" />
            <p className="text-sm text-muted-foreground mt-2">No preview available</p>
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Metadata panel */}
      <div
        className="w-80 bg-background/95 border-l border-border p-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-3">Generation Details</h3>

        {item.prompt && (
          <div className="mb-3">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Prompt</label>
            <p className="text-xs mt-0.5">{item.prompt}</p>
          </div>
        )}

        {item.texturePrompt && (
          <div className="mb-3">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Texture Prompt</label>
            <p className="text-xs mt-0.5 text-muted-foreground">{item.texturePrompt}</p>
          </div>
        )}

        <div className="space-y-2 mb-4">
          <MetaRow label="Type" value={item.jobType.replace(/-/g, " ")} />
          {item.aiModel && <MetaRow label="AI Model" value={item.aiModel} />}
          {item.modelType && <MetaRow label="Model Type" value={item.modelType} />}
          {item.targetPolycount && <MetaRow label="Polycount" value={`${(item.targetPolycount / 1000).toFixed(0)}K`} />}
          {item.poseMode && <MetaRow label="Pose" value={item.poseMode} />}
        </div>

        {item.createdAt && (
          <p className="text-[10px] text-muted-foreground mb-4">
            {new Date(item.createdAt).toLocaleString()}
          </p>
        )}

        {/* Download buttons */}
        {item.modelUrls && Object.entries(item.modelUrls).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Download</p>
            {Object.entries(item.modelUrls).map(([fmt, url]) => (
              <a
                key={fmt}
                href={`/api/meshy/download?orgId=${orgId}&url=${encodeURIComponent(url)}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-xs transition-colors"
              >
                <Download className="h-3 w-3" /> {fmt.toUpperCase()}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px] capitalize">{value}</span>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      </CardContent>
    </Card>
  );
}
