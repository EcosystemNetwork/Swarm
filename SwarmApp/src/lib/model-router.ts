/**
 * LLM Model Router — Intelligent model selection with fallbacks
 *
 * Features:
 * - Cost-based routing with budget caps
 * - Circuit breaker pattern (5 failures → fallback)
 * - Fallback chains: primary → backup → tertiary
 * - Latency tracking and optimization
 * - Route decision logging for analytics
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { MODEL_PRICING, estimateCost } from "./usage";

// ─── Types ──────────────────────────────────────────────────────────

export type ModelName =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "gpt-3.5-turbo"
  | "claude-3.5-sonnet"
  | "claude-3-haiku"
  | "claude-3-opus"
  | "gemini-pro"
  | "gemini-1.5-pro"
  | "llama-3-70b"
  | "mistral-large";

export type RoutingReason =
  | "primary"
  | "cost_cap"
  | "rate_limit"
  | "circuit_breaker"
  | "latency_threshold"
  | "budget_exceeded";

export type CircuitState = "closed" | "open" | "half_open";

export interface RoutingStrategy {
  /** Primary model to use */
  primary: ModelName;
  /** Fallback chain in order of preference */
  fallbacks: ModelName[];
  /** Maximum cost per request in USD */
  maxCostPerRequest?: number;
  /** Daily budget cap in USD */
  dailyBudgetCap?: number;
  /** Maximum acceptable latency in ms */
  maxLatencyMs?: number;
  /** Enable circuit breaker */
  enableCircuitBreaker?: boolean;
}

export interface RoutingDecision {
  id: string;
  orgId: string;
  agentId: string;
  requestedModel: ModelName;
  selectedModel: ModelName;
  reason: RoutingReason;
  costSavings?: number;
  timestamp: Date | null;
}

export interface ModelHealth {
  model: ModelName;
  failureCount: number;
  lastFailure: Date | null;
  circuitState: CircuitState;
  lastStateChange: Date | null;
}

export interface RouteRequest {
  orgId: string;
  agentId: string;
  preferredModel: ModelName;
  estimatedTokensIn: number;
  estimatedTokensOut: number;
}

export interface RouteResponse {
  selectedModel: ModelName;
  reason: RoutingReason;
  costSavings: number;
  fallbackChain: ModelName[];
}

// ─── Constants ──────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 5; // Failures before opening circuit
const CIRCUIT_BREAKER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HALF_OPEN_TEST_COUNT = 1; // Requests to test before closing

// Default fallback chains by model tier
const DEFAULT_FALLBACK_CHAINS: Record<ModelName, ModelName[]> = {
  "gpt-4o": ["gpt-4o-mini", "claude-3.5-sonnet", "claude-3-haiku"],
  "gpt-4-turbo": ["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet"],
  "gpt-4o-mini": ["claude-3-haiku", "gemini-pro", "gpt-3.5-turbo"],
  "gpt-3.5-turbo": ["gemini-pro", "claude-3-haiku"],
  "claude-3.5-sonnet": ["claude-3-haiku", "gpt-4o-mini", "gemini-pro"],
  "claude-3-opus": ["claude-3.5-sonnet", "claude-3-haiku", "gpt-4o"],
  "claude-3-haiku": ["gemini-pro", "gpt-4o-mini", "gpt-3.5-turbo"],
  "gemini-pro": ["gpt-3.5-turbo", "claude-3-haiku"],
  "gemini-1.5-pro": ["gemini-pro", "claude-3.5-sonnet", "gpt-4o"],
  "llama-3-70b": ["mistral-large", "gpt-4o-mini", "claude-3-haiku"],
  "mistral-large": ["llama-3-70b", "claude-3.5-sonnet", "gpt-4o-mini"],
};

// ─── Circuit Breaker ────────────────────────────────────────────────

export async function getModelHealth(model: ModelName): Promise<ModelHealth> {
  const snap = await getDoc(doc(db, "modelHealth", model));
  if (!snap.exists()) {
    return {
      model,
      failureCount: 0,
      lastFailure: null,
      circuitState: "closed",
      lastStateChange: null,
    };
  }
  const data = snap.data();
  return {
    model,
    failureCount: data.failureCount || 0,
    lastFailure: data.lastFailure?.toDate() || null,
    circuitState: data.circuitState || "closed",
    lastStateChange: data.lastStateChange?.toDate() || null,
  };
}

export async function recordModelFailure(model: ModelName): Promise<void> {
  const health = await getModelHealth(model);
  const newFailureCount = health.failureCount + 1;

  let newState: CircuitState = health.circuitState;
  if (newFailureCount >= CIRCUIT_BREAKER_THRESHOLD && newState === "closed") {
    newState = "open";
  }

  await setDoc(doc(db, "modelHealth", model), {
    model,
    failureCount: newFailureCount,
    lastFailure: serverTimestamp(),
    circuitState: newState,
    lastStateChange: newState !== health.circuitState ? serverTimestamp() : health.lastStateChange,
  });
}

export async function recordModelSuccess(model: ModelName): Promise<void> {
  const health = await getModelHealth(model);

  // If half-open and success, close circuit
  if (health.circuitState === "half_open") {
    await setDoc(doc(db, "modelHealth", model), {
      model,
      failureCount: 0,
      lastFailure: null,
      circuitState: "closed",
      lastStateChange: serverTimestamp(),
    });
    return;
  }

  // Reset failure count on success
  if (health.failureCount > 0) {
    await updateDoc(doc(db, "modelHealth", model), {
      failureCount: 0,
    });
  }
}

export async function checkCircuitBreaker(model: ModelName): Promise<boolean> {
  const health = await getModelHealth(model);

  if (health.circuitState === "closed") return true;

  if (health.circuitState === "open") {
    // Check if timeout has passed
    if (health.lastStateChange) {
      const timeoutExpired =
        Date.now() - health.lastStateChange.getTime() > CIRCUIT_BREAKER_TIMEOUT_MS;
      if (timeoutExpired) {
        // Move to half-open
        await updateDoc(doc(db, "modelHealth", model), {
          circuitState: "half_open",
          lastStateChange: serverTimestamp(),
        });
        return true; // Allow one test request
      }
    }
    return false; // Circuit still open
  }

  // Half-open state allows requests
  return true;
}

export async function resetCircuitBreaker(model: ModelName): Promise<void> {
  await setDoc(doc(db, "modelHealth", model), {
    model,
    failureCount: 0,
    lastFailure: null,
    circuitState: "closed",
    lastStateChange: serverTimestamp(),
  });
}

// ─── Budget Tracking ────────────────────────────────────────────────

export async function getDailySpend(orgId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = Timestamp.fromDate(today);

  const q = query(
    collection(db, "usageRecords"),
    where("orgId", "==", orgId),
    where("timestamp", ">=", todayTimestamp)
  );

  const snap = await getDocs(q);
  let totalCost = 0;
  snap.forEach((doc) => {
    totalCost += doc.data().costUsd || 0;
  });

  return totalCost;
}

// ─── Model Router ───────────────────────────────────────────────────

export async function routeRequest(
  request: RouteRequest,
  strategy?: RoutingStrategy
): Promise<RouteResponse> {
  const { orgId, agentId, preferredModel, estimatedTokensIn, estimatedTokensOut } = request;

  // Use default fallback chain if no strategy provided
  const fallbackChain = strategy?.fallbacks || DEFAULT_FALLBACK_CHAINS[preferredModel] || [];
  const maxCostPerRequest = strategy?.maxCostPerRequest;
  const dailyBudgetCap = strategy?.dailyBudgetCap;
  const enableCircuitBreaker = strategy?.enableCircuitBreaker !== false;

  // Estimate cost for primary model
  const primaryCost = estimateCost(preferredModel, estimatedTokensIn, estimatedTokensOut);

  // Check daily budget cap
  if (dailyBudgetCap) {
    const dailySpend = await getDailySpend(orgId);
    if (dailySpend + primaryCost > dailyBudgetCap) {
      // Use cheapest model in fallback chain
      const cheapestModel = findCheapestModel(
        [preferredModel, ...fallbackChain],
        estimatedTokensIn,
        estimatedTokensOut
      );
      const cheapestCost = estimateCost(cheapestModel, estimatedTokensIn, estimatedTokensOut);
      await logRoutingDecision(orgId, agentId, preferredModel, cheapestModel, "budget_exceeded", primaryCost - cheapestCost);
      return {
        selectedModel: cheapestModel,
        reason: "budget_exceeded",
        costSavings: primaryCost - cheapestCost,
        fallbackChain,
      };
    }
  }

  // Check per-request cost cap
  if (maxCostPerRequest && primaryCost > maxCostPerRequest) {
    // Find first fallback under cost cap
    for (const fallback of fallbackChain) {
      const fallbackCost = estimateCost(fallback, estimatedTokensIn, estimatedTokensOut);
      if (fallbackCost <= maxCostPerRequest) {
        await logRoutingDecision(orgId, agentId, preferredModel, fallback, "cost_cap", primaryCost - fallbackCost);
        return {
          selectedModel: fallback,
          reason: "cost_cap",
          costSavings: primaryCost - fallbackCost,
          fallbackChain,
        };
      }
    }
  }

  // Check circuit breaker
  if (enableCircuitBreaker) {
    const primaryAvailable = await checkCircuitBreaker(preferredModel);
    if (!primaryAvailable) {
      // Use first available fallback
      for (const fallback of fallbackChain) {
        const fallbackAvailable = await checkCircuitBreaker(fallback);
        if (fallbackAvailable) {
          const fallbackCost = estimateCost(fallback, estimatedTokensIn, estimatedTokensOut);
          await logRoutingDecision(orgId, agentId, preferredModel, fallback, "circuit_breaker", primaryCost - fallbackCost);
          return {
            selectedModel: fallback,
            reason: "circuit_breaker",
            costSavings: primaryCost - fallbackCost,
            fallbackChain,
          };
        }
      }
      // All models circuit-broken, fallback to cheapest
      const cheapestModel = findCheapestModel(
        [preferredModel, ...fallbackChain],
        estimatedTokensIn,
        estimatedTokensOut
      );
      const cheapestCost = estimateCost(cheapestModel, estimatedTokensIn, estimatedTokensOut);
      await logRoutingDecision(orgId, agentId, preferredModel, cheapestModel, "circuit_breaker", primaryCost - cheapestCost);
      return {
        selectedModel: cheapestModel,
        reason: "circuit_breaker",
        costSavings: primaryCost - cheapestCost,
        fallbackChain,
      };
    }
  }

  // No routing needed - use primary
  await logRoutingDecision(orgId, agentId, preferredModel, preferredModel, "primary", 0);
  return {
    selectedModel: preferredModel,
    reason: "primary",
    costSavings: 0,
    fallbackChain,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function findCheapestModel(
  models: ModelName[],
  tokensIn: number,
  tokensOut: number
): ModelName {
  let cheapest = models[0];
  let lowestCost = estimateCost(cheapest, tokensIn, tokensOut);

  for (let i = 1; i < models.length; i++) {
    const cost = estimateCost(models[i], tokensIn, tokensOut);
    if (cost < lowestCost) {
      cheapest = models[i];
      lowestCost = cost;
    }
  }

  return cheapest;
}

export async function logRoutingDecision(
  orgId: string,
  agentId: string,
  requestedModel: ModelName,
  selectedModel: ModelName,
  reason: RoutingReason,
  costSavings: number
): Promise<void> {
  await setDoc(doc(collection(db, "routingDecisions")), {
    orgId,
    agentId,
    requestedModel,
    selectedModel,
    reason,
    costSavings,
    timestamp: serverTimestamp(),
  });
}

// ─── Per-Request Model Switching ────────────────────────────────────
//
// Enables a single agent to use different models for different tasks within
// the same session. The agent (or orchestrator) specifies a "task role" and
// the model policy decides which provider/model to use.
//
// Task roles:
//   reasoning  — complex analysis, planning (use strongest model)
//   coding     — code generation, debugging (models with good code benchmarks)
//   fast       — simple extraction, classification (cheapest/fastest)
//   creative   — writing, brainstorming (models with good creative output)
//   vision     — image understanding (multimodal models only)
//   embedding  — text embeddings (embedding-specific models)
//
// This replaces the static "one provider per ecto" limitation.

export type TaskRole = "reasoning" | "coding" | "fast" | "creative" | "vision" | "embedding";

export interface ModelPolicy {
  /** Human-readable name for this policy */
  name: string;
  /** Default model for unspecified roles */
  defaultModel: ModelName;
  /** Model assignment per task role */
  roleModels: Partial<Record<TaskRole, ModelName>>;
  /** Maximum concurrent requests across all models */
  maxConcurrentRequests?: number;
  /** Daily budget cap (shared across all models in this policy) */
  dailyBudgetCap?: number;
}

/** Built-in policies */
export const MODEL_POLICIES: Record<string, ModelPolicy> = {
  balanced: {
    name: "Balanced",
    defaultModel: "gpt-4o",
    roleModels: {
      reasoning: "claude-3.5-sonnet",
      coding: "gpt-4o",
      fast: "gpt-4o-mini",
      creative: "claude-3.5-sonnet",
      vision: "gpt-4o",
    },
  },
  performance: {
    name: "Performance",
    defaultModel: "claude-3-opus",
    roleModels: {
      reasoning: "claude-3-opus",
      coding: "gpt-4o",
      fast: "claude-3-haiku",
      creative: "claude-3-opus",
      vision: "gemini-1.5-pro",
    },
  },
  budget: {
    name: "Budget",
    defaultModel: "gpt-4o-mini",
    roleModels: {
      reasoning: "gpt-4o-mini",
      coding: "gpt-4o-mini",
      fast: "gpt-3.5-turbo",
      creative: "claude-3-haiku",
      vision: "gemini-pro",
    },
    dailyBudgetCap: 5.0,
  },
  anthropic_first: {
    name: "Anthropic First",
    defaultModel: "claude-3.5-sonnet",
    roleModels: {
      reasoning: "claude-3-opus",
      coding: "claude-3.5-sonnet",
      fast: "claude-3-haiku",
      creative: "claude-3-opus",
      vision: "claude-3.5-sonnet",
    },
  },
  openai_first: {
    name: "OpenAI First",
    defaultModel: "gpt-4o",
    roleModels: {
      reasoning: "gpt-4o",
      coding: "gpt-4o",
      fast: "gpt-4o-mini",
      creative: "gpt-4o",
      vision: "gpt-4o",
    },
  },
};

export interface MultiModelRequest extends RouteRequest {
  /** Task role for model selection */
  taskRole?: TaskRole;
  /** Policy name or custom policy */
  policy?: string | ModelPolicy;
}

/**
 * Route a request using per-request model switching.
 *
 * Unlike `routeRequest` which uses a single preferred model with fallbacks,
 * this selects the model based on task role + policy, then applies the same
 * circuit breaker and budget logic on top.
 */
export async function routeMultiModelRequest(
  request: MultiModelRequest,
): Promise<RouteResponse> {
  const { taskRole, policy: policyInput } = request;

  // Resolve policy
  let policy: ModelPolicy;
  if (!policyInput) {
    policy = MODEL_POLICIES.balanced;
  } else if (typeof policyInput === "string") {
    policy = MODEL_POLICIES[policyInput] || MODEL_POLICIES.balanced;
  } else {
    policy = policyInput;
  }

  // Select model for this task role
  const selectedModel = taskRole
    ? (policy.roleModels[taskRole] || policy.defaultModel)
    : policy.defaultModel;

  // Build a routing strategy from the policy
  const strategy: RoutingStrategy = {
    primary: selectedModel,
    fallbacks: DEFAULT_FALLBACK_CHAINS[selectedModel] || [],
    dailyBudgetCap: policy.dailyBudgetCap,
    enableCircuitBreaker: true,
  };

  // Delegate to existing routing logic (circuit breaker, budget, fallbacks)
  return routeRequest(
    { ...request, preferredModel: selectedModel },
    strategy,
  );
}

/**
 * Get the recommended model for a task role without routing (no side effects).
 */
export function getModelForRole(
  taskRole: TaskRole,
  policyName?: string,
): ModelName {
  const policy = policyName
    ? (MODEL_POLICIES[policyName] || MODEL_POLICIES.balanced)
    : MODEL_POLICIES.balanced;
  return policy.roleModels[taskRole] || policy.defaultModel;
}

/**
 * List all available policies.
 */
export function listPolicies(): Array<{ name: string; key: string; policy: ModelPolicy }> {
  return Object.entries(MODEL_POLICIES).map(([key, policy]) => ({
    key,
    name: policy.name,
    policy,
  }));
}

// ─── Analytics ──────────────────────────────────────────────────────

export async function getRoutingStats(orgId: string, daysBack: number = 7): Promise<{
  decisions: RoutingDecision[];
  totalSavings: number;
  fallbackRate: number;
}> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceTimestamp = Timestamp.fromDate(since);

  const q = query(
    collection(db, "routingDecisions"),
    where("orgId", "==", orgId),
    where("timestamp", ">=", sinceTimestamp)
  );

  const snap = await getDocs(q);
  const decisions: RoutingDecision[] = [];
  let totalSavings = 0;
  let fallbackCount = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    const decision: RoutingDecision = {
      id: doc.id,
      orgId: data.orgId,
      agentId: data.agentId,
      requestedModel: data.requestedModel,
      selectedModel: data.selectedModel,
      reason: data.reason,
      costSavings: data.costSavings || 0,
      timestamp: data.timestamp?.toDate() || null,
    };
    decisions.push(decision);
    totalSavings += decision.costSavings ?? 0;
    if (decision.reason !== "primary") {
      fallbackCount++;
    }
  });

  return {
    decisions,
    totalSavings,
    fallbackRate: decisions.length > 0 ? fallbackCount / decisions.length : 0,
  };
}
