/**
 * Swarm Compute — Provider Abstraction
 *
 * Decouples all compute operations from any specific VM provider.
 * StubComputeProvider used for development; real providers (E2B, Fly, AWS) plugged in later.
 */

import type { InstanceConfig, ProviderResult, ActionEnvelope, ActionResult } from "./types";

// ═══════════════════════════════════════════════════════════════
// Provider Interface
// ═══════════════════════════════════════════════════════════════

export interface ComputeProvider {
  readonly name: string;
  createInstance(config: InstanceConfig): Promise<ProviderResult>;
  startInstance(providerInstanceId: string): Promise<void>;
  stopInstance(providerInstanceId: string): Promise<void>;
  restartInstance(providerInstanceId: string): Promise<void>;
  deleteInstance(providerInstanceId: string): Promise<void>;
  takeScreenshot(providerInstanceId: string): Promise<{ url: string; base64?: string }>;
  executeAction(providerInstanceId: string, action: ActionEnvelope): Promise<ActionResult>;
  getVncUrl(providerInstanceId: string): Promise<string>;
  getTerminalUrl(providerInstanceId: string): Promise<string>;
  createSnapshot(providerInstanceId: string, label: string): Promise<string>;
  cloneInstance(providerInstanceId: string, newName: string): Promise<string>;
}

// ═══════════════════════════════════════════════════════════════
// Stub Provider (Development)
// ═══════════════════════════════════════════════════════════════

export class StubComputeProvider implements ComputeProvider {
  readonly name = "stub";

  private counter = 0;

  private nextId(): string {
    return `stub-${Date.now()}-${++this.counter}`;
  }

  async createInstance(_config: InstanceConfig): Promise<ProviderResult> {
    return { providerInstanceId: this.nextId(), status: "stopped" };
  }

  async startInstance(_providerInstanceId: string): Promise<void> {
    // No-op in stub
  }

  async stopInstance(_providerInstanceId: string): Promise<void> {
    // No-op in stub
  }

  async restartInstance(_providerInstanceId: string): Promise<void> {
    // No-op in stub
  }

  async deleteInstance(_providerInstanceId: string): Promise<void> {
    // No-op in stub
  }

  async takeScreenshot(_providerInstanceId: string): Promise<{ url: string; base64?: string }> {
    return { url: "/placeholder-screenshot.png" };
  }

  async executeAction(_providerInstanceId: string, action: ActionEnvelope): Promise<ActionResult> {
    return {
      success: true,
      data: { actionType: action.actionType, stub: true },
      durationMs: 50,
    };
  }

  async getVncUrl(_providerInstanceId: string): Promise<string> {
    // Stub mode — return empty so viewers show placeholder
    return "";
  }

  async getTerminalUrl(_providerInstanceId: string): Promise<string> {
    // Stub mode — return empty so viewers show placeholder
    return "";
  }

  async createSnapshot(_providerInstanceId: string, _label: string): Promise<string> {
    return this.nextId();
  }

  async cloneInstance(_providerInstanceId: string, _newName: string): Promise<string> {
    return this.nextId();
  }
}

// ═══════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════

let cachedProvider: ComputeProvider | null = null;

export function getComputeProvider(): ComputeProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.COMPUTE_PROVIDER || "stub";

  switch (providerName) {
    // Future: case "e2b": cachedProvider = new E2BProvider(); break;
    // Future: case "fly": cachedProvider = new FlyProvider(); break;
    default:
      cachedProvider = new StubComputeProvider();
  }

  return cachedProvider;
}
