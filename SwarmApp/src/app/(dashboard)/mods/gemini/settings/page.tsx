"use client";

import { useState } from "react";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function GeminiSettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash-preview-04-17");
  const [maxActions, setMaxActions] = useState(10);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Settings would be persisted to Firestore in production
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/mods/gemini">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          <h1 className="text-xl font-semibold">Gemini Settings</h1>
        </div>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">API Configuration</CardTitle>
          <CardDescription>
            Configure your Google AI API key and model preferences.
            Set the <code className="text-xs bg-muted px-1 rounded">GEMINI_API_KEY</code> environment
            variable to use server-side, or enter a key below for browser-side use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Input
              placeholder="gemini-2.5-flash-preview-04-17"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Recommended: gemini-2.5-flash-preview-04-17 for speed, gemini-2.5-pro for accuracy
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Behavior */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Behavior</CardTitle>
          <CardDescription>
            Control how the Gemini agent plans and executes actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Actions per Plan</label>
            <Input
              type="number"
              min={1}
              max={50}
              value={maxActions}
              onChange={(e) => setMaxActions(parseInt(e.target.value) || 10)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of actions the planner can include in a single plan (1-50).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-1.5" />
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
