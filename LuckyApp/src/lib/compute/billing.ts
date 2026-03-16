/**
 * Swarm Compute — Usage Metering & Billing
 *
 * Cost estimation, usage recording, and summary aggregation.
 */

import type { SizeKey, UsageSummary } from "./types";
import { recordUsage, getUsage } from "./firestore";

// ═══════════════════════════════════════════════════════════════
// Cost Constants (cents per hour)
// ═══════════════════════════════════════════════════════════════

const HOURLY_COST_CENTS: Record<SizeKey, number> = {
  small:  8,   // $0.08/hr
  medium: 16,  // $0.16/hr
  large:  32,  // $0.32/hr
  xl:     64,  // $0.64/hr
};

// ═══════════════════════════════════════════════════════════════
// Estimation
// ═══════════════════════════════════════════════════════════════

export function estimateHourlyCost(sizeKey: SizeKey): number {
  return HOURLY_COST_CENTS[sizeKey] || HOURLY_COST_CENTS.small;
}

export function estimateMonthlyCost(sizeKey: SizeKey, hoursPerDay: number): number {
  return estimateHourlyCost(sizeKey) * hoursPerDay * 30;
}

// ═══════════════════════════════════════════════════════════════
// Recording
// ═══════════════════════════════════════════════════════════════

export async function recordComputeHours(
  workspaceId: string,
  computerId: string,
  hours: number,
  sizeKey: SizeKey,
): Promise<void> {
  await recordUsage({
    workspaceId,
    computerId,
    metricType: "compute_hours",
    quantity: hours,
    periodStart: new Date(),
    periodEnd: new Date(),
    estimatedCostCents: Math.ceil(hours * estimateHourlyCost(sizeKey)),
  });
}

export async function recordStorageUsage(
  workspaceId: string,
  sizeGb: number,
): Promise<void> {
  await recordUsage({
    workspaceId,
    computerId: null,
    metricType: "storage_gb",
    quantity: sizeGb,
    periodStart: new Date(),
    periodEnd: new Date(),
    estimatedCostCents: Math.ceil(sizeGb * 5), // $0.05/GB/month
  });
}

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════

export async function getMonthlyUsageSummary(workspaceId: string): Promise<UsageSummary> {
  const records = await getUsage(workspaceId, { limit: 1000 });

  const summary: UsageSummary = {
    totalComputeHours: 0,
    totalStorageGb: 0,
    totalActions: 0,
    totalSessions: 0,
    estimatedCostCents: 0,
  };

  for (const r of records) {
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
