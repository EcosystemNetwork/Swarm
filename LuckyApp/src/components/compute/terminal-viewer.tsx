"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface TerminalViewerProps {
  computerId: string;
  terminalUrl: string;
}

export function TerminalViewer({ computerId, terminalUrl }: TerminalViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);

  if (!terminalUrl) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-black/90">
        <p className="text-sm text-muted-foreground">
          Start the computer to access its terminal
        </p>
      </div>
    );
  }

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-black" : "relative"}>
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
      <iframe
        src={terminalUrl}
        className={`w-full border-0 rounded-lg bg-black ${fullscreen ? "h-screen" : "h-[400px]"}`}
        allow="clipboard-write"
        title={`Terminal - ${computerId}`}
      />
    </div>
  );
}
