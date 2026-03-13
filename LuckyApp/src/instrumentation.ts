/**
 * Next.js Instrumentation — Server Startup Hooks
 *
 * This file runs once when the Next.js server starts (or when Edge runtime initializes).
 * Use it for:
 * - Environment validation
 * - Telemetry setup
 * - Database connection pools
 * - Cache warming
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { requireValidEnv, printEnvSummary } from "@/lib/env-validation";

/**
 * Register function runs once on server startup.
 * IMPORTANT: This only runs in Node.js runtime (not Edge runtime).
 */
export async function register() {
  // Only run on server (not in client bundles or Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("🚀 Swarm server starting...\n");

    // Validate environment variables — throws if critical vars missing
    try {
      requireValidEnv();
      printEnvSummary();
    } catch (err) {
      console.error("\n❌ Server startup failed due to environment validation errors");
      console.error("Fix the issues above and restart the server.\n");
      process.exit(1); // Hard exit — prevent server from starting with invalid config
    }

    console.log("\n✅ Server instrumentation complete\n");
  }
}
