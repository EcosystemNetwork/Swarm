"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import type { Computer } from "@/lib/compute/types";
import { ComputerCard } from "@/components/compute/computer-card";

export default function ComputersListPage() {
  const { currentOrg } = useOrg();
  const [computers, setComputers] = useState<Computer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!currentOrg?.id) return;
    fetch(`/api/compute/computers?orgId=${currentOrg.id}`)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setComputers(data.computers); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  const handleLifecycle = async (id: string, action: "start" | "stop" | "restart") => {
    const res = await fetch(`/api/compute/computers/${id}/${action}`, { method: "POST" });
    if (res.ok) {
      // Refresh list
      const data = await fetch(`/api/compute/computers?orgId=${currentOrg?.id}`).then((r) => r.json());
      if (data.ok) setComputers(data.computers);
    }
  };

  const filtered = statusFilter === "all"
    ? computers
    : computers.filter((c) => c.status === statusFilter);

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
        <h1 className="text-2xl font-bold">Computers</h1>
        <Link
          href="/compute/computers/new"
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Computer
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "running", "stopped", "error", "provisioning"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            {computers.length === 0 ? "No computers yet" : "No computers match this filter"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ComputerCard
              key={c.id}
              computer={c}
              onStart={() => handleLifecycle(c.id, "start")}
              onStop={() => handleLifecycle(c.id, "stop")}
              onRestart={() => handleLifecycle(c.id, "restart")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
