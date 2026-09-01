import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // emits .next/standalone so the Docker runner image stays small
  output: "standalone",
};

export default nextConfig;
