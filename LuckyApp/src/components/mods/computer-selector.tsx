"use client";

import { useState, useEffect, useCallback } from "react";
import { Monitor, Loader2, RefreshCw } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";

interface ComputerOption {
  id: string;
  name: string;
  status: string;
  sizeKey: string;
  region: string;
}

interface ComputerSelectorProps {
  value: string | null;
  onChange: (computerId: string | null) => void;
}

export function ComputerSelector({ value, onChange }: ComputerSelectorProps) {
  const { currentOrg } = useOrg();
  const [computers, setComputers] = useState<ComputerOption[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComputers = useCallback(async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/compute/computers?orgId=${currentOrg.id}`);
      const data = await res.json();
      if (data.ok) {
        // Only show running computers
        const running = (data.computers || []).filter(
          (c: ComputerOption) => c.status === "running",
        );
        setComputers(running);
      }
    } catch {
      // Silently fail — selector will show demo mode only
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    fetchComputers();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchComputers, 30_000);
    return () => clearInterval(interval);
  }, [fetchComputers]);

  return (
    <div className="flex items-center gap-2">
      <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex-1 h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Demo mode (no computer)</option>
        {computers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.sizeKey} ({c.region})
          </option>
        ))}
      </select>
      <button
        onClick={fetchComputers}
        disabled={loading}
        className="h-9 w-9 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
        title="Refresh computer list"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {value && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Live
        </span>
      )}
    </div>
  );
}
