"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";
import { initPostHog, identifyUser, resetUser, trackEvent } from "@/lib/posthog";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { authenticated, address } = useSession();

  // Initialize PostHog on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Identify / reset user on auth change
  useEffect(() => {
    if (authenticated && address) {
      identifyUser(address, { wallet: address });
    } else if (!authenticated) {
      resetUser();
    }
  }, [authenticated, address]);

  // Track page views on route change
  useEffect(() => {
    if (!pathname) return;
    const url = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    trackEvent("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
