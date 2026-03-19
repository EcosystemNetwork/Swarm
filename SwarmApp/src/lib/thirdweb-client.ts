/**
 * Shared thirdweb client — single source of truth for client configuration.
 *
 * Fails fast if NEXT_PUBLIC_THIRDWEB_CLIENT_ID is missing so misconfiguration
 * is caught immediately instead of silently falling back to a baked-in ID.
 */
import { createThirdwebClient } from "thirdweb";

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;

if (!clientId) {
  throw new Error(
    "NEXT_PUBLIC_THIRDWEB_CLIENT_ID is required. " +
    "Set it in .env.local or your deployment environment."
  );
}

export const thirdwebClient = createThirdwebClient({ clientId });
