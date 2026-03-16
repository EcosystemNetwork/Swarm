"use client";

import { useState } from "react";
import { Sparkles, Play, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeminiScreenshotViewer } from "./GeminiScreenshotViewer";
import { GeminiActionPlan } from "./GeminiActionPlan";
import { ComputerSelector } from "../computer-selector";
import type { GeminiAnalysis, GeminiPlan, GeminiExecutionResult } from "@/lib/mods/gemini/types";

export function GeminiAgentPanel() {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [computerId, setComputerId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null);
  const [plan, setPlan] = useState<GeminiPlan | null>(null);
  const [executionResult, setExecutionResult] = useState<GeminiExecutionResult | null>(null);
  const [loading, setLoading] = useState<"analyze" | "plan" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!screenshot || !task) return;
    setLoading("analyze");
    setError(null);
    setAnalysis(null);
    setPlan(null);
    setExecutionResult(null);
    try {
      const res = await fetch("/api/mods/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshot, task }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysis(data.analysis);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handlePlan = async () => {
    if (!task) return;
    setLoading("plan");
    setError(null);
    setPlan(null);
    setExecutionResult(null);
    try {
      const res = await fetch("/api/mods/gemini/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshot, task }),
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

  const handleExecute = async () => {
    if (!plan || plan.actions.length === 0) return;
    setLoading("execute");
    setError(null);
    try {
      const res = await fetch("/api/mods/gemini/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: plan.actions,
          computerId: computerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      setExecutionResult(data.result);
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

        <GeminiScreenshotViewer screenshot={screenshot} onScreenshotChange={setScreenshot} />

        <div className="space-y-2">
          <label className="text-sm font-medium">Task</label>
          <Textarea
            placeholder="Describe what you want to do... e.g., 'Find the sign-in flow and explain the next 2 actions'"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleAnalyze}
            disabled={!screenshot || !task || loading !== null}
            className="flex-1"
          >
            {loading === "analyze" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Analyze UI
          </Button>
          <Button
            onClick={handlePlan}
            disabled={!task || loading !== null}
            variant="outline"
            className="flex-1"
          >
            {loading === "plan" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Plan Actions
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
        {/* Analysis result */}
        {analysis && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">UI Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{analysis.summary}</p>
              {analysis.elements.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Detected Elements</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.elements.map((el, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${
                          el.interactable ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {el.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Next Action</p>
                <p className="text-sm">{analysis.suggestedAction}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action plan */}
        {plan && (
          <div className="space-y-3">
            {plan.reasoning && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Reasoning</p>
                <p className="text-sm">{plan.reasoning}</p>
              </div>
            )}
            <GeminiActionPlan
              actions={plan.actions}
              results={executionResult?.results}
            />
            {plan.actions.length > 0 && !executionResult && (
              <Button onClick={handleExecute} disabled={loading !== null} className="w-full">
                {loading === "execute" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {computerId ? "Execute on Computer" : "Execute (Demo)"}
              </Button>
            )}
          </div>
        )}

        {/* Execution summary */}
        {executionResult && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Execution Result</CardTitle>
                {(executionResult as GeminiExecutionResult & { live?: boolean }).live && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400">
                    Live execution
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{executionResult.summary}</p>
              <div className="mt-3 space-y-1">
                {executionResult.events.map((event, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`h-1.5 w-1.5 rounded-full ${event.type === "error" ? "bg-red-500" : event.type === "complete" ? "bg-green-500" : "bg-amber-500"}`} />
                    <span>{event.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
