/** Office Sim — 2D Command Center View */
"use client";

import { Layout, Box, ArrowLeft, Maximize2, Filter } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfficeProvider } from "@/components/mods/office-sim/OfficeProvider";
import { useOffice } from "@/components/mods/office-sim/office-store";
import { Office2D } from "@/components/mods/office-sim/Office2D";
import { AgentDetailDrawer } from "@/components/mods/office-sim/AgentDetailDrawer";

function Office2DContent() {
  const { state } = useOffice();
  const agentCount = state.agents.size;
  const { activeCount, errorCount } = state.metrics;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/mods/office-sim">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-1.5">
            <Layout className="h-4 w-4 text-amber-400" />
            <h1 className="text-sm font-semibold">2D Office</h1>
          </div>
          <Badge variant="outline" className="text-[10px] ml-2">
            {activeCount} active / {agentCount} total
          </Badge>
          {errorCount > 0 && (
            <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
              {errorCount} errors
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link href="/mods/office-sim/3d">
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <Box className="h-3 w-3" />
              Switch to 3D
            </Button>
          </Link>
        </div>
      </div>

      {/* Floor plan */}
      <Office2D />

      {/* Status bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span>{activeCount} active</span>
        <span className="text-border">|</span>
        <span>{errorCount} errors</span>
        <span className="text-border">|</span>
        <span>{state.metrics.taskCount} tasks</span>
        <span className="text-border">|</span>
        <span className={state.connected ? "text-green-400" : "text-red-400"}>
          ws: {state.connected ? "connected" : "disconnected"}
        </span>
      </div>

      {/* Agent Detail Drawer */}
      <AgentDetailDrawer />
    </div>
  );
}

export default function Office2DPage() {
  return (
    <OfficeProvider>
      <Office2DContent />
    </OfficeProvider>
  );
}
