"use client";

import { Bot, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NovaOperatorPanel } from "@/components/mods/nova/NovaOperatorPanel";

export default function NovaModPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Bot className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Amazon Nova Operator</h1>
            <p className="text-sm text-muted-foreground">
              Browser-based UI workflow automation powered by Amazon Nova
            </p>
          </div>
        </div>
        <Link href="/mods/nova/settings">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1.5" />
            Settings
          </Button>
        </Link>
      </div>

      {/* Main panel */}
      <NovaOperatorPanel />
    </div>
  );
}
