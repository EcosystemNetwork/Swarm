"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Square, RotateCcw, Copy, Camera, ChevronLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Computer, ComputerSession, ActionType } from "@/lib/compute/types";
import { StatusBadge } from "@/components/compute/status-badge";
import { DesktopViewer } from "@/components/compute/desktop-viewer";
import { TerminalViewer } from "@/components/compute/terminal-viewer";
import { ActionPanel } from "@/components/compute/action-panel";
import { FileBrowser } from "@/components/compute/file-browser";
import { MemoryEditor } from "@/components/compute/memory-editor";
import { SessionTimeline } from "@/components/compute/session-timeline";
import { SIZE_PRESETS, REGION_LABELS } from "@/lib/compute/types";

export default function ComputerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [computer, setComputer] = useState<Computer | null>(null);
  const [sessions, setSessions] = useState<ComputerSession[]>([]);
  const [vncUrl, setVncUrl] = useState("");
  const [terminalUrl, setTerminalUrl] = useState("");
  const [activeSession, setActiveSession] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchComputer = async () => {
    const res = await fetch(`/api/compute/computers/${id}`);
    const data = await res.json();
    if (data.ok) setComputer(data.computer);
  };

  useEffect(() => {
    Promise.all([
      fetchComputer(),
      fetch(`/api/compute/sessions?computerId=${id}`).then((r) => r.json()).then((d) => {
        if (d.ok) {
          setSessions(d.sessions);
          const active = d.sessions.find((s: ComputerSession) => !s.endedAt);
          if (active) setActiveSession(active.id);
        }
      }),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch live URLs when running
  useEffect(() => {
    if (computer?.status !== "running") return;
    Promise.all([
      fetch(`/api/compute/computers/${id}/vnc-token`).then((r) => r.json()),
      fetch(`/api/compute/computers/${id}/terminal-token`).then((r) => r.json()),
    ]).then(([vData, tData]) => {
      if (vData.ok) setVncUrl(vData.url);
      if (tData.ok) setTerminalUrl(tData.url);
    });
  }, [computer?.status, id]);

  const handleLifecycle = async (action: "start" | "stop" | "restart") => {
    await fetch(`/api/compute/computers/${id}/${action}`, { method: "POST" });
    await fetchComputer();
  };

  const handleAction = async (actionType: ActionType, payload: Record<string, unknown>) => {
    if (!activeSession) return;
    await fetch(`/api/compute/computers/${id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionType, payload, sessionId: activeSession }),
    });
  };

  const handleClone = async () => {
    const res = await fetch(`/api/compute/computers/${id}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.ok) router.push(`/compute/computers/${data.id}`);
  };

  const handleSnapshot = async () => {
    await fetch(`/api/compute/computers/${id}/snapshot`, { method: "POST" });
  };

  if (loading || !computer) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const preset = SIZE_PRESETS[computer.sizeKey];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/compute/computers" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ChevronLeft className="h-3 w-3" />
            Computers
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{computer.name}</h1>
            <StatusBadge status={computer.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {preset.label} · {REGION_LABELS[computer.region]} · {computer.controllerType}
          </p>
        </div>
        <div className="flex gap-2">
          {computer.status === "stopped" && (
            <button onClick={() => handleLifecycle("start")} className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20">
              <Play className="h-4 w-4" /> Start
            </button>
          )}
          {computer.status === "running" && (
            <>
              <button onClick={() => handleLifecycle("stop")} className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/20">
                <Square className="h-4 w-4" /> Stop
              </button>
              <button onClick={() => handleLifecycle("restart")} className="flex items-center gap-1.5 rounded-md bg-blue-500/10 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/20">
                <RotateCcw className="h-4 w-4" /> Restart
              </button>
            </>
          )}
          <button onClick={handleSnapshot} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
            <Camera className="h-4 w-4" /> Snapshot
          </button>
          <button onClick={handleClone} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
            <Copy className="h-4 w-4" /> Clone
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="desktop">
        <TabsList>
          <TabsTrigger value="desktop">Desktop</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="desktop">
          <DesktopViewer computerId={id} vncUrl={vncUrl} />
        </TabsContent>

        <TabsContent value="terminal">
          <TerminalViewer computerId={id} terminalUrl={terminalUrl} />
        </TabsContent>

        <TabsContent value="actions">
          <ActionPanel
            computerId={id}
            sessionId={activeSession}
            onAction={handleAction}
            disabled={computer.status !== "running"}
          />
        </TabsContent>

        <TabsContent value="files">
          <FileBrowser workspaceId={computer.workspaceId} computerId={id} />
        </TabsContent>

        <TabsContent value="memory">
          <MemoryEditor scopeType="computer" scopeId={id} />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionTimeline sessions={sessions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
