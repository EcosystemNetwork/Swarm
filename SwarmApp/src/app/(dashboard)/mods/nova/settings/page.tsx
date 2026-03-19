"use client";

import { useState } from "react";
import { ArrowLeft, Save, Bot } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function NovaSettingsPage() {
  const [region, setRegion] = useState("us-east-1");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [modelId, setModelId] = useState("amazon.nova-lite-v1:0");
  const [maxSteps, setMaxSteps] = useState(15);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/mods/nova">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-semibold">Nova Settings</h1>
        </div>
      </div>

      {/* AWS Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">AWS Bedrock Configuration</CardTitle>
          <CardDescription>
            Configure your AWS credentials for Amazon Nova model access.
            Set <code className="text-xs bg-muted px-1 rounded">AWS_ACCESS_KEY_ID</code> and{" "}
            <code className="text-xs bg-muted px-1 rounded">AWS_SECRET_ACCESS_KEY</code> environment
            variables for server-side use, or enter credentials below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Region</label>
            <Input
              placeholder="us-east-1"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Access Key ID</label>
            <Input
              type="password"
              placeholder="AKIA..."
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Secret Access Key</label>
            <Input
              type="password"
              placeholder="wJalr..."
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Model ID</label>
            <Input
              placeholder="amazon.nova-lite-v1:0"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Available: amazon.nova-lite-v1:0, amazon.nova-pro-v1:0, amazon.nova-premier-v1:0
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Behavior */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Workflow Behavior</CardTitle>
          <CardDescription>
            Control how Nova plans and executes browser workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Steps per Workflow</label>
            <Input
              type="number"
              min={1}
              max={50}
              value={maxSteps}
              onChange={(e) => setMaxSteps(parseInt(e.target.value) || 15)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of steps Nova can include in a single workflow plan (1-50).
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
