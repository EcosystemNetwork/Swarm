"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, DollarSign, TrendingUp, Server, Users } from "lucide-react";
import type { PricingSettings, ProfitabilitySummary } from "@/lib/compute/types";

export default function ComputeAdminPage() {
  const [pricing, setPricing] = useState<PricingSettings | null>(null);
  const [profit, setProfit] = useState<ProfitabilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Pricing form state
  const [defaultMarkup, setDefaultMarkup] = useState(30);
  const [smallMarkup, setSmallMarkup] = useState("");
  const [mediumMarkup, setMediumMarkup] = useState("");
  const [largeMarkup, setLargeMarkup] = useState("");
  const [xlMarkup, setXlMarkup] = useState("");
  const [minFloor, setMinFloor] = useState(1);

  const adminSecret = typeof window !== "undefined"
    ? localStorage.getItem("platformAdminSecret") || ""
    : "";
  const [secret, setSecret] = useState(adminSecret);
  const [authed, setAuthed] = useState(!!adminSecret);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-platform-secret": secret,
  };

  const fetchData = async () => {
    setError("");
    try {
      const [pRes, profRes] = await Promise.all([
        fetch("/api/compute/admin/pricing", { headers }),
        fetch("/api/compute/admin/profitability", { headers }),
      ]);

      if (pRes.status === 403) {
        setAuthed(false);
        setError("Invalid admin credentials");
        setLoading(false);
        return;
      }

      const pData = await pRes.json();
      const profData = await profRes.json();

      if (pData.ok) {
        setPricing(pData.settings);
        setDefaultMarkup(pData.settings.defaultMarkupPercent);
        setSmallMarkup(pData.settings.sizeOverrides?.small?.toString() ?? "");
        setMediumMarkup(pData.settings.sizeOverrides?.medium?.toString() ?? "");
        setLargeMarkup(pData.settings.sizeOverrides?.large?.toString() ?? "");
        setXlMarkup(pData.settings.sizeOverrides?.xl?.toString() ?? "");
        setMinFloor(pData.settings.minimumPriceFloorCents);
      }
      if (profData.ok) setProfit(profData.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authed) fetchData();
    else setLoading(false);
  }, [authed]);

  const handleAuth = () => {
    if (!secret.trim()) return;
    localStorage.setItem("platformAdminSecret", secret);
    setAuthed(true);
    setLoading(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const sizeOverrides: Record<string, number> = {};
    if (smallMarkup) sizeOverrides.small = Number(smallMarkup);
    if (mediumMarkup) sizeOverrides.medium = Number(mediumMarkup);
    if (largeMarkup) sizeOverrides.large = Number(largeMarkup);
    if (xlMarkup) sizeOverrides.xl = Number(xlMarkup);

    await fetch("/api/compute/admin/pricing", {
      method: "POST",
      headers,
      body: JSON.stringify({
        defaultMarkupPercent: defaultMarkup,
        sizeOverrides,
        minimumPriceFloorCents: minFloor,
      }),
    });
    await fetchData();
    setSaving(false);
  };

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (!authed) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">Compute Admin</h1>
        <p className="text-sm text-muted-foreground">Enter platform admin secret to continue</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            placeholder="Admin secret"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm w-64"
          />
          <button onClick={handleAuth} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Login
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <Link href="/compute" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
          <ChevronLeft className="h-3 w-3" /> Compute
        </Link>
        <h1 className="text-2xl font-bold">Compute Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform pricing and profitability</p>
      </div>

      {/* Profitability Cards */}
      {profit && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Server className="h-4 w-4" />
              <span className="text-xs">Provider Cost</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{fmt(profit.totalProviderCostCents)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Revenue</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{fmt(profit.totalCustomerRevenueCents)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Profit</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-400">{fmt(profit.totalPlatformProfitCents)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs">Margin</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{profit.marginPercent}%</p>
          </div>
        </div>
      )}

      {/* By Provider */}
      {profit && Object.keys(profit.entriesByProvider).length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium mb-3">By Provider</h3>
          <div className="divide-y divide-border">
            {Object.entries(profit.entriesByProvider).map(([provider, data]) => (
              <div key={provider} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium capitalize">{provider}</span>
                <div className="flex gap-6 text-xs">
                  <span className="text-muted-foreground">Cost: {fmt(data.cost)}</span>
                  <span className="text-muted-foreground">Revenue: {fmt(data.revenue)}</span>
                  <span className="text-emerald-400">Profit: {fmt(data.profit)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Size */}
      {profit && Object.keys(profit.entriesBySize).length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium mb-3">By Size</h3>
          <div className="divide-y divide-border">
            {Object.entries(profit.entriesBySize).map(([size, data]) => (
              <div key={size} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium capitalize">{size}</span>
                <div className="flex gap-6 text-xs">
                  <span className="text-muted-foreground">Cost: {fmt(data.cost)}</span>
                  <span className="text-muted-foreground">Revenue: {fmt(data.revenue)}</span>
                  <span className="text-emerald-400">Profit: {fmt(data.profit)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing Settings */}
      <div className="rounded-lg border border-border p-6 max-w-lg space-y-4">
        <h3 className="text-lg font-semibold">Pricing Settings</h3>

        <div>
          <label className="text-sm font-medium mb-1 block">Default Markup (%)</label>
          <input
            type="number"
            value={defaultMarkup}
            onChange={(e) => setDefaultMarkup(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Small Override (%)</label>
            <input
              type="number"
              value={smallMarkup}
              onChange={(e) => setSmallMarkup(e.target.value)}
              placeholder="Default"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Medium Override (%)</label>
            <input
              type="number"
              value={mediumMarkup}
              onChange={(e) => setMediumMarkup(e.target.value)}
              placeholder="Default"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Large Override (%)</label>
            <input
              type="number"
              value={largeMarkup}
              onChange={(e) => setLargeMarkup(e.target.value)}
              placeholder="Default"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">XL Override (%)</label>
            <input
              type="number"
              value={xlMarkup}
              onChange={(e) => setXlMarkup(e.target.value)}
              placeholder="Default"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Minimum Price Floor (cents)</label>
          <input
            type="number"
            value={minFloor}
            onChange={(e) => setMinFloor(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Pricing Settings"}
        </button>
      </div>

      {/* No data state */}
      {profit && profit.totalEntries === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No billing ledger entries yet this month.</p>
          <p className="text-xs text-muted-foreground mt-1">Entries are recorded when computers are started with a real provider.</p>
        </div>
      )}
    </div>
  );
}
