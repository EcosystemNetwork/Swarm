/** Chainlink CRE Workspace — Developer tools for implementing and automating CRE workflows. */
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Link, Play, Pause, Plus, Zap, RefreshCw, Clock,
  ArrowUpRight, GitBranch, Radio, Shield, Layers,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type WorkflowType = "Functions" | "Automation" | "VRF" | "CCIP";
type WorkflowStatus = "active" | "paused" | "draft";

interface Workflow {
  id: string;
  name: string;
  type: WorkflowType;
  status: WorkflowStatus;
  trigger: string;
  lastRun: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Demo Data
// ═══════════════════════════════════════════════════════════════

const DEMO_WORKFLOWS: Workflow[] = [];

const WORKFLOW_TYPE_META: Record<WorkflowType, { icon: typeof Zap; color: string }> = {
  Functions: { icon: Zap, color: "text-blue-400" },
  Automation: { icon: RefreshCw, color: "text-amber-400" },
  VRF: { icon: Shield, color: "text-purple-400" },
  CCIP: { icon: Layers, color: "text-emerald-400" },
};

const STATUS_STYLES: Record<WorkflowStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  draft: "bg-muted text-muted-foreground border-border",
};

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════

export default function ChainlinkPage() {
  const [workflows] = useState<Workflow[]>(DEMO_WORKFLOWS);
  const [showCreate, setShowCreate] = useState(false);

  const quickActions = [
    {
      label: "Create Workflow",
      description: "Start a new CRE automation workflow",
      icon: Plus,
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      onClick: () => setShowCreate(true),
    },
    {
      label: "Deploy Function",
      description: "Deploy a Chainlink Function to the network",
      icon: Zap,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      onClick: () => {},
    },
    {
      label: "View Automations",
      description: "Monitor active Chainlink Automation jobs",
      icon: RefreshCw,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      onClick: () => {},
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Link className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Chainlink</h1>
            <p className="text-sm text-muted-foreground">CRE Workflow Automation</p>
          </div>
        </div>
        <a
          href="https://docs.chain.link"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Docs <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${action.bg}`}
          >
            <action.icon className={`h-5 w-5 mb-2 ${action.color}`} />
            <div className="font-medium text-sm">{action.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{action.description}</div>
          </button>
        ))}
      </div>

      {/* Create Workflow Panel */}
      {showCreate && (
        <Card className="p-5 border-blue-500/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">New CRE Workflow</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(WORKFLOW_TYPE_META) as WorkflowType[]).map((type) => {
              const meta = WORKFLOW_TYPE_META[type];
              return (
                <button
                  key={type}
                  className="p-4 rounded-lg border border-border hover:border-blue-500/40 transition-colors text-left"
                >
                  <meta.icon className={`h-5 w-5 mb-2 ${meta.color}`} />
                  <div className="text-sm font-medium">{type}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {type === "Functions" && "Serverless compute"}
                    {type === "Automation" && "Time/event triggers"}
                    {type === "VRF" && "Verifiable randomness"}
                    {type === "CCIP" && "Cross-chain messaging"}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Workflows Table */}
      <Card className="border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Workflows</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{workflows.length} total</span>
          </div>
        </div>

        {workflows.length === 0 ? (
          <div className="py-16 text-center">
            <GitBranch className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No workflows yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create your first CRE workflow to get started</p>
            <Button
              size="sm"
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create Workflow
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {workflows.map((wf) => {
              const meta = WORKFLOW_TYPE_META[wf.type];
              return (
                <div key={wf.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <meta.icon className={`h-4 w-4 ${meta.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{wf.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>{wf.type}</span>
                      <span className="text-muted-foreground/30">|</span>
                      <span className="flex items-center gap-1">
                        <Radio className="h-3 w-3" /> {wf.trigger}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLES[wf.status]}`}>
                    {wf.status}
                  </span>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 w-28 justify-end">
                    {wf.lastRun ? (
                      <><Clock className="h-3 w-3" /> {wf.lastRun}</>
                    ) : (
                      <span className="text-muted-foreground/40">Never run</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {wf.status === "active" ? (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent Activity */}
      <Card className="border-border">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Recent Activity</h2>
        </div>
        <div className="py-12 text-center">
          <Radio className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/60">No activity yet — events will appear here as workflows run</p>
        </div>
      </Card>
    </div>
  );
}
