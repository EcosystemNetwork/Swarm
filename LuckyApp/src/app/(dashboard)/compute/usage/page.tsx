"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import type { Workspace, UsageSummary } from "@/lib/compute/types";
import { UsageChart } from "@/components/compute/usage-chart";

export default function UsagePage() {
  const { currentOrg } = useOrg();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [summary, setSummary] = useState<UsageSummary>({
    totalComputeHours: 0,
    totalStorageGb: 0,
    totalActions: 0,
    totalSessions: 0,
    estimatedCostCents: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg?.id) return;
    fetch(`/api/compute/workspaces?orgId=${currentOrg.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces);
          setSelectedWorkspace(data.workspaces[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  useEffect(() => {
    if (!selectedWorkspace) return;
    fetch(`/api/compute/usage?workspaceId=${selectedWorkspace}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.summary) setSummary(data.summary);
      })
      .catch(console.error);
  }, [selectedWorkspace]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usage & Billing</h1>
        {workspaces.length > 1 && (
          <select
            value={selectedWorkspace}
            onChange={(e) => setSelectedWorkspace(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        )}
      </div>

      <UsageChart summary={summary} />
    </div>
  );
}
