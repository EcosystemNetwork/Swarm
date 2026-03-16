"use client";

import { SIZE_PRESETS, REGION_LABELS, type SizeKey, type Region } from "@/lib/compute/types";
import { estimateHourlyCost } from "@/lib/compute/billing";

interface ResourcePickerProps {
  sizeKey: SizeKey;
  region: Region;
  autoStopMinutes: number;
  persistenceEnabled: boolean;
  onSizeChange: (size: SizeKey) => void;
  onRegionChange: (region: Region) => void;
  onAutoStopChange: (minutes: number) => void;
  onPersistenceChange: (enabled: boolean) => void;
}

export function ResourcePicker({
  sizeKey,
  region,
  autoStopMinutes,
  persistenceEnabled,
  onSizeChange,
  onRegionChange,
  onAutoStopChange,
  onPersistenceChange,
}: ResourcePickerProps) {
  return (
    <div className="space-y-6">
      {/* Size */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">Instance Size</label>
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(SIZE_PRESETS) as [SizeKey, typeof SIZE_PRESETS[SizeKey]][]).map(
            ([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => onSizeChange(key)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  sizeKey === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{preset.label}</span>
                  <span className="text-xs font-medium text-primary">${(estimateHourlyCost(key) / 100).toFixed(2)}/hr</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {preset.disk} GB disk
                </div>
              </button>
            ),
          )}
        </div>
      </div>

      {/* Region */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">Region</label>
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value as Region)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {Object.entries(REGION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Auto-stop */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium">Auto-stop after idle</label>
          <p className="text-xs text-muted-foreground">
            Automatically stop when no activity detected
          </p>
        </div>
        <select
          value={autoStopMinutes}
          onChange={(e) => onAutoStopChange(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={60}>1 hour</option>
          <option value={120}>2 hours</option>
          <option value={0}>Never</option>
        </select>
      </div>

      {/* Persistence */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium">Persistence</label>
          <p className="text-xs text-muted-foreground">
            Keep disk state between stops
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPersistenceChange(!persistenceEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            persistenceEnabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              persistenceEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
