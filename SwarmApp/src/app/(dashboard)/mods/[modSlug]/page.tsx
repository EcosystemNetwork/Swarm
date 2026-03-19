/**
 * Dynamic Mod Page — Loads remote mod UI via ModFrame.
 *
 * For mods deployed as separate services, this page:
 * 1. Looks up the mod in the service registry
 * 2. Checks subscription access
 * 3. Renders the mod's UI in an iframe via ModFrame
 *
 * Static pages (e.g., /mods/gemini, /mods/nova) take precedence
 * over this catch-all during the transition period.
 */
"use client";

import { useEffect, useState, use } from "react";
import { Sparkles, Lock, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/contexts/OrgContext";
import { useSession } from "@/contexts/SessionContext";
import { useActiveAccount } from "thirdweb/react";
import { ModFrame } from "@/components/mods/mod-frame";
import Link from "next/link";
import type { ModServiceEntry } from "@/lib/mod-gateway/types";

export default function DynamicModPage({ params }: { params: Promise<{ modSlug: string }> }) {
  const { modSlug } = use(params);
  const { currentOrg } = useOrg();
  const account = useActiveAccount();
  const { address: sessionAddress } = useSession();
  const wallet = account?.address || sessionAddress || "";

  const [mod, setMod] = useState<ModServiceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentOrg) return;

    async function loadMod() {
      try {
        // Try to fetch mod info from the gateway registry
        const res = await fetch(`/api/v1/mods/${modSlug}/health`, {
          headers: {
            "x-wallet-address": wallet,
            "x-org-id": currentOrg!.id,
          },
        });

        if (res.status === 403) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        if (res.status === 404) {
          setError("Mod not found. It may not be installed or the service is not registered.");
          setLoading(false);
          return;
        }

        if (!res.ok) {
          setError("Failed to reach mod service");
          setLoading(false);
          return;
        }

        // Fetch mod metadata from registry
        const registryRes = await fetch(`/api/v1/mods/register?slug=${modSlug}`);
        if (registryRes.ok) {
          const data = await registryRes.json();
          setMod(data.mod);
        }
      } catch {
        setError("Failed to load mod");
      } finally {
        setLoading(false);
      }
    }

    loadMod();
  }, [modSlug, currentOrg, wallet]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          <span className="text-sm text-muted-foreground">Loading mod...</span>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Lock className="h-7 w-7 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Subscription Required</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            This mod requires an active subscription. Visit the marketplace to subscribe.
          </p>
        </div>
        <Link href="/market">
          <Button>
            <Sparkles className="h-4 w-4 mr-2" />
            Go to Marketplace
          </Button>
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-center gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <div>
          <h2 className="text-xl font-semibold">Mod Unavailable</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">{error}</p>
        </div>
        <Link href="/market">
          <Button variant="outline">Back to Marketplace</Button>
        </Link>
      </div>
    );
  }

  if (!mod) {
    // Fallback: try loading via direct service URL from registry
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Sparkles className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold capitalize">{modSlug}</h1>
            <p className="text-sm text-muted-foreground">Remote mod service</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Mod service registered but no UI manifest available. API access is available via the gateway.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-lg">
          {mod.icon}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{mod.name}</h1>
          <p className="text-sm text-muted-foreground">{mod.description}</p>
        </div>
      </div>

      {/* Mod UI iframe */}
      {mod.uiManifest?.entrypoint ? (
        <ModFrame
          modSlug={modSlug}
          serviceUrl={mod.serviceUrl}
          orgId={currentOrg?.id || ""}
          wallet={wallet}
        />
      ) : (
        <div className="rounded-xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          This mod provides API-only access. No UI available.
        </div>
      )}
    </div>
  );
}
