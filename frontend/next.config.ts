import type { NextConfig } from "next";
import path from "path";

// outputFileTracingRoot points to the monorepo root so the standalone build
// traces deps from the workspace root node_modules (required with pnpm shamefully-hoist).

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;