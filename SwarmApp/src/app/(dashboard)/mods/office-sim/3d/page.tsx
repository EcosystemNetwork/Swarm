/** Office Sim — 3D Immersive View */
"use client";

import dynamic from "next/dynamic";
import { Box, Layout, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfficeProvider } from "@/components/mods/office-sim/OfficeProvider";
import { useOffice } from "@/components/mods/office-sim/office-store";
import { AgentDetailDrawer } from "@/components/mods/office-sim/AgentDetailDrawer";

const Office3D = dynamic(
  () => import("@/components/mods/office-sim/Office3D").then((m) => ({ default: m.Office3D })),
  { ssr: false, loading: () => (
    <div className="w-full aspect-video rounded-lg border border-border bg-card flex items-center justify-center">
      <p className="text-sm text-muted-foreground animate-pulse">Loading 3D scene...</p>
    </div>
  )},
);

function Office3DContent() {
  const { state } = useOffice();
  const { activeCount, errorCount } = state.metrics;
  const agentCount = state.agents.size;

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
            <Box className="h-4 w-4 text-amber-400" />
            <h1 className="text-sm font-semibold">3D Office</h1>
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
          <Link href="/mods/office-sim/2d">
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <Layout className="h-3 w-3" />
              Switch to 2D
            </Button>
          </Link>
        </div>
      </div>

      {/* 3D Scene */}
      <Office3D />

      {/* HUD overlay info */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span>Click agent to inspect</span>
        <span className="text-border">|</span>
        <span>Auto-orbit camera</span>
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

export default function Office3DPage() {
  return (
    <OfficeProvider>
      <Office3DContent />
    </OfficeProvider>
  );
}
