/** ComfyUI — Dashboard page */
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Paintbrush,
  Upload,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  StopCircle,
  XCircle,
  Star,
  Grid3X3,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Dice5,
  X,
  Zap,
  FileJson,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOrg } from "@/contexts/OrgContext";

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

interface ComfyJobView {
  id: string;
  comfyPromptId: string;
  workflowName: string;
  prompt: string;
  negativePrompt?: string;
  status: string;
  progress: number;
  error?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  seed?: number;
  checkpoint?: string;
  isFavorite?: boolean;
  tags?: string[];
  createdAt?: string;
  completedAt?: string;
}

interface ComfyArtifactView {
  id: string;
  filename: string;
  subfolder: string;
  mimeType: string;
  nodeId: string;
  url?: string;
}

interface GalleryItem {
  id: string;
  comfyPromptId: string;
  workflowName: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  seed?: number;
  checkpoint?: string;
  isFavorite?: boolean;
  tags?: string[];
  createdAt?: string;
  completedAt?: string;
  artifacts: ComfyArtifactView[];
}

interface SystemInfo {
  system: { os: string; python_version: string; embedded_python?: boolean };
  devices: { name: string; type: string; vram_total: number; vram_free: number; torch_vram_total?: number; torch_vram_free?: number }[];
}

interface QueueInfo {
  running: number;
  pending: number;
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
  totalArtifacts: number;
}

// Size presets
const SIZE_PRESETS = [
  { label: "1:1", w: 1024, h: 1024 },
  { label: "3:2", w: 1216, h: 832 },
  { label: "2:3", w: 832, h: 1216 },
  { label: "16:9", w: 1344, h: 768 },
  { label: "9:16", w: 768, h: 1344 },
  { label: "4:3", w: 1152, h: 896 },
  { label: "3:4", w: 896, h: 1152 },
];

const DEFAULT_SAMPLERS = [
  "euler", "euler_ancestral", "heun", "heunpp2", "dpm_2", "dpm_2_ancestral",
  "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde",
  "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
  "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ddim", "uni_pc",
  "uni_pc_bh2",
];

const DEFAULT_SCHEDULERS = [
  "normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta",
];

/* ═══════════════════════════════════════
   Page Component
   ═══════════════════════════════════════ */

export default function ComfyUIPage() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [tab, setTab] = useState("generate");

  // Connection state
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [configured, setConfigured] = useState(true);

  // Generate state
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("blurry, low quality, watermark, text, logo, frame, border");
  const [workflowName, setWorkflowName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawWorkflowJson, setRawWorkflowJson] = useState("");
  const [lastSeed, setLastSeed] = useState<number | null>(null);

  // Generation params
  const [sizePreset, setSizePreset] = useState(0);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(25);
  const [cfg, setCfg] = useState(7.5);
  const [sampler, setSampler] = useState("euler_ancestral");
  const [scheduler, setScheduler] = useState("normal");
  const [seed, setSeed] = useState(-1);
  const [checkpoint, setCheckpoint] = useState("");
  const [batchSize, setBatchSize] = useState(1);

  // Models from server
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableSamplers, setAvailableSamplers] = useState<string[]>(DEFAULT_SAMPLERS);
  const [availableSchedulers, setAvailableSchedulers] = useState<string[]>(DEFAULT_SCHEDULERS);

  // Jobs state
  const [jobs, setJobs] = useState<ComfyJobView[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ComfyArtifactView[]>([]);
  const [jobFilter, setJobFilter] = useState<string>("all");

  // Gallery state
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [lightboxItem, setLightboxItem] = useState<{ gallery: GalleryItem; artifactIndex: number } | null>(null);
  const [galleryStats, setGalleryStats] = useState<OrgStats | null>(null);

  // System state
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<{ name: string; time: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);

  /* ── Health check ── */
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/comfy/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setConfigured(data.configured !== false);
      }
    } catch {
      setHealth({ ok: false, configured: false, error: "Connection failed" });
    }
  }, []);

  /* ── Fetch models/samplers/schedulers ── */
  const fetchModels = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/comfy/models?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.models?.length) setAvailableModels(data.models);
        if (data.samplers?.length) setAvailableSamplers(data.samplers);
        if (data.schedulers?.length) setAvailableSchedulers(data.schedulers);
      }
    } catch {
      // Use defaults
    }
  }, [orgId]);

  /* ── Fetch jobs ── */
  const fetchJobs = useCallback(async () => {
    if (!orgId) return;
    setLoadingJobs(true);
    try {
      const params = new URLSearchParams({ orgId });
      if (jobFilter !== "all") params.set("status", jobFilter);
      const res = await fetch(`/api/comfy/jobs/list?${params}`);
      if (res.status === 503) {
        setConfigured(false);
        setLoadingJobs(false);
        return;
      }
      setConfigured(true);
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
      const res = await fetch(`/api/comfy/gallery?orgId=${orgId}&limit=30`);
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

  /* ── Fetch system info ── */
  const fetchSystem = useCallback(async () => {
    if (!orgId) return;
    try {
      const [sysRes, queueRes] = await Promise.all([
        fetch(`/api/comfy/system?orgId=${orgId}`),
        fetch(`/api/comfy/queue?orgId=${orgId}`),
      ]);

      if (sysRes.status === 503 || queueRes.status === 503) {
        setConfigured(false);
        return;
      }
      setConfigured(true);

      if (sysRes.ok) {
        const data = await sysRes.json();
        setSystem({ system: data.system, devices: data.devices });
        setSystemError(null);
      } else {
        setSystemError("Failed to fetch system info");
      }

      if (queueRes.ok) {
        const data = await queueRes.json();
        setQueue({ running: data.running, pending: data.pending });
      }
    } catch (err) {
      setSystemError(err instanceof Error ? err.message : "Connection error");
    }
  }, [orgId]);

  // Initial load
  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (tab === "generate") {
      fetchJobs();
      fetchModels();
    }
    if (tab === "jobs") fetchJobs();
    if (tab === "gallery") fetchGallery();
    if (tab === "system") fetchSystem();
  }, [tab, fetchJobs, fetchModels, fetchGallery, fetchSystem]);

  // Refetch jobs when filter changes
  useEffect(() => {
    if (tab === "jobs") fetchJobs();
  }, [jobFilter, fetchJobs, tab]);

  // Poll active jobs
  useEffect(() => {
    const activeJobs = jobs.filter(
      (j) => j.status === "queued" || j.status === "running",
    );
    if (activeJobs.length === 0) return;

    const timer = setInterval(async () => {
      for (const job of activeJobs) {
        try {
          const res = await fetch(`/api/comfy/jobs/${job.id}?orgId=${orgId}`);
          if (res.ok) {
            const data = await res.json();
            setJobs((prev) =>
              prev.map((j) => (j.id === job.id ? data.job : j)),
            );
            if (data.job.status === "completed" && selectedJob === job.id) {
              setArtifacts(data.artifacts || []);
            }
          }
        } catch {
          // Ignore polling errors
        }
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [jobs, orgId, selectedJob]);

  // Health poll every 30s
  useEffect(() => {
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  /* ── Size preset handler ── */
  function handleSizePreset(idx: number) {
    setSizePreset(idx);
    setWidth(SIZE_PRESETS[idx].w);
    setHeight(SIZE_PRESETS[idx].h);
  }

  /* ── Submit workflow ── */
  async function handleSubmit() {
    if (!orgId || (!prompt.trim() && !rawWorkflowJson.trim())) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      let bodyPayload: Record<string, unknown>;

      if (showRawJson && rawWorkflowJson.trim()) {
        // Raw workflow mode
        const parsed = JSON.parse(rawWorkflowJson);
        bodyPayload = {
          orgId,
          workflow: parsed,
          workflowName: workflowName || "Custom Workflow",
        };
      } else {
        // Simple prompt mode — let the server build the workflow
        bodyPayload = {
          orgId,
          prompt,
          negativePrompt,
          workflowName: workflowName || "Text to Image",
          width,
          height,
          steps,
          cfg,
          sampler,
          scheduler,
          seed: seed === -1 ? undefined : seed,
          checkpoint: checkpoint || undefined,
          batchSize,
        };
      }

      const res = await fetch("/api/comfy/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit");
        return;
      }

      if (data.seed != null) setLastSeed(data.seed);
      setPrompt("");
      setWorkflowName("");
      fetchJobs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Upload image ── */
  async function handleUpload(file: File) {
    if (!orgId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`/api/comfy/upload?orgId=${orgId}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadHistory((prev) => [
          { name: data.name || file.name, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 9),
        ]);
      } else {
        setUploadHistory((prev) => [
          { name: `Error: ${data.error}`, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 9),
        ]);
      }
    } catch {
      setUploadHistory((prev) => [
        { name: "Upload failed", time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setUploading(false);
    }
  }

  /* ── Drag-and-drop ── */
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleUpload(file);
  }

  /* ── Select job ── */
  async function handleSelectJob(jobId: string) {
    setSelectedJob(selectedJob === jobId ? null : jobId);
    if (selectedJob === jobId) return;
    setArtifacts([]);
    try {
      const res = await fetch(`/api/comfy/jobs/${jobId}?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? data.job : j)),
        );
      }
    } catch {
      // Ignore
    }
  }

  /* ── Reuse seed ── */
  function reuseLastSeed() {
    if (lastSeed != null) setSeed(lastSeed);
  }

  /* ── Filtered jobs memo ── */
  const filteredJobs = useMemo(() => {
    if (jobFilter === "all") return jobs;
    return jobs.filter((j) => j.status === jobFilter);
  }, [jobs, jobFilter]);

  /* ── Not configured state ── */
  if (!configured) {
    return (
      <div className="space-y-6">
        <HeaderBar health={health} />
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-yellow-400 mx-auto" />
            <h2 className="text-lg font-semibold">ComfyUI Not Configured</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Set <code className="bg-muted px-1.5 py-0.5 rounded text-xs">COMFYUI_BASE_URL</code> in
              your environment to connect to a ComfyUI instance.
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
          <TabsTrigger value="generate" className="gap-1.5">
            <Paintbrush className="h-3.5 w-3.5" /> Generate
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-1.5">
            <Grid3X3 className="h-3.5 w-3.5" /> Gallery
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Jobs
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Upload
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> System
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════ Generate Tab ═══ */}
        <TabsContent value="generate" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Workflow name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Workflow Name (optional)
                </label>
                <input
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Text to Image"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                />
              </div>

              {/* Mode toggle: Prompt vs Raw JSON */}
              <div className="flex items-center gap-2">
                <Button
                  variant={showRawJson ? "ghost" : "default"}
                  size="sm"
                  onClick={() => setShowRawJson(false)}
                  className="gap-1.5 text-xs"
                >
                  <Paintbrush className="h-3 w-3" /> Prompt
                </Button>
                <Button
                  variant={showRawJson ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowRawJson(true)}
                  className="gap-1.5 text-xs"
                >
                  <FileJson className="h-3 w-3" /> Raw JSON
                </Button>
              </div>

              {showRawJson ? (
                /* ── Raw JSON editor ── */
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Workflow JSON
                  </label>
                  <textarea
                    value={rawWorkflowJson}
                    onChange={(e) => setRawWorkflowJson(e.target.value)}
                    placeholder='{"1": {"class_type": "CheckpointLoaderSimple", ...}}'
                    rows={10}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-y"
                  />
                </div>
              ) : (
                <>
                  {/* ── Prompt ── */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Prompt
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="A futuristic cityscape at sunset, cyberpunk style, highly detailed..."
                      rows={3}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
                    />
                  </div>

                  {/* ── Negative Prompt ── */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Negative Prompt
                    </label>
                    <textarea
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
                    />
                  </div>

                  {/* ── Advanced toggle ── */}
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {showAdvanced ? "Hide" : "Show"} Advanced Settings
                  </button>

                  {showAdvanced && (
                    <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-muted/5">
                      {/* Size presets */}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-2 block">
                          Image Size
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {SIZE_PRESETS.map((p, i) => (
                            <button
                              key={p.label}
                              onClick={() => handleSizePreset(i)}
                              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                                sizePreset === i
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                  : "bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent"
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-muted-foreground">Width</label>
                            <input
                              type="number"
                              value={width}
                              onChange={(e) => setWidth(Number(e.target.value))}
                              min={64}
                              max={2048}
                              step={64}
                              className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-muted-foreground">Height</label>
                            <input
                              type="number"
                              value={height}
                              onChange={(e) => setHeight(Number(e.target.value))}
                              min={64}
                              max={2048}
                              step={64}
                              className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Steps + CFG */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Steps: {steps}
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            value={steps}
                            onChange={(e) => setSteps(Number(e.target.value))}
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            CFG: {cfg}
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={30}
                            step={0.5}
                            value={cfg}
                            onChange={(e) => setCfg(Number(e.target.value))}
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>

                      {/* Sampler + Scheduler */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Sampler</label>
                          <select
                            value={sampler}
                            onChange={(e) => setSampler(e.target.value)}
                            className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          >
                            {availableSamplers.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Scheduler</label>
                          <select
                            value={scheduler}
                            onChange={(e) => setScheduler(e.target.value)}
                            className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          >
                            {availableSchedulers.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Checkpoint */}
                      {availableModels.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Checkpoint</label>
                          <select
                            value={checkpoint}
                            onChange={(e) => setCheckpoint(e.target.value)}
                            className="w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          >
                            <option value="">Default (sd_xl_base_1.0)</option>
                            {availableModels.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Seed + Batch */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Seed (-1 = random)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={seed}
                              onChange={(e) => setSeed(Number(e.target.value))}
                              className="flex-1 h-8 rounded border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSeed(-1)}
                              className="h-8 w-8 p-0"
                              title="Random seed"
                            >
                              <Dice5 className="h-3.5 w-3.5" />
                            </Button>
                            {lastSeed != null && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={reuseLastSeed}
                                className="h-8 px-2 text-[10px]"
                                title={`Reuse last seed: ${lastSeed}`}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                {lastSeed}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Batch Size
                          </label>
                          <input
                            type="number"
                            value={batchSize}
                            onChange={(e) => setBatchSize(Math.max(1, Math.min(8, Number(e.target.value))))}
                            min={1}
                            max={8}
                            className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {submitError && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || (!prompt.trim() && !rawWorkflowJson.trim())}
                  className="gap-2"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Generate
                </Button>
                {lastSeed != null && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Last seed: {lastSeed}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active jobs inline */}
          {jobs.filter((j) => j.status === "queued" || j.status === "running").length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Active Jobs
              </h3>
              <div className="space-y-2">
                {jobs
                  .filter((j) => j.status === "queued" || j.status === "running")
                  .map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      selected={selectedJob === job.id}
                      onClick={() => handleSelectJob(job.id)}
                      orgId={orgId!}
                      artifacts={selectedJob === job.id ? artifacts : []}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Recent completed */}
          {jobs.filter((j) => j.status === "completed").length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Recent Completed
              </h3>
              <div className="space-y-2">
                {jobs
                  .filter((j) => j.status === "completed")
                  .slice(0, 3)
                  .map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      selected={selectedJob === job.id}
                      onClick={() => handleSelectJob(job.id)}
                      orgId={orgId!}
                      artifacts={selectedJob === job.id ? artifacts : []}
                    />
                  ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════ Gallery Tab ═══ */}
        <TabsContent value="gallery" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">Gallery</h3>
              {galleryStats && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {galleryStats.totalArtifacts} images
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {galleryStats.completedJobs} jobs
                  </Badge>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchGallery}
              className="gap-1.5 text-xs"
            >
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
                No completed generations yet. Use the Generate tab to create images.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {gallery.flatMap((item) =>
                item.artifacts.map((art, artIdx) => (
                  <div
                    key={`${item.id}-${art.id}`}
                    className="group relative aspect-square rounded-lg border border-border overflow-hidden bg-muted/30 cursor-pointer hover:border-purple-500/40 transition-all"
                    onClick={() => setLightboxItem({ gallery: item, artifactIndex: artIdx })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        art.url ||
                        `/api/comfy/images?orgId=${orgId}&filename=${encodeURIComponent(art.filename)}&subfolder=${encodeURIComponent(art.subfolder)}`
                      }
                      alt={item.prompt || art.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                      <p className="text-[10px] text-white/90 line-clamp-2">{item.prompt}</p>
                      {item.seed != null && (
                        <p className="text-[9px] text-white/50 font-mono mt-0.5">seed: {item.seed}</p>
                      )}
                    </div>
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="h-3.5 w-3.5 text-white/80" />
                    </div>
                  </div>
                )),
              )}
            </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════ Jobs Tab ═══ */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">All Jobs</h3>
              {/* Filter pills */}
              <div className="flex gap-1">
                {["all", "queued", "running", "completed", "failed"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setJobFilter(f)}
                    className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                      jobFilter === f
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchJobs}
              className="gap-1.5 text-xs"
            >
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
                {jobFilter === "all"
                  ? "No jobs yet. Use the Generate tab to submit a workflow."
                  : `No ${jobFilter} jobs.`}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selectedJob === job.id}
                  onClick={() => handleSelectJob(job.id)}
                  orgId={orgId!}
                  artifacts={selectedJob === job.id ? artifacts : []}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════ Upload Tab ═══ */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`text-center p-8 rounded-lg border-2 border-dashed transition-colors ${
                  dragOver
                    ? "border-purple-500/60 bg-purple-500/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <Upload className={`h-10 w-10 mx-auto mb-3 ${dragOver ? "text-purple-400" : "text-muted-foreground"}`} />
                <p className="text-sm text-muted-foreground mb-4">
                  Drag & drop images here, or click to browse.
                  <br />
                  <span className="text-[10px]">
                    Uploads to ComfyUI&apos;s input directory for use in workflows.
                  </span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files) {
                      Array.from(files).forEach((file) => handleUpload(file));
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Choose Images
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Upload history */}
          {uploadHistory.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Upload History
                </h4>
                <div className="space-y-1">
                  {uploadHistory.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className={entry.name.startsWith("Error") ? "text-red-400" : "text-foreground"}>
                        {entry.name}
                      </span>
                      <span className="text-muted-foreground text-[10px]">{entry.time}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════ System Tab ═══ */}
        <TabsContent value="system" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">System Diagnostics</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchSystem}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {/* Connection stats */}
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
                      health.latencyMs < 100 ? "text-green-400" : health.latencyMs < 500 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {health.latencyMs}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {systemError ? (
            <Card>
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-400">{systemError}</p>
              </CardContent>
            </Card>
          ) : !system ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Queue stats */}
              {queue && (
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Running" value={queue.running} color="#22c55e" />
                  <StatCard label="Pending" value={queue.pending} color="#3b82f6" />
                </div>
              )}

              {/* Org stats */}
              {galleryStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Total Jobs" value={galleryStats.totalJobs} color="#a78bfa" />
                  <StatCard label="Completed" value={galleryStats.completedJobs} color="#22c55e" />
                  <StatCard label="Failed" value={galleryStats.failedJobs} color="#ef4444" />
                  <StatCard label="Images" value={galleryStats.totalArtifacts} color="#f59e0b" />
                </div>
              )}

              {/* System info */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">OS</span>
                    <span className="font-mono text-xs">{system.system.os}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Python</span>
                    <span className="font-mono text-xs">{system.system.python_version}</span>
                  </div>
                </CardContent>
              </Card>

              {/* GPU devices */}
              {system.devices.map((device, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{device.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {device.type}
                      </Badge>
                    </div>
                    {/* System VRAM */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>VRAM</span>
                        <span>
                          {formatBytes(device.vram_free)} free / {formatBytes(device.vram_total)}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{
                            width: `${device.vram_total > 0 ? ((device.vram_total - device.vram_free) / device.vram_total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    {/* Torch VRAM (if available) */}
                    {device.torch_vram_total != null && device.torch_vram_total > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Torch VRAM</span>
                          <span>
                            {formatBytes(device.torch_vram_free || 0)} free / {formatBytes(device.torch_vram_total)}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all"
                            style={{
                              width: `${device.torch_vram_total > 0 ? ((device.torch_vram_total - (device.torch_vram_free || 0)) / device.torch_vram_total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Available models list */}
              {availableModels.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Available Checkpoints ({availableModels.length})
                    </h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {availableModels.map((m) => (
                        <div key={m} className="text-xs font-mono text-foreground/80 py-0.5">
                          {m}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════ Lightbox ═══ */}
      {lightboxItem && (
        <Lightbox
          item={lightboxItem.gallery}
          artifactIndex={lightboxItem.artifactIndex}
          orgId={orgId!}
          onClose={() => setLightboxItem(null)}
          onNext={() => {
            const allArtifacts = gallery.flatMap((g) =>
              g.artifacts.map((a, ai) => ({ gallery: g, artifactIndex: ai })),
            );
            const currentIdx = allArtifacts.findIndex(
              (x) =>
                x.gallery.id === lightboxItem.gallery.id &&
                x.artifactIndex === lightboxItem.artifactIndex,
            );
            if (currentIdx >= 0 && currentIdx < allArtifacts.length - 1) {
              setLightboxItem(allArtifacts[currentIdx + 1]);
            }
          }}
          onPrev={() => {
            const allArtifacts = gallery.flatMap((g) =>
              g.artifacts.map((a, ai) => ({ gallery: g, artifactIndex: ai })),
            );
            const currentIdx = allArtifacts.findIndex(
              (x) =>
                x.gallery.id === lightboxItem.gallery.id &&
                x.artifactIndex === lightboxItem.artifactIndex,
            );
            if (currentIdx > 0) {
              setLightboxItem(allArtifacts[currentIdx - 1]);
            }
          }}
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
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
          <Paintbrush className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">ComfyUI</h1>
          <p className="text-sm text-muted-foreground">
            AI image generation through your ComfyUI instance
          </p>
        </div>
      </div>
      {/* Connection indicator */}
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

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  queued: { icon: Clock, color: "text-blue-400", label: "Queued" },
  running: { icon: Loader2, color: "text-amber-400", label: "Running" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
  interrupted: { icon: StopCircle, color: "text-orange-400", label: "Interrupted" },
};

function JobCard({
  job,
  selected,
  onClick,
  orgId,
  artifacts,
}: {
  job: ComfyJobView;
  selected: boolean;
  onClick: () => void;
  orgId: string;
  artifacts: ComfyArtifactView[];
}) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
  const StatusIcon = config.icon;

  return (
    <Card
      className={`cursor-pointer transition-colors ${selected ? "border-purple-500/40" : "hover:border-border/80"}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon
              className={`h-4 w-4 ${config.color} ${job.status === "running" ? "animate-spin" : ""}`}
            />
            <span className="text-sm font-medium">{job.workflowName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {job.isFavorite && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
            <Badge variant="outline" className={`text-[10px] ${config.color}`}>
              {config.label}
            </Badge>
          </div>
        </div>

        {job.prompt && (
          <p className="text-xs text-muted-foreground truncate mb-1">{job.prompt}</p>
        )}

        {/* Generation params summary */}
        {(job.width || job.steps || job.sampler || job.seed != null) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {job.width && job.height && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                {job.width}x{job.height}
              </span>
            )}
            {job.steps && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                {job.steps} steps
              </span>
            )}
            {job.cfg && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                cfg {job.cfg}
              </span>
            )}
            {job.sampler && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                {job.sampler}
              </span>
            )}
            {job.seed != null && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                seed {job.seed}
              </span>
            )}
          </div>
        )}

        {job.status === "running" && (
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
        {job.error && (
          <p className="text-xs text-red-400 mt-1">{job.error}</p>
        )}
        {job.createdAt && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(job.createdAt).toLocaleString()}
          </p>
        )}

        {/* Artifacts */}
        {selected && artifacts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Output Images ({artifacts.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {artifacts.map((art) => (
                <div
                  key={art.id}
                  className="aspect-square rounded-md border border-border overflow-hidden bg-muted/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      art.url ||
                      `/api/comfy/images?orgId=${orgId}&filename=${encodeURIComponent(art.filename)}&subfolder=${encodeURIComponent(art.subfolder)}`
                    }
                    alt={art.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Lightbox({
  item,
  artifactIndex,
  orgId,
  onClose,
  onNext,
  onPrev,
}: {
  item: GalleryItem;
  artifactIndex: number;
  orgId: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const art = item.artifacts[artifactIndex];
  if (!art) return null;

  const imgUrl =
    art.url ||
    `/api/comfy/images?orgId=${orgId}&filename=${encodeURIComponent(art.filename)}&subfolder=${encodeURIComponent(art.subfolder)}`;

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onNext, onPrev]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex" onClick={onClose}>
      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-6 w-6 text-white" />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgUrl}
          alt={item.prompt || art.filename}
          className="max-w-full max-h-[90vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />

        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="h-6 w-6 text-white" />
        </button>

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

        {item.negativePrompt && (
          <div className="mb-3">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Negative</label>
            <p className="text-xs mt-0.5 text-muted-foreground">{item.negativePrompt}</p>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {item.width && item.height && (
            <MetaRow label="Size" value={`${item.width} x ${item.height}`} />
          )}
          {item.steps && <MetaRow label="Steps" value={String(item.steps)} />}
          {item.cfg && <MetaRow label="CFG" value={String(item.cfg)} />}
          {item.sampler && <MetaRow label="Sampler" value={item.sampler} />}
          {item.seed != null && <MetaRow label="Seed" value={String(item.seed)} />}
          {item.checkpoint && <MetaRow label="Checkpoint" value={item.checkpoint} />}
        </div>

        {item.createdAt && (
          <p className="text-[10px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleString()}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <a
            href={imgUrl}
            download={art.filename}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-xs transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-3 w-3" /> Download
          </a>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px]">{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <span className="text-2xl font-bold" style={{ color }}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════
   Helpers
   ═══════════════════════════════════════ */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
