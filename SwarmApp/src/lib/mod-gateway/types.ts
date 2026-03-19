/**
 * Mod Gateway — Types for mod service registration, discovery, and proxy.
 */

import type { MarketPricing } from "@/lib/skills";

/** How a mod service endpoint is described */
export interface ModEndpointDescriptor {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  authRequired: boolean;
  subscriptionRequired: boolean;
}

/** UI manifest for iframe/module-federation loading */
export interface ModUIManifest {
  /** URL to the mod's UI entrypoint (e.g., https://mod-gemini.run.app/ui) */
  entrypoint: string;
  /** Exposed module map for Module Federation (future) */
  exposedModules?: Record<string, string>;
  /** Shared deps for Module Federation (future) */
  sharedDeps?: string[];
}

/** Full registration payload a mod service sends on startup */
export interface ModServiceRegistration {
  modId: string;
  slug: string;
  name: string;
  version: string;
  vendor: string;
  description: string;
  icon: string;
  category: string;
  tags: string[];
  pricing: MarketPricing;
  requiredKeys?: string[];
  requires?: string[];

  /** Base URL of the mod service */
  serviceUrl: string;
  /** Health endpoint path (relative to serviceUrl) */
  healthEndpoint: string;
  /** API endpoints exposed by this mod */
  apiEndpoints: ModEndpointDescriptor[];

  /** UI manifest for loading mod UI in the platform */
  uiManifest?: ModUIManifest;

  /** Sidebar config — how this mod appears in navigation */
  sidebarConfig?: {
    sectionId: string;
    label: string;
    href: string;
    iconName: string;
    parentModId?: string;
  };
}

/** Stored in Firestore `modServiceRegistry` collection */
export interface ModServiceEntry extends ModServiceRegistration {
  status: "active" | "degraded" | "offline";
  lastHealthCheck: string | null;
  registeredAt: string;
  updatedAt: string;
}

/** Health check response from a mod service */
export interface ModHealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  lastCheckedAt: string;
}

/** Result of a subscription access check */
export interface ModAccessResult {
  allowed: boolean;
  reason?: string;
  subscriptionId?: string;
}
