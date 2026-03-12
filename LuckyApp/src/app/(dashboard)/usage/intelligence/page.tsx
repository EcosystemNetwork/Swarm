"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CostProjectionChart } from "@/components/cost-projection-chart";
import { BudgetBurnGauge } from "@/components/budget-burn-gauge";
import {
  type CostProjection,
  type CostAnomaly,
  type CostTrend,
  type AgentCostRanking,
  type BudgetAlert,
} from "@/lib/cost-intelligence";
import { type DailyCost } from "@/lib/usage";
import { aggregateDaily, getUsageRecords } from "@/lib/usage";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, DollarSign, Zap } from "lucide-react";

interface IntelligenceData {
  projections: CostProjection[];
  anomalies: CostAnomaly[];
  trend: CostTrend;
  leaderboard: AgentCostRanking[];
  burnRate: {
    costPerHour: number;
    costPerDay: number;
    projectedMonthlyCost: number;
  };
  daysAnalyzed: number;
}

export default function CostIntelligencePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [historical, setHistorical] = useState<DailyCost[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [newAlertType, setNewAlertType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [newAlertThreshold, setNewAlertThreshold] = useState("");
  const [creatingAlert, setCreatingAlert] = useState(false);

  useEffect(() => {
    if (!user?.orgId) return;
    fetchData();
    fetchAlerts();
  }, [user?.orgId]);

  async function fetchData() {
    if (!user?.orgId) return;
    setLoading(true);
    try {
      // Fetch intelligence data
      const res = await fetch(`/api/usage/intelligence?orgId=${user.orgId}&daysBack=30&daysToPredict=7`);
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      }

      // Fetch historical data for chart
      const records = await getUsageRecords(user.orgId, 30);
      const daily = aggregateDaily(records);
      setHistorical(daily);
    } catch (err) {
      console.error("Failed to fetch intelligence:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlerts() {
    if (!user?.orgId) return;
    try {
      const res = await fetch(`/api/usage/alerts?orgId=${user.orgId}`);
      const json = await res.json();
      if (json.ok) {
        setAlerts(json.alerts);
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    }
  }

  async function createAlert() {
    if (!user?.orgId || !newAlertThreshold) return;
    setCreatingAlert(true);
    try {
      const res = await fetch("/api/usage/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: user.orgId,
          alertType: newAlertType,
          threshold: parseFloat(newAlertThreshold),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setNewAlertThreshold("");
        await fetchAlerts();
      }
    } catch (err) {
      console.error("Failed to create alert:", err);
    } finally {
      setCreatingAlert(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-400">Loading cost intelligence...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="text-gray-400">No data available</div>
      </div>
    );
  }

  const trendIcon = data.trend.direction === "increasing"
    ? <TrendingUp className="w-5 h-5" />
    : data.trend.direction === "decreasing"
    ? <TrendingDown className="w-5 h-5" />
    : <Minus className="w-5 h-5" />;

  const trendColor = data.trend.direction === "increasing"
    ? "text-red-400"
    : data.trend.direction === "decreasing"
    ? "text-green-400"
    : "text-gray-400";

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Cost Intelligence</h1>
        <p className="text-gray-400 mt-2">
          Budget predictions, anomaly detection, and spend analytics
        </p>
      </div>

      {/* Burn Rate Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Cost per Hour</p>
              <p className="text-2xl font-bold text-white mt-1">
                ${data.burnRate.costPerHour.toFixed(4)}
              </p>
            </div>
            <Zap className="w-8 h-8 text-yellow-400" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Cost per Day</p>
              <p className="text-2xl font-bold text-white mt-1">
                ${data.burnRate.costPerDay.toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-400" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Projected Monthly</p>
              <p className="text-2xl font-bold text-white mt-1">
                ${data.burnRate.projectedMonthlyCost.toFixed(2)}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Trend Card */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">Cost Trend</h2>
        <div className="flex items-center space-x-4">
          <div className={`${trendColor} flex items-center space-x-2`}>
            {trendIcon}
            <span className="text-lg font-semibold capitalize">{data.trend.direction}</span>
          </div>
          <div className="text-gray-400">
            {data.trend.changePercent > 0 ? "+" : ""}
            {data.trend.changePercent.toFixed(1)}% over {data.trend.daysAnalyzed} days
          </div>
        </div>
      </div>

      {/* Projection Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">Cost Projections</h2>
        <CostProjectionChart historical={historical} projections={data.projections} />
      </div>

      {/* Budget Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Alerts */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Budget Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-gray-400 text-sm">No budget alerts configured</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.triggered
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-gray-700 border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white capitalize">{alert.alertType}</p>
                      <p className="text-sm text-gray-400">
                        Threshold: ${alert.threshold.toFixed(2)}
                      </p>
                    </div>
                    {alert.triggered && (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <BudgetBurnGauge
                    currentSpend={alert.currentSpend}
                    threshold={alert.threshold}
                    period={alert.alertType}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Alert */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Create Budget Alert</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Alert Type
              </label>
              <select
                value={newAlertType}
                onChange={(e) => setNewAlertType(e.target.value as any)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Threshold (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={newAlertThreshold}
                onChange={(e) => setNewAlertThreshold(e.target.value)}
                placeholder="10.00"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              />
            </div>
            <button
              onClick={createAlert}
              disabled={creatingAlert || !newAlertThreshold}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition"
            >
              {creatingAlert ? "Creating..." : "Create Alert"}
            </button>
          </div>
        </div>
      </div>

      {/* Anomalies */}
      {data.anomalies.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Cost Anomalies Detected</h2>
          <div className="space-y-3">
            {data.anomalies.map((anomaly, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border ${
                  anomaly.severity === "high"
                    ? "bg-red-500/10 border-red-500/30"
                    : anomaly.severity === "medium"
                    ? "bg-orange-500/10 border-orange-500/30"
                    : "bg-yellow-500/10 border-yellow-500/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{anomaly.date}</p>
                    <p className="text-sm text-gray-400">
                      Actual: ${anomaly.actualCost.toFixed(2)} | Expected: $
                      {anomaly.expectedCost.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-medium ${
                        anomaly.severity === "high"
                          ? "text-red-400"
                          : anomaly.severity === "medium"
                          ? "text-orange-400"
                          : "text-yellow-400"
                      }`}
                    >
                      {anomaly.deviationPercent > 0 ? "+" : ""}
                      {anomaly.deviationPercent.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500">{anomaly.sigma.toFixed(1)}σ</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Cost Leaderboard */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">Top Cost Agents</h2>
        <div className="space-y-2">
          {data.leaderboard.map((agent) => (
            <div
              key={agent.agentId}
              className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <span className="text-lg font-bold text-gray-400">#{agent.rank}</span>
                <div>
                  <p className="font-medium text-white">{agent.agentName}</p>
                  <p className="text-xs text-gray-400">
                    {agent.requests} requests • {(agent.totalTokens / 1000).toFixed(1)}K tokens
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-white">${agent.totalCost.toFixed(2)}</p>
                <p className="text-xs text-gray-400">
                  ${agent.avgCostPerRequest.toFixed(4)}/req
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
