"use client";

import { CheckCircle, Circle, AlertCircle, MousePointer, Type, ArrowDown, Globe, Clock, Camera, Terminal } from "lucide-react";
import type { PlannedAction } from "@/lib/mods/types";

interface GeminiActionPlanProps {
  actions: PlannedAction[];
  results?: { status: "success" | "failed" | "skipped"; message?: string }[];
}

const ACTION_ICONS: Record<string, typeof MousePointer> = {
  click: MousePointer,
  type: Type,
  scroll: ArrowDown,
  navigate: Globe,
  wait: Clock,
  screenshot: Camera,
  bash: Terminal,
};

export function GeminiActionPlan({ actions, results }: GeminiActionPlanProps) {
  if (actions.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No actions planned yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Action Plan</h3>
      <div className="space-y-1.5">
        {actions.map((action, i) => {
          const Icon = ACTION_ICONS[action.type] || Circle;
          const result = results?.[i];
          const statusIcon = result
            ? result.status === "success"
              ? <CheckCircle className="h-4 w-4 text-green-500" />
              : <AlertCircle className="h-4 w-4 text-red-500" />
            : <Circle className="h-4 w-4 text-muted-foreground/40" />;

          return (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border p-3 bg-card/50"
            >
              <div className="mt-0.5">{statusIcon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs font-medium uppercase text-muted-foreground">{action.type}</span>
                  {action.target && (
                    <span className="text-xs text-muted-foreground truncate">on {action.target}</span>
                  )}
                </div>
                <p className="text-sm mt-0.5">{action.description}</p>
                {action.value && (
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">{action.value}</code>
                )}
                {result?.message && (
                  <p className="text-xs text-muted-foreground mt-1">{result.message}</p>
                )}
              </div>
              {action.confidence !== undefined && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {Math.round(action.confidence * 100)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
