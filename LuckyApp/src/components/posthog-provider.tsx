"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog, trackEvent } from "@/lib/posthog";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize PostHog on mount
  useEffect(() => {
    initPostHog();
  }, []);

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
