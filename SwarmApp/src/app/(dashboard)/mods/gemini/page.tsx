"use client";

import { useState } from "react";
import { Sparkles, Settings, MessageSquare, Monitor } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GeminiAgentPanel } from "@/components/mods/gemini/GeminiAgentPanel";
import { GeminiChat } from "@/components/mods/gemini/GeminiChat";

type Tab = "chat" | "agent";

export default function GeminiModPage() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Sparkles className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Gemini Live Agent</h1>
            <p className="text-sm text-muted-foreground">
              Multimodal UI analysis &amp; action planning powered by Google Gemini
            </p>
          </div>
        </div>
        <Link href="/mods/gemini/settings">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1.5" />
            Settings
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit border border-border">
        <button
          onClick={() => setTab("chat")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
            tab === "chat"
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </button>
        <button
          onClick={() => setTab("agent")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
            tab === "agent"
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Monitor className="h-3.5 w-3.5" />
          UI Agent
        </button>
      </div>

      {/* Tab content */}
      {tab === "chat" ? <GeminiChat /> : <GeminiAgentPanel />}
    </div>
  );
}
