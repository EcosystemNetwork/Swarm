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

    // Validate environment variables — log warnings for missing vars
    try {
      requireValidEnv();
      printEnvSummary();
    } catch {
      // In serverless environments (e.g. Netlify), process.exit(1) is fatal
      // and prevents the function from ever handling requests. Log the errors
      // but allow the server to start — routes needing missing vars will
      // return proper error responses individually.
      console.warn("\n⚠️  Server starting with environment validation errors.");
      console.warn("Some features may be unavailable until missing vars are configured.\n");
    }

    console.log("\n✅ Server instrumentation complete\n");
  }
}
