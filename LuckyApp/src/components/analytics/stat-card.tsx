"use client";

import { cn } from "@/lib/utils";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import CountUp from "@/components/reactbits/CountUp";

interface StatCardProps {
  title: string;
  value: string;
  icon: string;
  change?: number;
  changeLabel?: string;
  prefix?: string;
}

export function StatCard({ title, value, icon, change, changeLabel, prefix }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const hasChange = change !== undefined;
  const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
  const isNumeric = !isNaN(numericValue) && isFinite(numericValue);

  return (
    <SpotlightCard
      className="p-6"
      spotlightColor="rgba(255, 191, 0, 0.08)"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">
        {prefix}
        {isNumeric ? (
          <CountUp to={numericValue} duration={1.5} separator="," />
        ) : (
          value
        )}
      </div>
      {hasChange && (
        <div className="flex items-center gap-1 mt-2">
          <span
            className={cn(
              "text-xs font-medium flex items-center gap-0.5",
              isPositive ? "text-amber-600" : "text-red-500"
            )}
          >
            {isPositive ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-muted-foreground">{changeLabel}</span>
          )}
        </div>
      )}
    </SpotlightCard>
  );
}
