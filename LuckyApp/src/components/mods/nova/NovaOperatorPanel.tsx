"use client";

import { useState, useEffect } from "react";
import { Play, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { NovaWorkflowLog } from "./NovaWorkflowLog";
import { NovaExecutionConsole } from "./NovaExecutionConsole";
import { ComputerSelector } from "../computer-selector";
import type { NovaPlan, NovaRunResult, NovaRunLog } from "@/lib/mods/nova/types";

export function NovaOperatorPanel() {
  const [goal, setGoal] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [computerId, setComputerId] = useState<string | null>(null);
  const [plan, setPlan] = useState<NovaPlan | null>(null);
  const [runResult, setRunResult] = useState<NovaRunResult | null>(null);
  const [logs, setLogs] = useState<NovaRunLog[]>([]);
  const [loading, setLoading] = useState<"plan" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch recent run logs on mount
  useEffect(() => {
    fetch("/api/mods/nova/logs?limit=10")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setLogs(data.logs);
      })
      .catch(() => {});
  }, []);

  const handlePlan = async () => {
    if (!goal) return;
    setLoading("plan");
    setError(null);
    setPlan(null);
    setRunResult(null);
    try {
      const res = await fetch("/api/mods/nova/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, pageUrl: pageUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Planning failed");
      setPlan(data.plan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleRun = async () => {
    if (!plan || plan.steps.length === 0) return;
    setLoading("run");
    setError(null);
    try {
      const res = await fetch("/api/mods/nova/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: plan.workflowId,
          steps: plan.steps,
          computerId: computerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      setRunResult(data.result);
      // Refresh logs
      fetch("/api/mods/nova/logs?limit=10")
        .then((r) => r.json())
        .then((d) => { if (d.ok) setLogs(d.logs); })
        .catch(() => {});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Input */}
      <div className="space-y-4">
        {/* Computer selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Target Computer</label>
          <ComputerSelector value={computerId} onChange={setComputerId} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Goal</label>
          <Textarea
            placeholder="Describe the workflow... e.g., 'Go to amazon.com, search for wireless headphones, and add the top result to cart'"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Start URL <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            placeholder="https://example.com"
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handlePlan}
            disabled={!goal || loading !== null}
            className="flex-1"
          >
            {loading === "plan" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ListChecks className="h-4 w-4 mr-2" />
            )}
            Plan Workflow
          </Button>
          <Button
            onClick={handleRun}
            disabled={!plan || plan.steps.length === 0 || loading !== null}
            variant="outline"
            className="flex-1"
          >
            {loading === "run" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {computerId ? "Execute on Computer" : "Execute (Demo)"}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Right: Results */}
      <div className="space-y-4">
        {plan && (
          <div className="space-y-3">
            {plan.reasoning && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Reasoning</p>
                <p className="text-sm">{plan.reasoning}</p>
              </div>
            )}
            <NovaWorkflowLog steps={runResult?.steps ?? plan.steps} />
          </div>
        )}

        <NovaExecutionConsole result={runResult} logs={logs} />
      </div>
    </div>
  );
}
