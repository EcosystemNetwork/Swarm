/**
 * Swarm Compute — Usage Metering & Billing
 *
 * Cost estimation, usage recording, summary aggregation,
 * and markup-aware pricing with ledger tracking.
 */

import type {
  SizeKey,
  Region,
  UsageSummary,
  PricingSettings,
  ProfitabilitySummary,
  BillingLedgerEntry,
} from "./types";
import {
  recordUsage,
  getUsage,
  createLedgerEntry,
  getAllLedgerEntries,
  getPricingSettings,
} from "./firestore";

// ═══════════════════════════════════════════════════════════════
// Provider Cost Constants (raw cost in cents per hour)
// ═══════════════════════════════════════════════════════════════

const PROVIDER_HOURLY_COST_CENTS: Record<SizeKey, number> = {
  small:  8,   // $0.08/hr raw provider cost
  medium: 16,  // $0.16/hr
  large:  32,  // $0.32/hr
  xl:     64,  // $0.64/hr
};

const STORAGE_COST_PER_GB_MONTH = 5; // $0.05/GB/month raw

// ═══════════════════════════════════════════════════════════════
// Markup Resolution
// ═══════════════════════════════════════════════════════════════

export function resolveMarkupPercent(
  settings: PricingSettings,
  sizeKey: SizeKey,
  region: Region,
  provider: string,
): number {
  // Check promo override first (if not expired)
  if (settings.promoOverride) {
    const expires = settings.promoOverride.expiresAt;
    if (!expires || expires.getTime() > Date.now()) {
      return settings.promoOverride.percent;
    }
  }

  // Provider-specific override
  if (settings.providerOverrides[provider] !== undefined) {
    return settings.providerOverrides[provider];
  }

  // Size-specific override
  if (settings.sizeOverrides[sizeKey] !== undefined) {
    return settings.sizeOverrides[sizeKey]!;
  }

  // Region-specific override
  if (settings.regionOverrides[region] !== undefined) {
    return settings.regionOverrides[region]!;
  }

  return settings.defaultMarkupPercent;
}

export function calculateCustomerPrice(
  providerCostCents: number,
  markupPercent: number,
  minimumFloorCents: number,
): { customerPriceCents: number; platformProfitCents: number } {
  const rawPrice = Math.ceil(providerCostCents * (1 + markupPercent / 100));
  const customerPriceCents = Math.max(rawPrice, minimumFloorCents);
  return {
    customerPriceCents,
    platformProfitCents: customerPriceCents - providerCostCents,
  };
}

// ═══════════════════════════════════════════════════════════════
// Provider Cost Estimation (raw)
// ═══════════════════════════════════════════════════════════════

export function estimateProviderHourlyCost(sizeKey: SizeKey): number {
  return PROVIDER_HOURLY_COST_CENTS[sizeKey] || PROVIDER_HOURLY_COST_CENTS.small;
}

/**
 * Customer-facing hourly cost (provider cost + markup).
 * Use this for UI display. Call with settings for dynamic pricing.
 */
export function estimateHourlyCost(sizeKey: SizeKey, settings?: PricingSettings): number {
  const providerCost = estimateProviderHourlyCost(sizeKey);
  if (!settings) {
    // Default 30% markup when settings not loaded
    return Math.ceil(providerCost * 1.3);
  }
  const markup = resolveMarkupPercent(settings, sizeKey, "us-east", "stub");
  return calculateCustomerPrice(providerCost, markup, settings.minimumPriceFloorCents).customerPriceCents;
}

export function estimateMonthlyCost(sizeKey: SizeKey, hoursPerDay: number, settings?: PricingSettings): number {
  return estimateHourlyCost(sizeKey, settings) * hoursPerDay * 30;
}

// ═══════════════════════════════════════════════════════════════
// Recording (with ledger entry)
// ═══════════════════════════════════════════════════════════════

export async function recordComputeHours(
  workspaceId: string,
  computerId: string,
  hours: number,
  sizeKey: SizeKey,
  opts?: {
    orgId?: string;
    sessionId?: string;
    provider?: string;
    region?: Region;
  },
): Promise<void> {
  const settings = await getPricingSettings();
  const provider = opts?.provider || "stub";
  const region = opts?.region || "us-east";
  const providerCostCents = Math.ceil(hours * estimateProviderHourlyCost(sizeKey));
  const markup = resolveMarkupPercent(settings, sizeKey, region, provider);
  const { customerPriceCents, platformProfitCents } = calculateCustomerPrice(
    providerCostCents,
    markup,
    settings.minimumPriceFloorCents,
  );

  // Record to usage collection (customer-facing)
  await recordUsage({
    workspaceId,
    computerId,
    metricType: "compute_hours",
    quantity: hours,
    periodStart: new Date(),
    periodEnd: new Date(),
    estimatedCostCents: customerPriceCents,
  });

  // Record to billing ledger (admin cost-vs-revenue)
  if (opts?.orgId) {
    await createLedgerEntry({
      orgId: opts.orgId,
      workspaceId,
      computerId,
      sessionId: opts.sessionId || null,
      provider,
      sizeKey,
      region,
      unitType: "compute_hour",
      quantity: hours,
      providerCostCents,
      markupPercent: markup,
      customerPriceCents,
      platformProfitCents,
    });
  }
}

export async function recordStorageUsage(
  workspaceId: string,
  sizeGb: number,
): Promise<void> {
  const providerCostCents = Math.ceil(sizeGb * STORAGE_COST_PER_GB_MONTH);
  const settings = await getPricingSettings();
  const markup = settings.defaultMarkupPercent;
  const { customerPriceCents } = calculateCustomerPrice(
    providerCostCents,
    markup,
    settings.minimumPriceFloorCents,
  );

  await recordUsage({
    workspaceId,
    computerId: null,
    metricType: "storage_gb",
    quantity: sizeGb,
    periodStart: new Date(),
    periodEnd: new Date(),
    estimatedCostCents: customerPriceCents,
  });
}

// ═══════════════════════════════════════════════════════════════
// Customer Summary
// ═══════════════════════════════════════════════════════════════

export async function getMonthlyUsageSummary(workspaceId: string): Promise<UsageSummary> {
  const records = await getUsage(workspaceId, { limit: 1000 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = records.filter(
    (r) => r.createdAt && r.createdAt.getTime() >= monthStart.getTime(),
  );

  const summary: UsageSummary = {
    totalComputeHours: 0,
    totalStorageGb: 0,
    totalActions: 0,
    totalSessions: 0,
    estimatedCostCents: 0,
  };

  for (const r of thisMonth) {
    summary.estimatedCostCents += r.estimatedCostCents;
    switch (r.metricType) {
      case "compute_hours":
        summary.totalComputeHours += r.quantity;
        break;
      case "storage_gb":
        summary.totalStorageGb += r.quantity;
        break;
      case "actions":
        summary.totalActions += r.quantity;
        break;
      case "sessions":
        summary.totalSessions += r.quantity;
        break;
    }
  }

  return summary;
}

// ═══════════════════════════════════════════════════════════════
// Admin Profitability Summary
// ═══════════════════════════════════════════════════════════════

export async function getProfitabilitySummary(opts?: {
  limit?: number;
}): Promise<ProfitabilitySummary> {
  const entries = await getAllLedgerEntries(opts?.limit || 1000);

  // Filter to current month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = entries.filter(
    (e) => e.createdAt && e.createdAt.getTime() >= monthStart.getTime(),
  );

  const summary: ProfitabilitySummary = {
    totalProviderCostCents: 0,
    totalCustomerRevenueCents: 0,
    totalPlatformProfitCents: 0,
    marginPercent: 0,
    entriesByProvider: {},
    entriesBySize: {},
    entriesByOrg: {},
    totalEntries: thisMonth.length,
  };

  for (const e of thisMonth) {
    summary.totalProviderCostCents += e.providerCostCents;
    summary.totalCustomerRevenueCents += e.customerPriceCents;
    summary.totalPlatformProfitCents += e.platformProfitCents;

    // By provider
    if (!summary.entriesByProvider[e.provider]) {
      summary.entriesByProvider[e.provider] = { cost: 0, revenue: 0, profit: 0 };
    }
    summary.entriesByProvider[e.provider].cost += e.providerCostCents;
    summary.entriesByProvider[e.provider].revenue += e.customerPriceCents;
    summary.entriesByProvider[e.provider].profit += e.platformProfitCents;

    // By size
    if (!summary.entriesBySize[e.sizeKey]) {
      summary.entriesBySize[e.sizeKey] = { cost: 0, revenue: 0, profit: 0 };
    }
    summary.entriesBySize[e.sizeKey].cost += e.providerCostCents;
    summary.entriesBySize[e.sizeKey].revenue += e.customerPriceCents;
    summary.entriesBySize[e.sizeKey].profit += e.platformProfitCents;

    // By org
    if (!summary.entriesByOrg[e.orgId]) {
      summary.entriesByOrg[e.orgId] = { cost: 0, revenue: 0, profit: 0, orgId: e.orgId };
    }
    summary.entriesByOrg[e.orgId].cost += e.providerCostCents;
    summary.entriesByOrg[e.orgId].revenue += e.customerPriceCents;
    summary.entriesByOrg[e.orgId].profit += e.platformProfitCents;
  }

  if (summary.totalCustomerRevenueCents > 0) {
    summary.marginPercent = Math.round(
      (summary.totalPlatformProfitCents / summary.totalCustomerRevenueCents) * 100,
    );
  }

  return summary;
}
