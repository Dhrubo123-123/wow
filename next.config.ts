import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root: this repo lives under the user's home
  // directory, which has an unrelated lockfile that Turbopack would
  // otherwise try (and fail) to infer a monorepo root from.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
