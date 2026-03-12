"use client";

import { useEffect, useState } from "react";
import type { RoutingDecision } from "@/lib/model-router";

interface ModelRouterWidgetProps {
  orgId: string;
  daysBack?: number;
}

export function ModelRouterWidget({ orgId, daysBack = 7 }: ModelRouterWidgetProps) {
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [fallbackRate, setFallbackRate] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`/api/llm/routing-stats?orgId=${orgId}&daysBack=${daysBack}`);
        if (!res.ok) throw new Error("Failed to fetch routing stats");
        const data = await res.json();
        setDecisions(data.decisions || []);
        setTotalSavings(data.totalSavings || 0);
        setFallbackRate(data.fallbackRate || 0);
      } catch (err) {
        console.error("Error fetching routing stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [orgId, daysBack]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-black/40 p-6">
        <h3 className="text-lg font-semibold text-zinc-100 mb-4">Model Router</h3>
        <div className="text-zinc-400">Loading routing stats...</div>
      </div>
    );
  }

  const reasonColors: Record<string, string> = {
    primary: "text-green-400",
    cost_cap: "text-amber-400",
    budget_exceeded: "text-red-400",
    circuit_breaker: "text-orange-400",
    rate_limit: "text-yellow-400",
    latency_threshold: "text-blue-400",
  };

  const reasonLabels: Record<string, string> = {
    primary: "Primary",
    cost_cap: "Cost Cap",
    budget_exceeded: "Budget Exceeded",
    circuit_breaker: "Circuit Breaker",
    rate_limit: "Rate Limited",
    latency_threshold: "Latency",
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-black/40 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-zinc-100">Model Router</h3>
        <div className="text-sm text-zinc-400">Last {daysBack} days</div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-400 mb-1">Total Savings</div>
          <div className="text-2xl font-bold text-green-400">
            ${totalSavings.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-400 mb-1">Fallback Rate</div>
          <div className="text-2xl font-bold text-amber-400">
            {(fallbackRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-400 mb-1">Total Requests</div>
          <div className="text-2xl font-bold text-zinc-100">
            {decisions.length}
          </div>
        </div>
      </div>

      {/* Recent Decisions */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Recent Routing Decisions</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {decisions.length === 0 ? (
            <div className="text-sm text-zinc-500">No routing decisions yet</div>
          ) : (
            decisions.slice(0, 10).map((decision) => (
              <div
                key={decision.id}
                className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-zinc-300 font-mono">
                      {decision.requestedModel}
                    </span>
                    {decision.selectedModel !== decision.requestedModel && (
                      <>
                        <span className="text-zinc-600">→</span>
                        <span className="text-sm text-amber-400 font-mono">
                          {decision.selectedModel}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${reasonColors[decision.reason] || "text-zinc-400"}`}>
                      {reasonLabels[decision.reason] || decision.reason}
                    </span>
                    {decision.costSavings > 0 && (
                      <span className="text-xs text-green-400">
                        Saved ${decision.costSavings.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {decision.timestamp
                    ? new Date(decision.timestamp).toLocaleTimeString()
                    : "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
