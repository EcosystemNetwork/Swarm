/**
 * Mod Gateway — Subscription Guard.
 *
 * Verifies that an org has an active subscription before allowing
 * access to a paid mod service.
 */

import { getOrgSubscriptions, isSubscriptionActive } from "@/lib/skills";
import { getModService } from "./registry";
import type { ModAccessResult } from "./types";

/**
 * Check whether an org is allowed to use a mod.
 * Free mods always pass. Paid mods require an active subscription.
 */
export async function verifyModAccess(
  orgId: string,
  modSlug: string,
): Promise<ModAccessResult> {
  const mod = await getModService(modSlug);
  if (!mod) return { allowed: false, reason: "Mod not found" };

  // Free mods are always accessible
  if (!mod.pricing || mod.pricing.model === "free") {
    return { allowed: true };
  }

  // Paid mods require an active subscription
  const subs = await getOrgSubscriptions(orgId);
  const active = subs.find(
    (s) =>
      (s.itemId === modSlug || s.itemId === mod.modId || s.itemId === `mod-${modSlug}`) &&
      isSubscriptionActive(s),
  );

  if (!active) {
    return { allowed: false, reason: "Active subscription required" };
  }

  return { allowed: true, subscriptionId: active.id };
}
