"use client";

import { useState } from "react";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";

interface DesktopViewerProps {
  computerId: string;
  vncUrl: string;
}

export function DesktopViewer({ computerId, vncUrl }: DesktopViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [key, setKey] = useState(0);

  if (!vncUrl) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Start the computer to view its desktop
        </p>
      </div>
    );
  }

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-black" : "relative"}>
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setKey((k) => k + 1)}
          className="rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
      <iframe
        key={key}
        src={vncUrl}
        className={`w-full border-0 rounded-lg ${fullscreen ? "h-screen" : "h-[600px]"}`}
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin"
        title={`Desktop - ${computerId}`}
      />
    </div>
  );
}
