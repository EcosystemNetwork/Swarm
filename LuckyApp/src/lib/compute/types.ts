/**
 * Swarm Compute — Core Types
 *
 * All interfaces, enums, and constants for the compute module.
 * Every other compute file depends on this.
 */

// ═══════════════════════════════════════════════════════════════
// Enums & Literal Types
// ═══════════════════════════════════════════════════════════════

export type ComputerStatus =
  | "provisioning"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error"
  | "snapshotting";

export type ControllerType = "human" | "agent" | "hybrid";

export type ModelKey = "claude" | "openai" | "gemini" | "generic";

export type SizeKey = "small" | "medium" | "large" | "xl";

export type Region = "us-east" | "us-west" | "eu-west" | "ap-southeast";

export type ComputerMode =
  | "blank"
  | "browser"
  | "developer"
  | "openclaw"
  | "trading"
  | "template";

export type TemplateCategory =
  | "dev"
  | "browser"
  | "research"
  | "trading"
  | "openclaw"
  | "design"
  | "web3"
  | "sales";

export type ActionType =
  | "screenshot"
  | "click"
  | "double_click"
  | "drag"
  | "type"
  | "key"
  | "scroll"
  | "wait"
  | "bash"
  | "exec";

export type ActionStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export type MemoryScopeType = "workspace" | "computer" | "agent" | "user";

export type EmbedMode = "read_only" | "interactive";

export type UsageMetricType =
  | "compute_hours"
  | "storage_gb"
  | "network_gb"
  | "actions"
  | "sessions";

export type FileVisibility = "private" | "workspace" | "public";

export type FileProvenance = "upload" | "export" | "snapshot" | "template";

// ═══════════════════════════════════════════════════════════════
// Constants & Presets
// ═══════════════════════════════════════════════════════════════

export const SIZE_PRESETS: Record<SizeKey, { cpu: number; ram: number; disk: number; label: string }> = {
  small:  { cpu: 2,  ram: 4096,   disk: 20,  label: "Small (2 CPU, 4 GB)" },
  medium: { cpu: 4,  ram: 8192,   disk: 50,  label: "Medium (4 CPU, 8 GB)" },
  large:  { cpu: 8,  ram: 16384,  disk: 100, label: "Large (8 CPU, 16 GB)" },
  xl:     { cpu: 16, ram: 32768,  disk: 200, label: "XL (16 CPU, 32 GB)" },
};

export const MODE_PRESETS: Record<ComputerMode, { label: string; description: string; icon: string; defaultSize: SizeKey }> = {
  blank:     { label: "Blank Ubuntu Desktop",        description: "Clean Ubuntu desktop with no preinstalled tools",     icon: "Monitor",    defaultSize: "small" },
  browser:   { label: "Browser Automation",           description: "Chrome + Playwright + automation tools",              icon: "Globe",      defaultSize: "medium" },
  developer: { label: "Developer Workstation",        description: "VS Code, Node, Python, Docker, Git preinstalled",    icon: "Code",       defaultSize: "medium" },
  openclaw:  { label: "OpenClaw Runtime",             description: "OpenClaw workspace with ML tools and notebooks",     icon: "Brain",      defaultSize: "large" },
  trading:   { label: "Trading & Research",           description: "Python, Jupyter, data APIs, chart tools",            icon: "TrendingUp", defaultSize: "medium" },
  template:  { label: "From Template",                description: "Launch from a saved or marketplace template",        icon: "LayoutGrid", defaultSize: "medium" },
};

export const REGION_LABELS: Record<Region, string> = {
  "us-east":      "US East (Virginia)",
  "us-west":      "US West (Oregon)",
  "eu-west":      "EU West (Ireland)",
  "ap-southeast": "Asia Pacific (Singapore)",
};

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  dev:      "Development",
  browser:  "Browser Automation",
  research: "Research",
  trading:  "Trading",
  openclaw: "OpenClaw",
  design:   "Design & Content",
  web3:     "Web3",
  sales:    "Sales & Outreach",
};

export const STATUS_COLORS: Record<ComputerStatus, { label: string; color: string; bg: string }> = {
  provisioning: { label: "Provisioning", color: "text-blue-400",   bg: "bg-blue-500/20" },
  starting:     { label: "Starting",     color: "text-amber-400",  bg: "bg-amber-500/20" },
  running:      { label: "Running",      color: "text-emerald-400", bg: "bg-emerald-500/20" },
  stopping:     { label: "Stopping",     color: "text-amber-400",  bg: "bg-amber-500/20" },
  stopped:      { label: "Stopped",      color: "text-gray-400",   bg: "bg-gray-500/20" },
  error:        { label: "Error",        color: "text-red-400",    bg: "bg-red-500/20" },
  snapshotting: { label: "Snapshotting",  color: "text-purple-400", bg: "bg-purple-500/20" },
};

export const MODEL_LABELS: Record<ModelKey, { label: string; description: string }> = {
  claude:  { label: "Claude",  description: "Anthropic Claude — best for complex reasoning and safety" },
  openai:  { label: "OpenAI",  description: "OpenAI GPT — strong general-purpose model" },
  gemini:  { label: "Gemini",  description: "Google Gemini — multimodal with vision" },
  generic: { label: "Generic", description: "Structured action loop — any compatible model" },
};

export const ACTION_TIMEOUTS: Record<ActionType, number> = {
  screenshot:   10_000,
  click:         5_000,
  double_click:  5_000,
  drag:         10_000,
  type:         10_000,
  key:           5_000,
  scroll:        5_000,
  wait:         60_000,
  bash:         120_000,
  exec:         120_000,
};

export const DEFAULT_AUTO_STOP_MINUTES = 30;
export const DEFAULT_RESOLUTION = { width: 1280, height: 720 };

// ═══════════════════════════════════════════════════════════════
// Interfaces — Firestore Documents
// ═══════════════════════════════════════════════════════════════

export interface Workspace {
  id: string;
  orgId: string;
  ownerUserId: string;
  name: string;
  slug: string;
  description: string;
  planTier: string;
  defaultAutoStopMinutes: number;
  allowedInstanceSizes: SizeKey[];
  staticIpEnabled: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  createdAt: Date | null;
}

export interface Computer {
  id: string;
  workspaceId: string;
  orgId: string;
  name: string;
  status: ComputerStatus;
  provider: string;
  providerInstanceId: string | null;
  templateId: string | null;
  sizeKey: SizeKey;
  cpuCores: number;
  ramMb: number;
  diskGb: number;
  resolutionWidth: number;
  resolutionHeight: number;
  region: Region;
  persistenceEnabled: boolean;
  staticIpEnabled: boolean;
  autoStopMinutes: number;
  controllerType: ControllerType;
  modelKey: ModelKey | null;
  createdByUserId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastActiveAt: Date | null;
}

export interface ComputerSnapshot {
  id: string;
  computerId: string;
  providerSnapshotId: string;
  label: string;
  createdAt: Date | null;
}

export interface ComputerSession {
  id: string;
  computerId: string;
  workspaceId: string;
  controllerType: ControllerType;
  userId: string | null;
  modelKey: ModelKey | null;
  startedAt: Date | null;
  endedAt: Date | null;
  totalActions: number;
  totalScreenshots: number;
  recordingUrl: string | null;
  estimatedCostCents: number;
}

export interface ComputerAction {
  id: string;
  sessionId: string;
  computerId: string;
  actionType: ActionType;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: ActionStatus;
  createdAt: Date | null;
}

export interface ComputeFile {
  id: string;
  workspaceId: string;
  computerId: string | null;
  uploaderUserId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  visibility: FileVisibility;
  provenanceType: FileProvenance;
  createdAt: Date | null;
}

export interface ComputeTemplate {
  id: string;
  workspaceId: string | null;
  creatorUserId: string;
  name: string;
  slug: string;
  description: string;
  category: TemplateCategory;
  baseImage: string;
  installManifest: Record<string, unknown>;
  startupScript: string;
  requiredSecrets: string[];
  recommendedModels: ModelKey[];
  isPublic: boolean;
  paidModReady: boolean;
  futurePriceCents: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface MemoryEntry {
  id: string;
  scopeType: MemoryScopeType;
  scopeId: string;
  workspaceId: string | null;
  computerId: string | null;
  agentId: string | null;
  createdByUserId: string | null;
  content: string;
  embeddingRef: string | null;
  tags: string[];
  pinned: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface EmbedToken {
  id: string;
  workspaceId: string;
  computerId: string;
  mode: EmbedMode;
  allowedOrigins: string[];
  expiresAt: Date | null;
  createdByUserId: string;
  createdAt: Date | null;
}

export interface UsageRecord {
  id: string;
  workspaceId: string;
  computerId: string | null;
  metricType: UsageMetricType;
  quantity: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  estimatedCostCents: number;
  createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Action Envelope — Internal Contract
// ═══════════════════════════════════════════════════════════════

export interface ActionEnvelope {
  actionType: ActionType;
  targetComputerId: string;
  sessionId: string;
  actorType: "user" | "model" | "system";
  actorId: string;
  payload: Record<string, unknown>;
  timeoutMs: number;
  idempotencyKey: string;
}

export interface ActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// Provider Contract
// ═══════════════════════════════════════════════════════════════

export interface InstanceConfig {
  name: string;
  sizeKey: SizeKey;
  cpuCores: number;
  ramMb: number;
  diskGb: number;
  resolutionWidth: number;
  resolutionHeight: number;
  region: Region;
  baseImage: string;
  startupScript?: string;
  persistenceEnabled: boolean;
}

export interface ProviderResult {
  providerInstanceId: string;
  status: ComputerStatus;
}

// ═══════════════════════════════════════════════════════════════
// Usage Summary
// ═══════════════════════════════════════════════════════════════

export interface UsageSummary {
  totalComputeHours: number;
  totalStorageGb: number;
  totalActions: number;
  totalSessions: number;
  estimatedCostCents: number;
}
