"use client";

import { CheckCircle, Circle, AlertCircle, XCircle, Loader2, MousePointer, Type, ArrowDown, Globe, Clock, Camera, Terminal } from "lucide-react";
import type { NovaWorkflowStep } from "@/lib/mods/nova/types";

interface NovaWorkflowLogProps {
  steps: NovaWorkflowStep[];
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

function StepStatus({ status }: { status: NovaWorkflowStep["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case "skipped":
      return <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-amber-500 animate-spin shrink-0" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
  }
}

export function NovaWorkflowLog({ steps }: NovaWorkflowLogProps) {
  if (steps.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No workflow steps yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Workflow Steps</h3>
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />

        <div className="space-y-1.5">
          {steps.map((step) => {
            const Icon = ACTION_ICONS[step.action.type] || Circle;
            return (
              <div
                key={step.step}
                className="relative flex items-start gap-3 rounded-lg border border-border p-3 bg-card/50"
              >
                <div className="mt-0.5 z-10 bg-card">
                  <StepStatus status={step.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">#{step.step}</span>
                    <Icon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      {step.action.type}
                    </span>
                    {step.action.target && (
                      <span className="text-xs text-muted-foreground truncate">
                        on {step.action.target}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5">{step.action.description}</p>
                  {step.action.value && (
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">
                      {step.action.value}
                    </code>
                  )}
                  {step.output && (
                    <p className="text-xs text-muted-foreground mt-1">{step.output}</p>
                  )}
                </div>
                {step.action.confidence !== undefined && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {Math.round(step.action.confidence * 100)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
