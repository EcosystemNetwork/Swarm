"use client";

import { useState, useCallback } from "react";
import { Upload, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeminiScreenshotViewerProps {
  screenshot: string | null;
  onScreenshotChange: (base64: string | null) => void;
}

export function GeminiScreenshotViewer({ screenshot, onScreenshotChange }: GeminiScreenshotViewerProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix to get raw base64
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      onScreenshotChange(base64);
    };
    reader.readAsDataURL(file);
  }, [onScreenshotChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Screenshot</h3>
        {screenshot && (
          <Button variant="ghost" size="sm" onClick={() => onScreenshotChange(null)}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {screenshot ? (
        <div className="relative rounded-lg border border-border overflow-hidden bg-black/20">
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="Screenshot"
            className="w-full h-auto max-h-[400px] object-contain"
          />
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver ? "border-amber-500 bg-amber-500/5" : "border-border hover:border-muted-foreground/40"
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drop a screenshot here or</p>
          <label>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button variant="outline" size="sm" asChild>
              <span><Camera className="h-3.5 w-3.5 mr-1.5" /> Upload Image</span>
            </Button>
          </label>
        </div>
      )}
    </div>
  );
}
