"use client";

import { Sparkles, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GeminiAgentPanel } from "@/components/mods/gemini/GeminiAgentPanel";

export default function GeminiModPage() {
  return (
    <div className="space-y-6">
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

      {/* Main panel */}
      <GeminiAgentPanel />
    </div>
  );
}
