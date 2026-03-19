/**
 * Cost Intelligence — Budget predictions, anomaly detection, spend alerts
 *
 * Features:
 * - Linear regression for 7-day cost projections
 * - Statistical anomaly detection (>2σ from mean)
 * - Budget alerts (daily/weekly/monthly thresholds)
 * - Agent cost leaderboard
 * - Trend analysis
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { getUsageRecords, aggregateDaily, aggregateByAgent, type UsageRecord } from "./usage";

// ─── Types ──────────────────────────────────────────────────────────

export type AlertType = "daily" | "weekly" | "monthly";
export type AlertStatus = "pending" | "triggered" | "resolved";

export interface BudgetAlert {
  id: string;
  orgId: string;
  alertType: AlertType;
  threshold: number; // USD
  currentSpend: number;
  triggered: boolean;
  status: AlertStatus;
  createdAt: Date | null;
  triggeredAt?: Date | null;
  resolvedAt?: Date | null;
}

export interface CostProjection {
  date: string; // YYYY-MM-DD
  projectedCost: number;
  confidence: number; // 0-1
}

export interface CostAnomaly {
  date: string;
  actualCost: number;
  expectedCost: number;
  deviationPercent: number;
  sigma: number; // Standard deviations from mean
  severity: "low" | "medium" | "high";
}

export interface CostTrend {
  direction: "increasing" | "decreasing" | "stable";
  changePercent: number;
  daysAnalyzed: number;
}

export interface AgentCostRanking {
  agentId: string;
  agentName: string;
  totalCost: number;
  totalTokens: number;
  requests: number;
  avgCostPerRequest: number;
  rank: number;
}

// ─── Budget Alerts ──────────────────────────────────────────────────

export async function createBudgetAlert(
  orgId: string,
  alertType: AlertType,
  threshold: number
): Promise<string> {
  const ref = await addDoc(collection(db, "budgetAlerts"), {
    orgId,
    alertType,
    threshold,
    currentSpend: 0,
    triggered: false,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getBudgetAlerts(orgId: string): Promise<BudgetAlert[]> {
  const q = query(
    collection(db, "budgetAlerts"),
    where("orgId", "==", orgId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  const alerts: BudgetAlert[] = [];
  snap.forEach((doc) => {
    const data = doc.data();
    alerts.push({
      id: doc.id,
      orgId: data.orgId,
      alertType: data.alertType,
      threshold: data.threshold,
      currentSpend: data.currentSpend,
      triggered: data.triggered,
      status: data.status,
      createdAt: data.createdAt?.toDate() || null,
      triggeredAt: data.triggeredAt?.toDate() || null,
      resolvedAt: data.resolvedAt?.toDate() || null,
    });
  });
  return alerts;
}

export async function checkBudgetAlerts(orgId: string): Promise<BudgetAlert[]> {
  const alerts = await getBudgetAlerts(orgId);
  const triggeredAlerts: BudgetAlert[] = [];

  for (const alert of alerts) {
    if (alert.status !== "pending") continue;

    const currentSpend = await getCurrentSpend(orgId, alert.alertType);

    if (currentSpend >= alert.threshold) {
      // Trigger alert
      await setDoc(doc(db, "budgetAlerts", alert.id), {
        ...alert,
        currentSpend,
        triggered: true,
        status: "triggered",
        triggeredAt: serverTimestamp(),
      });
      triggeredAlerts.push({ ...alert, currentSpend, triggered: true, status: "triggered" });
    }
  }

  return triggeredAlerts;
}

async function getCurrentSpend(orgId: string, alertType: AlertType): Promise<number> {
  const now = new Date();
  let startDate: Date;

  switch (alertType) {
    case "daily":
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "weekly":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
      startDate.setHours(0, 0, 0, 0);
      break;
    case "monthly":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const records = await getUsageRecords(orgId, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  return records.reduce((sum, r) => sum + r.costUsd, 0);
}

// ─── Cost Projections (Linear Regression) ──────────────────────────

export async function predictFutureCost(
  orgId: string,
  daysToPredict: number = 7
): Promise<CostProjection[]> {
  // Get 30 days of historical data
  const records = await getUsageRecords(orgId, 30);
  const dailyCosts = aggregateDaily(records);

  if (dailyCosts.length < 7) {
    // Not enough data for prediction
    return [];
  }

  // Linear regression: y = mx + b
  const { slope, intercept } = linearRegression(dailyCosts);

  const projections: CostProjection[] = [];
  const lastDataIndex = dailyCosts.length;

  for (let i = 1; i <= daysToPredict; i++) {
    const x = lastDataIndex + i;
    const projectedCost = slope * x + intercept;
    const confidence = Math.max(0, 1 - (i / daysToPredict) * 0.3); // Confidence decreases over time

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i);

    projections.push({
      date: futureDate.toISOString().split("T")[0],
      projectedCost: Math.max(0, projectedCost),
      confidence,
    });
  }

  return projections;
}

function linearRegression(dailyCosts: Array<{ date: string; costUsd: number }>): {
  slope: number;
  intercept: number;
} {
  const n = dailyCosts.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  dailyCosts.forEach((day, index) => {
    const x = index;
    const y = day.costUsd;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });

  const denominator = n * sumXX - sumX * sumX;

  // Handle division by zero (all X values are the same)
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

// ─── Anomaly Detection (Statistical) ───────────────────────────────

export async function detectAnomalies(
  orgId: string,
  daysBack: number = 30
): Promise<CostAnomaly[]> {
  const records = await getUsageRecords(orgId, daysBack);
  const dailyCosts = aggregateDaily(records);

  if (dailyCosts.length < 7) {
    return []; // Not enough data
  }

  const costs = dailyCosts.map((d) => d.costUsd);
  const mean = costs.reduce((sum, c) => sum + c, 0) / costs.length;
  // Use sample standard deviation (N-1) for better variance estimation
  const stdDev = Math.sqrt(
    costs.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / (costs.length - 1)
  );

  const anomalies: CostAnomaly[] = [];

  dailyCosts.forEach((day) => {
    const deviation = day.costUsd - mean;
    const sigma = stdDev > 0 ? Math.abs(deviation) / stdDev : 0;

    if (sigma > 2) {
      // Anomaly detected (>2 standard deviations)
      let severity: "low" | "medium" | "high" = "low";
      if (sigma > 3) severity = "high";
      else if (sigma > 2.5) severity = "medium";

      anomalies.push({
        date: day.date,
        actualCost: day.costUsd,
        expectedCost: mean,
        deviationPercent: (deviation / mean) * 100,
        sigma,
        severity,
      });
    }
  });

  return anomalies;
}

// ─── Trend Analysis ─────────────────────────────────────────────────

export async function analyzeCostTrend(
  orgId: string,
  daysBack: number = 14
): Promise<CostTrend> {
  const records = await getUsageRecords(orgId, daysBack);
  const dailyCosts = aggregateDaily(records);

  if (dailyCosts.length < 3) {
    return {
      direction: "stable",
      changePercent: 0,
      daysAnalyzed: dailyCosts.length,
    };
  }

  // Compare first half vs second half
  const midPoint = Math.floor(dailyCosts.length / 2);
  const firstHalf = dailyCosts.slice(0, midPoint);
  const secondHalf = dailyCosts.slice(midPoint);

  const firstHalfAvg =
    firstHalf.reduce((sum, d) => sum + d.costUsd, 0) / firstHalf.length;
  const secondHalfAvg =
    secondHalf.reduce((sum, d) => sum + d.costUsd, 0) / secondHalf.length;

  const changePercent = firstHalfAvg > 0
    ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
    : 0;

  let direction: "increasing" | "decreasing" | "stable" = "stable";
  if (Math.abs(changePercent) > 10) {
    direction = changePercent > 0 ? "increasing" : "decreasing";
  }

  return {
    direction,
    changePercent,
    daysAnalyzed: dailyCosts.length,
  };
}

// ─── Agent Cost Ranking ─────────────────────────────────────────────

export async function getAgentCostLeaderboard(
  orgId: string,
  daysBack: number = 30,
  limit: number = 10
): Promise<AgentCostRanking[]> {
  const records = await getUsageRecords(orgId, daysBack);
  const agentSummaries = aggregateByAgent(records);

  const rankings = agentSummaries
    .map((agent, index) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      totalCost: agent.costUsd,
      totalTokens: agent.totalTokens,
      requests: agent.requests,
      avgCostPerRequest: agent.requests > 0 ? agent.costUsd / agent.requests : 0,
      rank: index + 1,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, limit);

  return rankings;
}

// ─── Burn Rate ──────────────────────────────────────────────────────

export async function calculateBurnRate(
  orgId: string,
  timeWindowHours: number = 24
): Promise<{
  costPerHour: number;
  costPerDay: number;
  projectedMonthlyCost: number;
}> {
  const daysBack = Math.ceil(timeWindowHours / 24);
  const records = await getUsageRecords(orgId, daysBack);

  const now = Date.now();
  const windowMs = timeWindowHours * 60 * 60 * 1000;

  const recentRecords = records.filter((r) => {
    if (!r.timestamp) return false;
    return now - r.timestamp.getTime() < windowMs;
  });

  const totalCost = recentRecords.reduce((sum, r) => sum + r.costUsd, 0);
  const costPerHour = totalCost / timeWindowHours;
  const costPerDay = costPerHour * 24;
  const projectedMonthlyCost = costPerDay * 30;

  return {
    costPerHour,
    costPerDay,
    projectedMonthlyCost,
  };
}
