import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile React Flow to ensure proper bundling (avoids SES lockdown conflicts
  // where the bundler wraps Map/Set in module namespaces that SES can corrupt).
  transpilePackages: ["@xyflow/react", "@xyflow/system"],
  // Keep heavy packages out of the serverless function bundle.
  // Netlify will resolve them from node_modules at runtime,
  // preventing cold-start timeouts and 502s from oversized bundles.
  serverExternalPackages: [
    "ethers",
    "@storacha/client",
    "@azure/arm-compute",
    "@azure/arm-network",
    "@azure/arm-containerinstance",
    "@azure/identity",
  ],
  // Skip TS type checking during build to avoid OOM on Netlify.
  // Run `npx tsc --noEmit` locally or in CI for type safety.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable source maps in production to reduce memory during build.
  productionBrowserSourceMaps: false,
  // Skip ESLint during build to reduce memory on Netlify.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
