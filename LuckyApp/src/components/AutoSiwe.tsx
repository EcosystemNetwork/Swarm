/**
 * AutoSiwe — Global component that auto-triggers SIWE signing after wallet connect.
 * Place inside both ThirdwebProvider and SessionProvider in the layout.
 * Renders nothing — just runs the useAutoSiwe hook.
 */
"use client";

import { useAutoSiwe } from "@/hooks/useAutoSiwe";

export function AutoSiwe() {
  useAutoSiwe();
  return null;
}
