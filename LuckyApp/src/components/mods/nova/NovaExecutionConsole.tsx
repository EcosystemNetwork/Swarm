"use client";

import { CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NovaRunResult, NovaRunLog } from "@/lib/mods/nova/types";

interface NovaExecutionConsoleProps {
  result: NovaRunResult | null;
  logs: NovaRunLog[];
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "partial":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function NovaExecutionConsole({ result, logs }: NovaExecutionConsoleProps) {
  return (
    <div className="space-y-4">
      {/* Current execution result */}
      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Execution Result</CardTitle>
              <div className="flex items-center gap-2">
                <StatusIcon status={result.status} />
                <span className="text-xs font-medium capitalize">{result.status}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(result.durationMs)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{result.summary}</p>
            {result.events.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.events.map((event, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        event.type === "error"
                          ? "bg-red-500"
                          : event.type === "complete"
                          ? "bg-green-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <span>{event.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Run history */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Run History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <StatusIcon status={log.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{log.goal}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.stepCount} steps &middot; {formatDuration(log.durationMs)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
