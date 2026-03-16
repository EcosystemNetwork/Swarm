"use client";

import type { UsageSummary } from "@/lib/compute/types";

interface UsageChartProps {
  summary: UsageSummary;
}

export function UsageChart({ summary }: UsageChartProps) {
  const metrics = [
    {
      label: "Compute Hours",
      value: summary.totalComputeHours.toFixed(1),
      unit: "hrs",
      color: "bg-blue-500",
      max: 100,
      current: summary.totalComputeHours,
    },
    {
      label: "Storage",
      value: summary.totalStorageGb.toFixed(2),
      unit: "GB",
      color: "bg-purple-500",
      max: 50,
      current: summary.totalStorageGb,
    },
    {
      label: "Actions",
      value: summary.totalActions.toLocaleString(),
      unit: "",
      color: "bg-emerald-500",
      max: 10000,
      current: summary.totalActions,
    },
    {
      label: "Sessions",
      value: summary.totalSessions.toString(),
      unit: "",
      color: "bg-amber-500",
      max: 100,
      current: summary.totalSessions,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cost summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Estimated Cost</p>
        <p className="text-2xl font-bold mt-1">
          ${(summary.estimatedCostCents / 100).toFixed(2)}
        </p>
      </div>

      {/* Metric bars */}
      <div className="space-y-4">
        {metrics.map((m) => {
          const pct = Math.min((m.current / m.max) * 100, 100);
          return (
            <div key={m.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">{m.label}</span>
                <span className="text-sm font-medium">
                  {m.value} {m.unit}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${m.color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
