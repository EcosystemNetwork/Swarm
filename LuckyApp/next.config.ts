import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy packages out of the serverless function bundle.
  // Netlify/Vercel will resolve them from node_modules at runtime,
  // preventing cold-start timeouts and 502s from oversized bundles.
  serverExternalPackages: ["ethers"],
};

export default nextConfig;
