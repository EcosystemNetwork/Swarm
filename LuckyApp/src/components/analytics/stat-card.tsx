"use client";

import { cn } from "@/lib/utils";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import CountUp from "@/components/reactbits/CountUp";
import DecryptedText from "@/components/reactbits/DecryptedText";

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
    <div className="gradient-border-spin">
      <SpotlightCard
        className="p-6"
        spotlightColor="rgba(255, 191, 0, 0.08)"
      >
        <div className="flex items-center justify-between mb-3">
          <DecryptedText
            text={title}
            speed={40}
            maxIterations={8}
            className="text-sm font-medium text-muted-foreground"
            encryptedClassName="text-sm font-medium text-amber-500/50"
            animateOn="view"
            sequential
            revealDirection="start"
          />
          <span className="text-2xl animate-icon-pulse">{icon}</span>
        </div>
        <div className="text-2xl font-bold tracking-tight text-glow-gold">
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
                isPositive ? "text-amber-600 dark:text-amber-400" : "text-red-500"
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
    </div>
  );
}
